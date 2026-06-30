import {
  detectScanCodeType,
  scanTypeHumanLabel,
  scanTypeRecognizeMessage,
  scanBindingStatusLabel,
  isPlaceholderGoodsCode,
  type ScanType,
  type ScanBindingStatus,
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
import { calculateSaleCost, calculateProfit, syncSaleLedger } from '../finance/core-ledger'

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
  const hasRealGoods = !isPlaceholderGoodsCode(sale.braceletCode)
  return {
    id: sale.id,
    draftId: null as number | null,
    isDraft: false,
    orderNo: sale.externalOrderNo || sale.saleNo,
    saleNo: sale.saleNo,
    logisticsNo: sale.logisticsNo,
    orderStatus: sale.status,
    afterSaleStatus: sale.afterSaleStatus,
    braceletId: hasRealGoods ? sale.braceletId : null,
    braceletCode: hasRealGoods ? sale.braceletCode : null,
    saleAmount: toNumber(sale.saleAmount as string | number),
    soldAt: sale.soldAt,
    needsGoodsBinding: !hasRealGoods,
  }
}

function presentDraft(draft: {
  id: number
  orderNo: string
  logisticsNo: string | null
  createdAt: Date
}) {
  return {
    id: null as number | null,
    draftId: draft.id,
    isDraft: true,
    orderNo: draft.orderNo,
    saleNo: null as string | null,
    logisticsNo: draft.logisticsNo,
    orderStatus: 'pending',
    afterSaleStatus: null as string | null,
    braceletId: null as number | null,
    braceletCode: null as string | null,
    saleAmount: 0,
    soldAt: draft.createdAt,
    needsGoodsBinding: true,
  }
}

async function findOrderByNo(code: string) {
  return prisma.sale.findFirst({
    where: {
      OR: [{ externalOrderNo: code }, { saleNo: code }],
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

async function findDraftByOrderNo(code: string) {
  return prisma.scanOrderDraft.findUnique({ where: { orderNo: code } })
}

async function findDraftByLogistics(code: string) {
  return prisma.scanOrderDraft.findFirst({
    where: { logisticsNo: code },
    orderBy: { createdAt: 'desc' },
  })
}

function orderNeedsGoodsBinding(
  order: ReturnType<typeof presentOrder> | ReturnType<typeof presentDraft> | null,
): boolean {
  if (!order) return false
  return order.needsGoodsBinding
}

function buildNextActions(input: {
  scanType: ScanType
  matched: boolean
  goods?: ReturnType<typeof presentGoods> | null
  order?: ReturnType<typeof presentOrder> | ReturnType<typeof presentDraft> | null
}) {
  const actions: string[] = []
  const { scanType, matched, goods, order } = input
  const needsBind = orderNeedsGoodsBinding(order ?? null)

  if (scanType === 'goods_code') {
    if (matched && goods) {
      actions.push('create_expense', 'register_sale', 'view_profit', 'view_cost')
    } else {
      actions.push('create_goods')
    }
  } else if (scanType === 'order_no') {
    if (matched && order) {
      if (needsBind) actions.push('bind_goods')
      else actions.push('view_goods', 'create_expense', 'register_sale', 'view_profit')
    } else {
      actions.push('create_order', 'bind_goods')
    }
  } else if (scanType === 'logistics_no') {
    if (matched && order) {
      if (needsBind) actions.push('bind_goods')
      else actions.push('view_order', 'view_goods', 'view_profit')
    } else {
      actions.push('create_order', 'bind_goods')
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
  order?: ReturnType<typeof presentOrder> | ReturnType<typeof presentDraft> | null
  effectiveType?: ScanType
}) {
  const { scanType, matched, goods, order, effectiveType } = input
  const typeHint = effectiveType && effectiveType !== scanType
    ? `（库内匹配为${scanTypeHumanLabel(effectiveType)}）`
    : ''

  if (scanType === 'goods_code' || (effectiveType === 'goods_code' && matched)) {
    if (matched && goods) return `找到了这个货品，可以直接记支出或登记销售${typeHint}`
    return '暂时没找到这个编码，可以新建货品'
  }
  if (scanType === 'order_no' || effectiveType === 'order_no') {
    if (matched && order) {
      return orderNeedsGoodsBinding(order)
        ? '这个订单还没关联货品，可以输入货品码关联'
        : `找到了这个订单，已关联货品 ${order.braceletCode}${typeHint}`
    }
    return '暂时没找到这个订单，可以先保存待处理记录'
  }
  if (scanType === 'logistics_no' || effectiveType === 'logistics_no') {
    if (matched && order) {
      return orderNeedsGoodsBinding(order)
        ? '物流单号已匹配到订单，请关联货品'
        : `物流单号已匹配到订单，可查看关联货品${typeHint}`
    }
    return '没找到这个物流单号，可以先记一条待处理记录'
  }
  return '暂时没识别出来，可以新建货品或关联到已有记录'
}

async function recordScan(input: {
  scanCode: string
  scanType: ScanType
  status: ScanBindingStatus
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
      status: input.status,
      source: input.source,
      braceletId: input.braceletId ?? null,
      saleId: input.saleId ?? null,
      note: input.note,
      createdBy: input.createdBy,
    },
  })
}

async function lookupByCode(normalizedCode: string, initialType: ScanType) {
  let goods: ReturnType<typeof presentGoods> | null = null
  let order: ReturnType<typeof presentOrder> | null = null
  let draft: ReturnType<typeof presentDraft> | null = null
  let effectiveType = initialType

  const tryGoods = async () => {
    if (goods) return
    const g = await getGoodsByCode(normalizedCode)
    if (g && !isPlaceholderGoodsCode(g.code)) {
      goods = g
      effectiveType = 'goods_code'
    }
  }

  const tryOrder = async () => {
    if (order || draft) return
    const sale = await findOrderByNo(normalizedCode)
    if (sale) {
      order = presentOrder(sale)
      const g = await getGoodsById(sale.braceletId)
      if (g && !isPlaceholderGoodsCode(g.code)) goods = g
      effectiveType = 'order_no'
      return
    }
    const d = await findDraftByOrderNo(normalizedCode)
    if (d) {
      draft = presentDraft(d)
      effectiveType = 'order_no'
    }
  }

  const tryLogistics = async () => {
    if (order || draft) return
    const sale = await findOrderByLogistics(normalizedCode)
    if (sale) {
      order = presentOrder(sale)
      const g = await getGoodsById(sale.braceletId)
      if (g && !isPlaceholderGoodsCode(g.code)) goods = g
      effectiveType = 'logistics_no'
      return
    }
    const d = await findDraftByLogistics(normalizedCode)
    if (d) {
      draft = presentDraft(d)
      effectiveType = 'logistics_no'
    }
  }

  if (initialType === 'goods_code' || initialType === 'unknown') {
    await tryGoods()
    if (!goods) {
      const bracelet = await findBraceletByExactCode(normalizedCode)
      if (bracelet && !isPlaceholderGoodsCode(bracelet.braceletCode)) {
        goods = await getGoodsById(bracelet.id)
      }
    }
  } else if (initialType === 'order_no') {
    await tryOrder()
    if (!order && !draft) await tryLogistics()
    if (!order && !draft && !goods) await tryGoods()
  } else if (initialType === 'logistics_no') {
    await tryLogistics()
    if (!order && !draft) await tryOrder()
    if (!order && !draft && !goods) await tryGoods()
  }

  const matchedOrder = order || draft
  return {
    goods,
    order: matchedOrder,
    effectiveType,
    matched: !!(goods || matchedOrder),
  }
}

export async function recognizeScanCode(code: string, source: ScanSource = 'manual') {
  const { scanType: initialType, normalizedCode } = detectScanCodeType(code)
  if (!normalizedCode) {
    return {
      scanType: 'unknown' as ScanType,
      scanTypeLabel: scanTypeHumanLabel('unknown'),
      normalizedCode: '',
      message: scanTypeRecognizeMessage('unknown', ''),
      matched: false,
      goods: null,
      order: null,
      suggestion: '请输入或扫描编码',
      nextActions: [] as string[],
      source,
    }
  }

  const { goods, order, effectiveType, matched } = await lookupByCode(normalizedCode, initialType)
  const scanType = matched ? effectiveType : initialType
  const message = matched && effectiveType !== initialType
    ? `${scanTypeRecognizeMessage(initialType, normalizedCode)}（匹配为${scanTypeHumanLabel(effectiveType)}）`
    : scanTypeRecognizeMessage(scanType, normalizedCode)

  const nextActions = buildNextActions({ scanType, matched, goods, order })
  const suggestion = buildSuggestion({ scanType: initialType, matched, goods, order, effectiveType: matched ? effectiveType : undefined })

  await recordScan({
    scanCode: normalizedCode,
    scanType: initialType,
    status: 'recognized',
    source,
    createdBy: undefined,
  })

  return {
    scanType: initialType,
    effectiveScanType: matched ? effectiveType : initialType,
    scanTypeLabel: scanTypeHumanLabel(matched ? effectiveType : initialType),
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

async function resolveGoods(input: { goodsId?: number; goodsCode?: string }) {
  if (input.goodsId) {
    const g = await getGoodsById(input.goodsId)
    if (!g) throw new Error('没找到这个货品')
    if (isPlaceholderGoodsCode(g.code)) throw new Error('没找到这个货品')
    return g
  }
  const code = input.goodsCode?.trim().toUpperCase()
  if (!code) throw new Error('请输入货品码')
  const g = await getGoodsByCode(code)
  if (!g || isPlaceholderGoodsCode(g.code)) throw new Error('没找到这个货品')
  return g
}

async function assertLogisticsNotBound(code: string, excludeSaleId?: number) {
  const existing = await findOrderByLogistics(code)
  if (existing && existing.id !== excludeSaleId) {
    throw new Error('这个物流单号已经绑定到其他订单')
  }
  const draft = await findDraftByLogistics(code)
  if (draft) throw new Error('这个物流单号已经绑定到其他订单')
}

export async function bindOrderToGoods(
  input: {
    orderNo?: string
    orderId?: number
    draftId?: number
    goodsId?: number
    goodsCode?: string
    scanCode?: string
    source?: ScanSource
  },
  operator: AuthRequest['user'],
) {
  const goods = await resolveGoods(input)
  const source = input.source || 'manual'

  let sale = input.orderId
    ? await prisma.sale.findUnique({ where: { id: input.orderId } })
    : null

  let draft = input.draftId
    ? await prisma.scanOrderDraft.findUnique({ where: { id: input.draftId } })
    : null

  const orderNo = input.orderNo?.trim().toUpperCase()
  if (!sale && !draft && orderNo) {
    sale = await findOrderByNo(orderNo)
    if (!sale) draft = await findDraftByOrderNo(orderNo)
  }

  if (!sale && !draft) throw new Error('没找到这个订单')

  if (sale && !isPlaceholderGoodsCode(sale.braceletCode)) {
    throw new Error('这个订单已经绑定货品了')
  }

  const scanCode = (input.scanCode || orderNo || sale?.externalOrderNo || draft?.orderNo || '').trim().toUpperCase()

  if (draft) {
    const dupOrder = await findOrderByNo(draft.orderNo)
    if (dupOrder && !isPlaceholderGoodsCode(dupOrder.braceletCode)) {
      throw new Error('这个订单已经存在，可以直接绑定货品')
    }

    const cost = await calculateSaleCost(goods.id)
    const newSale = await prisma.sale.create({
      data: {
        saleNo: generateNo('SL'),
        platform: '其他',
        externalOrderNo: draft.orderNo,
        logisticsNo: draft.logisticsNo,
        braceletId: goods.id,
        braceletCode: goods.code,
        saleAmount: 0,
        depositAmount: 0,
        finalPaymentAmount: 0,
        unpaidAmount: 0,
        inboundCostSnapshot: cost.inboundCost,
        certificateFeeSnapshot: cost.certificateFee,
        packageFeeSnapshot: cost.packageFee,
        expressFeeSnapshot: cost.expressFee,
        costAdjustmentSnapshot: cost.costAdjustment,
        totalCostSnapshot: cost.totalCost,
        grossProfit: -cost.totalCost,
        compensationAmount: 0,
        finalProfit: calculateProfit({
          saleAmount: 0,
          totalCostSnapshot: cost.totalCost,
          grossProfit: -cost.totalCost,
          refunds: [],
          expenses: [],
        }).netProfit,
        soldAt: new Date(),
        status: 'customer_hold',
        isTrialRun: false,
        createdBy: operator!.userId,
      },
    })
    await syncSaleLedger(newSale.id)

    await prisma.scanOrderDraft.delete({ where: { id: draft.id } })

    const binding = await recordScan({
      scanCode: scanCode || draft.orderNo,
      scanType: 'order_no',
      status: 'bound',
      source,
      braceletId: goods.id,
      saleId: newSale.id,
      note: '待绑定订单已绑定货品',
      createdBy: operator?.userId,
    })

    await writeOperationLog({
      module: 'scan',
      action: 'bind_order_goods',
      targetType: 'sale',
      targetId: newSale.id,
      targetCode: draft.orderNo,
      operator,
    })

    return {
      binding,
      goods,
      order: presentOrder(newSale),
    }
  }

  if (!sale) throw new Error('没找到这个订单')

  if (isPlaceholderGoodsCode(sale.braceletCode)) {
    const placeholderId = sale.braceletId
    const cost = await calculateSaleCost(goods.id)
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        braceletId: goods.id,
        braceletCode: goods.code,
        inboundCostSnapshot: cost.inboundCost,
        certificateFeeSnapshot: cost.certificateFee,
        packageFeeSnapshot: cost.packageFee,
        expressFeeSnapshot: cost.expressFee,
        costAdjustmentSnapshot: cost.costAdjustment,
        totalCostSnapshot: cost.totalCost,
        grossProfit: toNumber(sale.saleAmount) - cost.totalCost,
        finalProfit: calculateProfit({
          saleAmount: sale.saleAmount,
          totalCostSnapshot: cost.totalCost,
          grossProfit: toNumber(sale.saleAmount) - cost.totalCost,
          refunds: [],
          expenses: [],
        }).netProfit,
      },
    })
    await syncSaleLedger(sale.id)
    const orphanExpenses = await prisma.expense.count({ where: { braceletId: placeholderId } })
    const orphanSales = await prisma.sale.count({ where: { braceletId: placeholderId, id: { not: sale.id } } })
    if (orphanExpenses === 0 && orphanSales === 0) {
      await prisma.bracelet.delete({ where: { id: placeholderId } }).catch(() => {})
    }
  } else {
    throw new Error('这个订单已经绑定货品了')
  }

  const binding = await recordScan({
    scanCode: scanCode || sale.externalOrderNo || sale.saleNo,
    scanType: 'order_no',
    status: 'bound',
    source,
    braceletId: goods.id,
    saleId: sale.id,
    note: '订单绑定货品',
    createdBy: operator?.userId,
  })

  await writeOperationLog({
    module: 'scan',
    action: 'bind_order_goods',
    targetType: 'sale',
    targetId: sale.id,
    targetCode: sale.externalOrderNo || sale.saleNo,
    operator,
  })

  return {
    binding,
    goods,
    order: presentOrder(await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })),
  }
}

export async function bindScan(input: {
  scanCode: string
  scanType?: ScanType
  goodsId?: number
  goodsCode?: string
  orderId?: number
  orderNo?: string
  note?: string
  source?: ScanSource
}, operator: AuthRequest['user']) {
  const source = input.source || 'manual'
  const detected = input.scanType
    ? { scanType: input.scanType, normalizedCode: input.scanCode.trim().toUpperCase() }
    : detectScanCodeType(input.scanCode)

  const { scanType, normalizedCode } = detected
  if (!normalizedCode) throw new Error('编码不能为空')

  if (input.orderId || input.orderNo) {
    if ((input.goodsId || input.goodsCode)) {
      return bindOrderToGoods(
        {
          orderId: input.orderId,
          orderNo: input.orderNo,
          goodsId: input.goodsId,
          goodsCode: input.goodsCode,
          scanCode: normalizedCode,
          source,
        },
        operator,
      )
    }
    if (scanType === 'logistics_no' && input.orderId) {
      await assertLogisticsNotBound(normalizedCode, input.orderId)
      const sale = await prisma.sale.findUnique({ where: { id: input.orderId } })
      if (!sale) throw new Error('没找到这个订单')
      await prisma.sale.update({
        where: { id: input.orderId },
        data: { logisticsNo: normalizedCode },
      })
      const binding = await recordScan({
        scanCode: normalizedCode,
        scanType,
        status: 'bound',
        source,
        saleId: input.orderId,
        note: input.note || '物流单号绑定订单',
        createdBy: operator?.userId,
      })
      return {
        binding,
        goods: null,
        order: presentOrder(await prisma.sale.findUniqueOrThrow({ where: { id: input.orderId } })),
      }
    }
  }

  if (input.goodsId || input.goodsCode) {
    const goods = await resolveGoods(input)
    const dup = await prisma.scanBinding.findFirst({
      where: {
        scanCode: normalizedCode,
        status: 'bound',
        braceletId: goods.id,
      },
    })
    if (dup) throw new Error('这个编码已经绑定过了')

    const binding = await recordScan({
      scanCode: normalizedCode,
      scanType,
      status: 'bound',
      source,
      braceletId: goods.id,
      note: input.note || '未知编码绑定到货品',
      createdBy: operator?.userId,
    })

    return { binding, goods, order: null }
  }

  const binding = await recordScan({
    scanCode: normalizedCode,
    scanType,
    status: 'pending',
    source,
    note: input.note,
    createdBy: operator?.userId,
  })

  return { binding, goods: null, order: null }
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
  return rows.map((row) => {
    const legacyBound = !!(row.braceletId || row.saleId)
    const status = (row.status || (legacyBound ? 'bound' : 'recognized')) as ScanBindingStatus
    return {
      id: row.id,
      scanCode: row.scanCode,
      scanType: row.scanType,
      scanTypeLabel: scanTypeHumanLabel(row.scanType as ScanType),
      status,
      statusLabel: scanBindingStatusLabel(status),
      source: row.source,
      note: row.note,
      goods: row.bracelet && !isPlaceholderGoodsCode(row.bracelet.braceletCode)
        ? presentGoods(row.bracelet)
        : null,
      order: row.sale ? presentOrder(row.sale) : null,
      bound: status === 'bound',
      createdAt: row.createdAt,
    }
  })
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

  const existingSale = await findOrderByNo(orderNo)
  if (existingSale) {
    if (isPlaceholderGoodsCode(existingSale.braceletCode)) {
      throw new Error('这个订单已经存在，可以直接绑定货品')
    }
    throw new Error('这个订单已经存在')
  }

  const existingDraft = await findDraftByOrderNo(orderNo)
  if (existingDraft) throw new Error('这个订单已经存在，可以直接绑定货品')

  const logisticsNo = input.logisticsNo?.trim().toUpperCase() || null
  if (logisticsNo) await assertLogisticsNotBound(logisticsNo)

  let braceletId = input.goodsId
  let braceletCode = input.goodsCode?.trim().toUpperCase()

  if (!braceletId && braceletCode) {
    const g = await findBraceletByExactCode(braceletCode)
    if (g && !isPlaceholderGoodsCode(g.braceletCode)) {
      braceletId = g.id
      braceletCode = g.braceletCode
    } else if (g) {
      throw new Error('没找到这个货品')
    }
  }

  if (braceletId && !braceletCode) {
    const g = await prisma.bracelet.findUnique({ where: { id: braceletId } })
    if (!g || isPlaceholderGoodsCode(g.braceletCode)) throw new Error('没找到这个货品')
    braceletCode = g.braceletCode
  }

  if (!braceletId) {
    const draft = await prisma.scanOrderDraft.create({
      data: {
        orderNo,
        logisticsNo,
        source: 'manual',
        createdBy: operator?.userId,
      },
    })

    await recordScan({
      scanCode: orderNo,
      scanType: 'order_no',
      status: 'pending',
      source: 'manual',
      note: '待绑定订单',
      createdBy: operator?.userId,
    })

    return presentDraft(draft)
  }

  const cost = await calculateSaleCost(braceletId!)
  const saleAmount = input.saleAmount && input.saleAmount > 0 ? input.saleAmount : 0

  const sale = await prisma.sale.create({
    data: {
      saleNo: generateNo('SL'),
      platform: input.platform || '其他',
      externalOrderNo: orderNo,
      logisticsNo,
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
      finalProfit: calculateProfit({
        saleAmount,
        totalCostSnapshot: cost.totalCost,
        grossProfit: saleAmount - cost.totalCost,
        refunds: [],
        expenses: [],
      }).netProfit,
      soldAt: new Date(),
      status: saleAmount > 0 ? 'sold' : 'customer_hold',
      isTrialRun: false,
      createdBy: operator!.userId,
    },
  })
  await syncSaleLedger(sale.id)

  await recordScan({
    scanCode: orderNo,
    scanType: 'order_no',
    status: 'bound',
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
  if (!goods || isPlaceholderGoodsCode(goods.braceletCode)) throw new Error('没找到这个货品')

  const oldBraceletId = expense.braceletId

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      braceletId: goodsId,
      braceletCode: goods.braceletCode,
    },
  })

  await refreshBraceletCostTotal(goodsId)
  if (oldBraceletId && oldBraceletId !== goodsId) {
    await refreshBraceletCostTotal(oldBraceletId)
  }

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
    oldBraceletId,
  }
}
