import {
  detectScanCodeType,
  scanTypeHumanLabel,
  scanTypeRecognizeMessage,
  type ScanType,
} from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { generateNo, toNumber } from '../lib/utils'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { findBraceletByExactCode } from './bracelet.service'
import {
  createGoodsFromScan,
  getGoodsByCode,
  getGoodsById,
  presentGoods,
  refreshBraceletCostTotal,
} from './goods.service'
import { calculateSaleCost } from './sale.service'

export type ScanSource = 'scanner' | 'manual' | 'paste'

function presentOrder(sale: {
  id: number
  saleNo: string
  externalOrderNo: string | null
  logisticsNo: string | null
  status: string
  afterSaleStatus: string | null
  braceletId: number
  braceletCode: string
  saleAmount: unknown
  soldAt: Date
}) {
  return {
    id: sale.id,
    orderNo: sale.externalOrderNo || sale.saleNo,
    saleNo: sale.saleNo,
    logisticsNo: sale.logisticsNo,
    orderStatus: sale.status,
    afterSaleStatus: sale.afterSaleStatus,
    braceletId: sale.braceletId,
    braceletCode: sale.braceletCode,
    saleAmount: toNumber(sale.saleAmount as string | number),
    soldAt: sale.soldAt,
  }
}

async function findOrderByNo(code: string) {
  return prisma.sale.findFirst({
    where: {
      OR: [
        { externalOrderNo: code },
        { saleNo: code },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function findOrderByLogistics(code: string) {
  return prisma.sale.findFirst({
    where: { logisticsNo: code },
    orderBy: { createdAt: 'desc' },
  })
}

function buildNextActions(input: {
  scanType: ScanType
  matched: boolean
  goods?: ReturnType<typeof presentGoods> | null
  order?: ReturnType<typeof presentOrder> | null
}) {
  const actions: string[] = []
  const { scanType, matched, goods, order } = input

  if (scanType === 'goods_code') {
    if (matched && goods) {
      actions.push('bind_order', 'create_expense', 'view_cost')
    } else {
      actions.push('create_goods')
    }
  } else if (scanType === 'order_no') {
    if (matched && order) {
      actions.push(order.braceletId ? 'view_goods' : 'bind_goods', 'create_expense')
    } else {
      actions.push('create_order', 'bind_goods')
    }
  } else if (scanType === 'logistics_no') {
    if (matched && order) {
      actions.push('view_order', 'view_goods')
    } else {
      actions.push('bind_order', 'create_binding')
    }
  } else {
    actions.push('create_goods', 'bind_goods', 'bind_order')
  }
  return [...new Set(actions)]
}

function buildSuggestion(input: {
  scanType: ScanType
  matched: boolean
  goods?: ReturnType<typeof presentGoods> | null
  order?: ReturnType<typeof presentOrder> | null
}) {
  const { scanType, matched, goods, order } = input
  if (scanType === 'goods_code') {
    if (matched && goods) return `已找到货品「${goods.name}」，可以绑定订单或记支出`
    return '暂时没找到对应记录，可以新建货品'
  }
  if (scanType === 'order_no') {
    if (matched && order) {
      return order.braceletId
        ? `已找到订单，已绑定货品 ${order.braceletCode}`
        : '这个订单还没绑定货品，可以选择货品编码绑定'
    }
    return '暂时没找到这个订单，可以先创建简化订单记录'
  }
  if (scanType === 'logistics_no') {
    if (matched && order) return '物流单号已匹配到订单，可查看关联货品'
    return '暂时没找到对应订单，可以先保存绑定记录'
  }
  return '暂时没找到对应记录，可以新建绑定'
}

async function recordScan(input: {
  scanCode: string
  scanType: ScanType
  source: ScanSource
  braceletId?: number | null
  saleId?: number | null
  note?: string
  createdBy?: number
}) {
  return prisma.scanBinding.create({
    data: {
      scanCode: input.scanCode,
      scanType: input.scanType,
      source: input.source,
      braceletId: input.braceletId ?? null,
      saleId: input.saleId ?? null,
      note: input.note,
      createdBy: input.createdBy,
    },
  })
}

export async function recognizeScanCode(code: string, source: ScanSource = 'manual') {
  const { scanType, normalizedCode } = detectScanCodeType(code)
  const message = scanTypeRecognizeMessage(scanType, normalizedCode)

  let goods: ReturnType<typeof presentGoods> | null = null
  let order: ReturnType<typeof presentOrder> | null = null
  let matched = false

  if (scanType === 'goods_code' || scanType === 'unknown') {
    goods = await getGoodsByCode(normalizedCode)
    if (goods) matched = true
  }

  if (scanType === 'order_no') {
    const sale = await findOrderByNo(normalizedCode)
    if (sale) {
      order = presentOrder(sale)
      matched = true
      goods = await getGoodsById(sale.braceletId)
    }
  }

  if (scanType === 'logistics_no') {
    const sale = await findOrderByLogistics(normalizedCode)
    if (sale) {
      order = presentOrder(sale)
      matched = true
      goods = await getGoodsById(sale.braceletId)
    }
  }

  if (scanType === 'goods_code' && !matched) {
    const bracelet = await findBraceletByExactCode(normalizedCode)
    if (bracelet) {
      goods = await getGoodsById(bracelet.id)
      matched = !!goods
    }
  }

  const nextActions = buildNextActions({ scanType, matched, goods, order })
  const suggestion = buildSuggestion({ scanType, matched, goods, order })

  await recordScan({
    scanCode: normalizedCode,
    scanType,
    source,
    braceletId: goods?.id ?? order?.braceletId ?? null,
    saleId: order?.id ?? null,
  })

  return {
    scanType,
    scanTypeLabel: scanTypeHumanLabel(scanType),
    normalizedCode,
    message,
    matched,
    goods,
    order,
    suggestion,
    nextActions,
    source,
  }
}

export async function bindScan(input: {
  scanCode: string
  scanType?: ScanType
  goodsId?: number
  orderId?: number
  note?: string
  source?: ScanSource
}, operator: AuthRequest['user']) {
  const source = input.source || 'manual'
  const detected = input.scanType
    ? { scanType: input.scanType, normalizedCode: input.scanCode.trim().toUpperCase() }
    : detectScanCodeType(input.scanCode)

  const { scanType, normalizedCode } = detected
  if (!normalizedCode) throw new Error('编码不能为空')

  if (input.goodsId && input.orderId) {
    const sale = await prisma.sale.findUnique({ where: { id: input.orderId } })
    const goods = await prisma.bracelet.findUnique({ where: { id: input.goodsId } })
    if (!sale) throw new Error('没找到这个订单')
    if (!goods) throw new Error('没找到这个货品')

    const dup = await prisma.scanBinding.findFirst({
      where: {
        scanCode: normalizedCode,
        braceletId: input.goodsId,
        saleId: input.orderId,
      },
    })
    if (dup) throw new Error('这个编码已经绑定过了')

    await prisma.sale.update({
      where: { id: input.orderId },
      data: {
        braceletId: input.goodsId,
        braceletCode: goods.braceletCode,
        externalOrderNo: sale.externalOrderNo || normalizedCode,
      },
    })

    const binding = await recordScan({
      scanCode: normalizedCode,
      scanType,
      source,
      braceletId: input.goodsId,
      saleId: input.orderId,
      note: input.note,
      createdBy: operator?.userId,
    })

    await writeOperationLog({
      module: 'scan',
      action: 'bind_scan',
      targetType: 'scan_binding',
      targetId: binding.id,
      targetCode: normalizedCode,
      operator,
    })

    return {
      binding,
      goods: await getGoodsById(input.goodsId),
      order: presentOrder(await prisma.sale.findUniqueOrThrow({ where: { id: input.orderId } })),
    }
  }

  if (input.orderId && scanType === 'logistics_no') {
    const sale = await prisma.sale.findUnique({ where: { id: input.orderId } })
    if (!sale) throw new Error('没找到这个订单')
    await prisma.sale.update({
      where: { id: input.orderId },
      data: { logisticsNo: normalizedCode },
    })
  }

  const binding = await recordScan({
    scanCode: normalizedCode,
    scanType,
    source,
    braceletId: input.goodsId ?? null,
    saleId: input.orderId ?? null,
    note: input.note,
    createdBy: operator?.userId,
  })

  return {
    binding,
    goods: input.goodsId ? await getGoodsById(input.goodsId) : null,
    order: input.orderId
      ? presentOrder(await prisma.sale.findUniqueOrThrow({ where: { id: input.orderId } }))
      : null,
  }
}

export async function listRecentScans(limit = 20) {
  const rows = await prisma.scanBinding.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      bracelet: true,
      sale: true,
    },
  })
  return rows.map((row) => ({
    id: row.id,
    scanCode: row.scanCode,
    scanType: row.scanType,
    scanTypeLabel: scanTypeHumanLabel(row.scanType as ScanType),
    source: row.source,
    note: row.note,
    goods: row.bracelet ? presentGoods(row.bracelet) : null,
    order: row.sale ? presentOrder(row.sale) : null,
    bound: !!(row.braceletId || row.saleId),
    createdAt: row.createdAt,
  }))
}

export async function createSimpleOrderFromScan(
  input: {
    orderNo: string
    goodsId?: number
    goodsCode?: string
    logisticsNo?: string
    platform?: string
    saleAmount?: number
  },
  operator: AuthRequest['user'],
) {
  const orderNo = input.orderNo.trim().toUpperCase()
  if (!orderNo) throw new Error('订单号不能为空')

  const existing = await findOrderByNo(orderNo)
  if (existing) throw new Error('这个订单号已经存在')

  let braceletId = input.goodsId
  let braceletCode = input.goodsCode?.trim().toUpperCase()

  if (!braceletId && braceletCode) {
    const g = await findBraceletByExactCode(braceletCode)
    if (g) {
      braceletId = g.id
      braceletCode = g.braceletCode
    }
  }

  if (braceletId && !braceletCode) {
    const g = await prisma.bracelet.findUnique({ where: { id: braceletId } })
    if (!g) throw new Error('没找到这个货品')
    braceletCode = g.braceletCode
  }

  if (!braceletId) {
    const placeholder = await createGoodsFromScan(
      { code: `PENDING-${orderNo.slice(-8)}`, category: '其他', status: 'customer_hold' },
      operator,
    )
    braceletId = placeholder.id
    braceletCode = placeholder.code
  }

  const cost = await calculateSaleCost(braceletId!)
  const saleAmount = input.saleAmount && input.saleAmount > 0 ? input.saleAmount : 0

  const sale = await prisma.sale.create({
    data: {
      saleNo: generateNo('SL'),
      platform: input.platform || '其他',
      externalOrderNo: orderNo,
      logisticsNo: input.logisticsNo?.trim().toUpperCase() || null,
      braceletId: braceletId!,
      braceletCode: braceletCode!,
      saleAmount,
      depositAmount: 0,
      finalPaymentAmount: saleAmount,
      unpaidAmount: saleAmount,
      inboundCostSnapshot: cost.inboundCost,
      certificateFeeSnapshot: cost.certificateFee,
      packageFeeSnapshot: cost.packageFee,
      expressFeeSnapshot: cost.expressFee,
      costAdjustmentSnapshot: cost.costAdjustment,
      totalCostSnapshot: cost.totalCost,
      grossProfit: saleAmount - cost.totalCost,
      compensationAmount: 0,
      finalProfit: saleAmount - cost.totalCost,
      soldAt: new Date(),
      status: saleAmount > 0 ? 'sold' : 'customer_hold',
      isTrialRun: false,
      createdBy: operator!.userId,
    },
  })

  await recordScan({
    scanCode: orderNo,
    scanType: 'order_no',
    source: 'manual',
    braceletId,
    saleId: sale.id,
    createdBy: operator?.userId,
  })

  return presentOrder(sale)
}

export async function bindExpenseToGoods(expenseId: number, goodsId: number, operator: AuthRequest['user']) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } })
  if (!expense || expense.isVoided) throw new Error('没找到这笔支出')

  const goods = await prisma.bracelet.findUnique({ where: { id: goodsId } })
  if (!goods) throw new Error('没找到这个货品')

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      braceletId: goodsId,
      braceletCode: goods.braceletCode,
    },
  })

  await refreshBraceletCostTotal(goodsId)

  await writeOperationLog({
    module: 'expense',
    action: 'bind_goods',
    targetType: 'expense',
    targetId: expenseId,
    targetCode: goods.braceletCode,
    operator,
  })

  return {
    expenseId,
    goods: await getGoodsById(goodsId),
  }
}
