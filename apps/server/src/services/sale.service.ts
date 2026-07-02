import { prisma } from '../lib/prisma'
import { generateNo, toNumber } from '../lib/utils'
import { parseMoneyInput } from '../lib/money'
import { isConfirmedRefund } from '@jade-account/shared'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { getEntityOperationLogs, resolveUserBrief } from './audit.service'
import { resolveBraceletBinding } from '../lib/bracelet-bind'
import { clampPage, clampPageSize } from '../lib/pagination'
import { startOfDay, endOfDay } from '../lib/utils'
import {
  saleProfitRow,
  calculateProfit,
  calculateSaleCost,
  syncSaleLedger,
  syncRefundLedger,
  PROFIT_DEDUCT_EXPENSE_INCLUDE,
} from '../finance/core-ledger'

export { calculateSaleCost } from '../finance/core-ledger'

async function enrichSaleWithAudit<T extends { id: number; createdBy: number }>(sale: T) {
  const [createdByUser, operationLogs] = await Promise.all([
    resolveUserBrief(sale.createdBy),
    getEntityOperationLogs('sale', sale.id),
  ])
  return {
    ...sale,
    createdByUser: createdByUser || { displayName: '历史数据，未记录操作人' },
    operationLogs,
  }
}

export async function createSale(
  input: {
    platform: string
    externalOrderNo?: string
    logisticsNo?: string
    customerName?: string
    customerRemark?: string
    braceletCode: string
    braceletId?: number
    saleAmount: number
    depositAmount?: number
    finalPaymentAmount?: number
    unpaidAmount?: number
    soldAt: string
    remark?: string
  },
  operator: AuthRequest['user'],
) {
  if (!input.saleAmount && input.saleAmount !== 0) throw new Error('销售金额必须大于 0')
  const saleAmount = parseMoneyInput(input.saleAmount, '销售金额')

  const binding = await resolveBraceletBinding(input.braceletCode, input.braceletId, operator)
  const braceletId = binding.braceletId
  const code = binding.braceletCode || input.braceletCode.trim()
  if (!braceletId) {
    throw new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
  }

  const existingSold = await prisma.sale.findFirst({
    where: { braceletId, status: { in: ['sold', 'customer_hold'] } },
  })
  if (existingSold) {
    const err = new Error('这只镯子已经登记销售，不能重复卖。')
    ;(err as Error & { code: string; statusCode: number }).code = 'SALE_DUPLICATE'
    ;(err as Error & { statusCode: number }).statusCode = 409
    throw err
  }

  const cost = await calculateSaleCost(braceletId)
  const grossProfit = saleAmount - cost.totalCost
  const initialProfit = calculateProfit({
    saleAmount,
    totalCostSnapshot: cost.totalCost,
    grossProfit,
    refunds: [],
    expenses: [],
  })
  const deposit = input.depositAmount ?? 0
  const finalPayment = input.finalPaymentAmount ?? saleAmount
  const unpaid = input.unpaidAmount ?? 0

  const sale = await prisma.sale.create({
    data: {
      saleNo: generateNo('SL'),
      platform: input.platform,
      externalOrderNo: input.externalOrderNo,
      logisticsNo: input.logisticsNo?.trim() || null,
      customerName: input.customerName,
      customerRemark: input.customerRemark || input.remark,
      braceletId,
      braceletCode: code,
      saleAmount,
      depositAmount: deposit,
      finalPaymentAmount: finalPayment,
      unpaidAmount: unpaid,
      inboundCostSnapshot: cost.inboundCost,
      certificateFeeSnapshot: cost.certificateFee,
      packageFeeSnapshot: cost.packageFee,
      expressFeeSnapshot: cost.expressFee,
      costAdjustmentSnapshot: cost.costAdjustment,
      totalCostSnapshot: cost.totalCost,
      grossProfit,
      compensationAmount: 0,
      finalProfit: initialProfit.netProfit,
      soldAt: new Date(input.soldAt),
      status: 'sold',
      isTrialRun: false,
      createdBy: operator!.userId,
    },
  })

  await prisma.bracelet.update({
    where: { id: braceletId },
    data: { scannerStatus: 'sold' },
  })

  await writeOperationLog({
    module: 'sale',
    action: 'create_sale',
    targetType: 'sale',
    targetId: sale.id,
    targetCode: sale.saleNo,
    afterJson: sale,
    operator,
  })

  await syncSaleLedger(sale.id)
  return getSale(sale.id)
}

export async function getSale(id: number) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      bracelet: true,
      expenses: {
        where: { isVoided: false },
        include: { attachments: { include: { file: true } } },
      },
      refunds: true,
    },
  })
  if (!sale) return null

  const profitRow = saleProfitRow({
    ...sale,
    expenses: sale.expenses,
  })

  if (
    profitRow.compensationAmount !== toNumber(sale.compensationAmount)
    || profitRow.profit !== toNumber(sale.finalProfit)
  ) {
    await syncSaleLedger(id)
    const refreshed = await prisma.sale.findUnique({
      where: { id },
      include: {
        bracelet: true,
        expenses: { where: { isVoided: false }, include: { attachments: { include: { file: true } } } },
        refunds: true,
      },
    })
    if (refreshed) {
      const row = saleProfitRow({ ...refreshed, expenses: refreshed.expenses })
      return enrichSaleWithAudit({ ...refreshed, ...row, finalProfit: row.profit })
    }
  }

  return enrichSaleWithAudit({
    ...sale,
    ...profitRow,
    finalProfit: profitRow.profit,
  })
}

export async function listSales(filter: {
  page?: number
  pageSize?: number
  platform?: string
  braceletCode?: string
  status?: string
  afterSaleStatus?: string
  startDate?: string
  endDate?: string
  logisticsNo?: string
  externalOrderNo?: string
}) {
  const page = clampPage(filter.page)
  const pageSize = clampPageSize(filter.pageSize)
  const where: Record<string, unknown> = { isTrialRun: false }
  if (filter.platform) where.platform = filter.platform
  if (filter.braceletCode) where.braceletCode = { contains: filter.braceletCode }
  if (filter.status) where.status = filter.status
  if (filter.afterSaleStatus) where.afterSaleStatus = filter.afterSaleStatus
  if (filter.logisticsNo) where.logisticsNo = { contains: filter.logisticsNo }
  if (filter.externalOrderNo) where.externalOrderNo = { contains: filter.externalOrderNo }
  if (filter.startDate || filter.endDate) {
    where.soldAt = {}
    if (filter.startDate) (where.soldAt as Record<string, Date>).gte = startOfDay(new Date(filter.startDate))
    if (filter.endDate) (where.soldAt as Record<string, Date>).lte = endOfDay(new Date(filter.endDate))
  }

  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        refunds: true,
        expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE,
      },
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ])
  const items = rows.map((s) => {
    const profitRow = saleProfitRow(s)
    return {
      ...s,
      ...profitRow,
      finalProfit: profitRow.profit,
    }
  })
  return { items, total, page, pageSize }
}

export async function refundSale(
  saleId: number,
  input: { refundAmount: number; refundReason?: string; refundedAt?: string },
  operator: AuthRequest['user'],
) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } })
  if (!sale) throw new Error('销售记录不存在')
  if (sale.status === 'refunded') {
    throw new Error('这笔销售已经退款过了，不能重复退款')
  }
  if (sale.status !== 'sold') {
    throw new Error('只有已成交的销售记录才能退款')
  }

  const existingRefunds = await prisma.refund.findMany({ where: { saleId } })
  if (existingRefunds.some((r) => isConfirmedRefund(r.status))) {
    throw new Error('这笔销售已有退款记录，不能重复扣减利润')
  }

  const refundAmount = parseMoneyInput(input.refundAmount, '退款金额')

  const refund = await prisma.$transaction(async (tx) => {
    const currentSale = await tx.sale.findUnique({ where: { id: saleId } })
    if (!currentSale) throw new Error('销售记录不存在')
    if (currentSale.status === 'refunded') {
      throw new Error('这笔销售已经退款过了，不能重复退款')
    }
    if (currentSale.status !== 'sold') {
      throw new Error('只有已成交的销售记录才能退款')
    }

    const refundsInTx = await tx.refund.findMany({ where: { saleId } })
    if (refundsInTx.some((r) => isConfirmedRefund(r.status))) {
      throw new Error('这笔销售已有退款记录，不能重复扣减利润')
    }

    const created = await tx.refund.create({
      data: {
        saleId,
        braceletId: currentSale.braceletId,
        braceletCode: currentSale.braceletCode,
        refundAmount,
        refundReason: input.refundReason,
        refundedAt: input.refundedAt ? new Date(input.refundedAt) : new Date(),
        createdBy: operator!.userId,
      },
    })

    await tx.sale.update({
      where: { id: saleId },
      data: { status: 'refunded' },
    })

    await tx.bracelet.update({
      where: { id: currentSale.braceletId },
      data: { scannerStatus: 'returned_available' },
    })

    return created
  })

  await writeOperationLog({
    module: 'sale',
    action: 'refund_sale',
    targetType: 'sale',
    targetId: saleId,
    targetCode: sale.saleNo,
    afterJson: refund,
    operator,
  })

  await syncRefundLedger(refund.id)
  return { sale: await getSale(saleId), refund }
}

export async function createCostAdjustment(
  input: { braceletId: number; braceletCode: string; amount: number; reason: string },
  operator: AuthRequest['user'],
) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id: input.braceletId } })
  if (!bracelet) throw new Error('镯子不存在')

  const adjustmentAmount = parseMoneyInput(input.amount, '调整金额', { allowNegative: true })

  const cost = await calculateSaleCost(input.braceletId)
  const beforeTotal = cost.totalCost
  const afterTotal = beforeTotal + adjustmentAmount

  const record = await prisma.costAdjustment.create({
    data: {
      braceletId: input.braceletId,
      braceletCode: input.braceletCode,
      amount: adjustmentAmount,
      reason: input.reason,
      beforeTotalCost: beforeTotal,
      afterTotalCost: afterTotal,
      createdBy: operator!.userId,
    },
  })

  await writeOperationLog({
    module: 'cost',
    action: 'create_cost_adjustment',
    targetType: 'bracelet',
    targetId: input.braceletId,
    targetCode: input.braceletCode,
    beforeJson: { totalCost: beforeTotal },
    afterJson: { totalCost: afterTotal, adjustment: record },
    operator,
  })

  return record
}

export async function lookupSales(filter: {
  externalOrderNo?: string
  logisticsNo?: string
  braceletCode?: string
  keyword?: string
}) {
  const where: Record<string, unknown> = { isTrialRun: false }
  const or: Record<string, unknown>[] = []

  if (filter.externalOrderNo?.trim()) {
    or.push({ externalOrderNo: filter.externalOrderNo.trim() })
  }
  if (filter.logisticsNo?.trim()) {
    or.push({ logisticsNo: { contains: filter.logisticsNo.trim() } })
  }
  if (filter.braceletCode?.trim()) {
    or.push({ braceletCode: { contains: filter.braceletCode.trim().toUpperCase() } })
  }
  if (filter.keyword?.trim()) {
    const kw = filter.keyword.trim()
    or.push(
      { externalOrderNo: { contains: kw } },
      { logisticsNo: { contains: kw } },
      { braceletCode: { contains: kw } },
      { customerName: { contains: kw } },
      { saleNo: { contains: kw } },
    )
  }

  if (!or.length) return []

  where.OR = or

  const sales = await prisma.sale.findMany({
    where,
    include: {
      refunds: true,
      expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE,
    },
    orderBy: { soldAt: 'desc' },
    take: 20,
  })

  return sales.map((s) => {
    const profitRow = saleProfitRow(s)
    return {
      saleId: s.id,
      platform: s.platform,
      externalOrderNo: s.externalOrderNo,
      logisticsNo: s.logisticsNo,
      saleAmount: profitRow.saleAmount,
      afterSaleStatus: s.afterSaleStatus,
      status: s.status,
      braceletId: s.braceletId,
      braceletCode: s.braceletCode,
      customerName: s.customerName,
      profit: profitRow.profit,
      profitMargin: profitRow.profitMargin,
      refundAmount: profitRow.refundAmount,
      customerPaymentDeduction: profitRow.customerPaymentDeduction,
      soldAt: s.soldAt,
    }
  })
}
