import { prisma } from '../lib/prisma'
import { generateNo, toNumber } from '../lib/utils'
import { getSettingNumber } from './settings.service'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { resolveBraceletBinding } from '../lib/bracelet-bind'
import { clampPage, clampPageSize } from '../lib/pagination'
import { startOfDay, endOfDay } from '../lib/utils'
import { saleProfitRow } from './stats.service'

export async function calculateSaleCost(braceletId: number) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id: braceletId } })
  if (!bracelet) throw new Error('镯子不存在')

  const inboundCost = toNumber(bracelet.inboundCost)
  const certificateFee = await getSettingNumber('default_certificate_fee', 3)
  const packageFee = await getSettingNumber('default_package_fee', 10)
  const expressFee = await getSettingNumber('default_sf_express_fee', 18)

  const adjustments = await prisma.costAdjustment.findMany({ where: { braceletId } })
  const costAdjustment = adjustments.reduce((s, a) => s + toNumber(a.amount), 0)

  const totalCost = inboundCost + certificateFee + packageFee + expressFee + costAdjustment

  return {
    inboundCost,
    certificateFee,
    packageFee,
    expressFee,
    costAdjustment,
    totalCost,
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
  if (!input.saleAmount || input.saleAmount <= 0) throw new Error('销售金额必须大于 0')

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
  const grossProfit = input.saleAmount - cost.totalCost
  const deposit = input.depositAmount ?? 0
  const finalPayment = input.finalPaymentAmount ?? input.saleAmount
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
      saleAmount: input.saleAmount,
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
      finalProfit: grossProfit,
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
    await prisma.sale.update({
      where: { id },
      data: {
        compensationAmount: profitRow.compensationAmount,
        finalProfit: profitRow.profit,
      },
    })
    sale.compensationAmount = profitRow.compensationAmount as unknown as typeof sale.compensationAmount
    sale.finalProfit = profitRow.profit as unknown as typeof sale.finalProfit
  }

  return {
    ...sale,
    ...profitRow,
    finalProfit: profitRow.profit,
  }
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
        expenses: {
          where: { isVoided: false, expenseType: { in: ['客户补偿', '售后补偿'] } },
        },
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

  const refund = await prisma.refund.create({
    data: {
      saleId,
      braceletId: sale.braceletId,
      braceletCode: sale.braceletCode,
      refundAmount: input.refundAmount,
      refundReason: input.refundReason,
      refundedAt: input.refundedAt ? new Date(input.refundedAt) : new Date(),
      createdBy: operator!.userId,
    },
  })

  await prisma.sale.update({
    where: { id: saleId },
    data: { status: 'refunded' },
  })

  await prisma.bracelet.update({
    where: { id: sale.braceletId },
    data: { scannerStatus: 'returned_available' },
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

  return { sale: await getSale(saleId), refund }
}

export async function createCostAdjustment(
  input: { braceletId: number; braceletCode: string; amount: number; reason: string },
  operator: AuthRequest['user'],
) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id: input.braceletId } })
  if (!bracelet) throw new Error('镯子不存在')

  const cost = await calculateSaleCost(input.braceletId)
  const beforeTotal = cost.totalCost
  const afterTotal = beforeTotal + input.amount

  const record = await prisma.costAdjustment.create({
    data: {
      braceletId: input.braceletId,
      braceletCode: input.braceletCode,
      amount: input.amount,
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
