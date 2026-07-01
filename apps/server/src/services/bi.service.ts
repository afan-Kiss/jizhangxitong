import {
  isProfitDeductingExpense,
  isConfirmedRefund,
  EXPENSE_BUSINESS_LABELS,
  BI_METRIC_HINTS,
} from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'
import { resolveDateRange, rangeLabel } from '../lib/date-range'
import { resolveUsersBrief } from './audit.service'
import {
  calculateProfit,
  calculateEffectiveSales,
  saleProfitRow,
  PROFIT_DEDUCT_EXPENSE_INCLUDE,
  EFFECTIVE_SALES_RULE_HINT,
} from '../finance/core-ledger'

const INVENTORY_STATUSES = ['in_stock', 'returned_available']

function customerPaymentGroupLabel(expenseType: string, businessType?: string | null): string {
  const bt = businessType || ''
  if (bt === 'customer_refund') {
    if (expenseType.includes('差价')) return '客户退差价'
    return '客户返款'
  }
  if (bt === 'customer_compensation') return '心理落差补偿'
  if (bt === 'after_sale_compensation') {
    if (expenseType.includes('运费')) return '退货运费补偿'
    return '售后补偿'
  }
  if (expenseType.includes('返款')) return '客户返款'
  if (expenseType.includes('差价')) return '客户退差价'
  if (expenseType.includes('心理')) return '心理落差补偿'
  if (expenseType.includes('运费')) return '退货运费补偿'
  if (expenseType.includes('售后')) return '售后补偿'
  return expenseType || '其他补偿'
}

export async function getBiSummary(range?: string, startDate?: string, endDate?: string) {
  const resolved = resolveDateRange(range, startDate, endDate)
  const { start, end, key, startDate: sd, endDate: ed } = resolved

  const [expenses, sales, refunds, inventory] = await Promise.all([
    prisma.expense.findMany({
      where: { isVoided: false, isTrialRun: false, occurredAt: { gte: start, lte: end } },
    }),
    prisma.sale.findMany({
      where: { isTrialRun: false, soldAt: { gte: start, lte: end } },
      include: { refunds: true, expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE },
    }),
    prisma.refund.findMany({
      where: { refundedAt: { gte: start, lte: end } },
      include: { sale: { select: { isTrialRun: true } } },
    }),
    prisma.bracelet.findMany({
      where: { scannerStatus: { in: INVENTORY_STATUSES } },
      select: { costTotal: true },
    }),
  ])

  const expenseAmount = expenses.reduce((s, e) => s + toNumber(e.amount), 0)
  const customerPaymentAmount = expenses
    .filter((e) => isProfitDeductingExpense(e))
    .reduce((s, e) => s + toNumber(e.amount), 0)

  let saleAmount = 0
  let netProfit = 0
  for (const s of sales) {
    if (s.status !== 'sold') continue
    const fin = calculateProfit(s)
    saleAmount += fin.income
    netProfit += fin.netProfit
  }

  const confirmedRefunds = refunds.filter(
    (r) => !r.sale?.isTrialRun && isConfirmedRefund(r.status),
  )
  const refundAmount = confirmedRefunds.reduce((s, r) => s + toNumber(r.refundAmount), 0)

  const effective = calculateEffectiveSales(sales)
  const inventoryCount = inventory.length
  const inventoryCost = inventory.reduce((s, b) => s + toNumber(b.costTotal), 0)

  return {
    range: {
      key,
      label: rangeLabel(key, sd, ed),
      startDate: sd,
      endDate: ed,
    },
    saleAmount,
    expenseAmount,
    netProfit,
    customerPaymentAmount,
    refundAmount,
    inventoryCount,
    inventoryCost,
    effectiveSaleAmount: effective.effectiveSaleAmount,
    effectiveOrderCount: effective.effectiveOrderCount,
    ruleHint: EFFECTIVE_SALES_RULE_HINT,
    metricHints: BI_METRIC_HINTS,
    /** @deprecated 报销流程已下线，请勿在 UI 使用 */
    pendingReimbursementAmount: 0,
    /** @deprecated 报销流程已下线，请勿在 UI 使用 */
    pendingReimbursementCount: 0,
  }
}

type DrilldownParams = {
  type: string
  range?: string
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
  q?: string
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  }
}

function matchSearch(q: string, ...fields: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return fields.some((f) => String(f ?? '').toLowerCase().includes(needle))
}

export async function getBiDrilldown(params: DrilldownParams) {
  const type = params.type || 'sales'
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
  const q = params.q?.trim() || ''
  const resolved = resolveDateRange(params.range, params.startDate, params.endDate)
  const { start, end, key, startDate: sd, endDate: ed } = resolved
  const rangeInfo = { key, label: rangeLabel(key, sd, ed), startDate: sd, endDate: ed }

  switch (type) {
    case 'sales':
      return drillSales(rangeInfo, start, end, page, pageSize, q)
    case 'expenses':
      return drillExpenses(rangeInfo, start, end, page, pageSize, q)
    case 'profit':
      return drillProfit(rangeInfo, start, end, page, pageSize, q)
    case 'customer-payments':
      return drillCustomerPayments(rangeInfo, start, end, page, pageSize, q)
    case 'refunds':
      return drillRefunds(rangeInfo, start, end, page, pageSize, q)
    case 'effective-sales':
      return drillEffectiveSales(rangeInfo, start, end, page, pageSize, q)
    case 'inventory':
      return drillInventory(rangeInfo, page, pageSize, q)
    default:
      throw new Error(`未知的下钻类型: ${type}`)
  }
}

type RangeInfo = { key: string; label: string; startDate: string; endDate: string }

async function drillSales(
  rangeInfo: RangeInfo,
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const sales = await prisma.sale.findMany({
    where: {
      isTrialRun: false,
      status: 'sold',
      soldAt: { gte: start, lte: end },
    },
    include: { refunds: true, expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE },
    orderBy: { soldAt: 'desc' },
  })

  const userIds = sales.map((s) => s.createdBy)
  const userMap = await resolveUsersBrief(userIds)

  const rows = sales
    .map((s) => {
      const row = saleProfitRow(s)
      return {
        id: s.id,
        soldAt: s.soldAt,
        externalOrderNo: s.externalOrderNo,
        braceletCode: s.braceletCode,
        saleAmount: row.saleAmount,
        cost: row.cost,
        refundAmount: row.refundAmount,
        compensationAmount: row.compensationAmount,
        profit: row.profit,
        createdByName: userMap.get(s.createdBy)?.displayName || userMap.get(s.createdBy)?.username || '未知',
        detailPath: `/sales/${s.id}`,
      }
    })
    .filter((r) => matchSearch(q, r.externalOrderNo, r.braceletCode, r.createdByName))

  const totalAmount = rows.reduce((s, r) => s + r.saleAmount, 0)
  const paged = paginate(rows, page, pageSize)

  return {
    type: 'sales',
    title: '销售明细',
    range: rangeInfo,
    summary: { totalAmount, count: rows.length, label: '合计销售金额' },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}

async function drillExpenses(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const expenses = await prisma.expense.findMany({
    where: { isVoided: false, isTrialRun: false, occurredAt: { gte: start, lte: end } },
    include: { _count: { select: { attachments: true } } },
    orderBy: { occurredAt: 'desc' },
  })

  const userMap = await resolveUsersBrief(expenses.map((e) => e.createdBy))

  const byBusinessType: Record<string, number> = {}
  for (const e of expenses) {
    const bt = e.businessType || 'normal'
    const label = EXPENSE_BUSINESS_LABELS[bt as keyof typeof EXPENSE_BUSINESS_LABELS] || e.expenseType
    byBusinessType[label] = (byBusinessType[label] || 0) + toNumber(e.amount)
  }

  const rows = expenses
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      amount: toNumber(e.amount),
      expenseType: e.expenseType,
      businessType: e.businessType,
      businessLabel: EXPENSE_BUSINESS_LABELS[e.businessType as keyof typeof EXPENSE_BUSINESS_LABELS] || e.expenseType,
      braceletCode: e.braceletCode,
      externalOrderNo: e.externalOrderNo,
      createdByName: userMap.get(e.createdBy)?.displayName || userMap.get(e.createdBy)?.username || '未知',
      attachmentCount: e._count.attachments,
      detailPath: `/expense/${e.id}`,
    }))
    .filter((r) => matchSearch(q, r.externalOrderNo, r.braceletCode, r.createdByName, r.expenseType, r.businessLabel))

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const paged = paginate(rows, page, pageSize)

  return {
    type: 'expenses',
    title: '支出明细',
    range: rangeInfo,
    summary: { totalAmount, count: rows.length, label: '合计支出', byBusinessType },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}

async function drillProfit(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const sales = await prisma.sale.findMany({
    where: { isTrialRun: false, status: 'sold', soldAt: { gte: start, lte: end } },
    include: { refunds: true, expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE },
    orderBy: { soldAt: 'desc' },
  })

  const userMap = await resolveUsersBrief(sales.map((s) => s.createdBy))

  let totalIncome = 0
  let totalCost = 0
  let totalRefund = 0
  let totalCompensation = 0
  let totalProfit = 0

  const rows = sales
    .map((s) => {
      const fin = calculateProfit(s)
      totalIncome += fin.income
      totalCost += fin.cost
      totalRefund += fin.refund
      totalCompensation += fin.compensation
      totalProfit += fin.netProfit
      return {
        id: s.id,
        soldAt: s.soldAt,
        externalOrderNo: s.externalOrderNo,
        braceletCode: s.braceletCode,
        braceletId: s.braceletId,
        income: fin.income,
        cost: fin.cost,
        refund: fin.refund,
        compensation: fin.compensation,
        profit: fin.netProfit,
        createdByName: userMap.get(s.createdBy)?.displayName || userMap.get(s.createdBy)?.username || '未知',
        saleDetailPath: `/sales/${s.id}`,
        braceletDetailPath: `/bracelets/${s.braceletCode}`,
      }
    })
    .filter((r) => matchSearch(q, r.externalOrderNo, r.braceletCode, r.createdByName))

  const paged = paginate(rows, page, pageSize)

  return {
    type: 'profit',
    title: '利润明细',
    range: rangeInfo,
    summary: {
      totalIncome,
      totalCost,
      totalRefund,
      totalCompensation,
      netProfit: totalProfit,
      count: rows.length,
    },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
    usesCoreLedger: true,
  }
}

async function drillCustomerPayments(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const expenses = await prisma.expense.findMany({
    where: { isVoided: false, isTrialRun: false, occurredAt: { gte: start, lte: end } },
    include: { _count: { select: { attachments: true } } },
    orderBy: { occurredAt: 'desc' },
  })

  const filtered = expenses.filter((e) => isProfitDeductingExpense(e))
  const userMap = await resolveUsersBrief(filtered.map((e) => e.createdBy))

  const byGroup: Record<string, number> = {}
  const rows = filtered
    .map((e) => {
      const group = customerPaymentGroupLabel(e.expenseType, e.businessType)
      byGroup[group] = (byGroup[group] || 0) + toNumber(e.amount)
      return {
        id: e.id,
        occurredAt: e.occurredAt,
        amount: toNumber(e.amount),
        group,
        externalOrderNo: e.externalOrderNo,
        remark: e.remark,
        createdByName: userMap.get(e.createdBy)?.displayName || userMap.get(e.createdBy)?.username || '未知',
        attachmentCount: e._count.attachments,
        detailPath: `/expense/${e.id}`,
      }
    })
    .filter((r) => matchSearch(q, r.externalOrderNo, r.remark, r.createdByName, r.group))

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const paged = paginate(rows, page, pageSize)

  return {
    type: 'customer-payments',
    title: '客户返款/补偿明细',
    range: rangeInfo,
    summary: { totalAmount, count: rows.length, byGroup },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}

async function drillRefunds(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const refunds = await prisma.refund.findMany({
    where: { refundedAt: { gte: start, lte: end } },
    include: { sale: { select: { id: true, externalOrderNo: true, isTrialRun: true, createdBy: true } } },
    orderBy: { refundedAt: 'desc' },
  })

  const trialFiltered = refunds.filter((r) => !r.sale?.isTrialRun)
  const userMap = await resolveUsersBrief(trialFiltered.map((r) => r.sale?.createdBy).filter(Boolean) as number[])

  const confirmed = trialFiltered.filter((r) => isConfirmedRefund(r.status))
  const unconfirmed = trialFiltered.filter((r) => !isConfirmedRefund(r.status))

  const rows = confirmed
    .map((r) => ({
      id: r.id,
      saleId: r.saleId,
      refundedAt: r.refundedAt,
      externalOrderNo: r.sale?.externalOrderNo,
      braceletCode: r.braceletCode,
      refundAmount: toNumber(r.refundAmount),
      status: r.status,
      refundReason: r.refundReason,
      createdByName: userMap.get(r.sale?.createdBy ?? 0)?.displayName || '未知',
      detailPath: `/sales/${r.saleId}`,
    }))
    .filter((r) => matchSearch(q, r.externalOrderNo, r.braceletCode, r.refundReason, r.createdByName))

  const unconfirmedRows = unconfirmed.map((r) => ({
    id: r.id,
    saleId: r.saleId,
    refundedAt: r.refundedAt,
    externalOrderNo: r.sale?.externalOrderNo,
    braceletCode: r.braceletCode,
    refundAmount: toNumber(r.refundAmount),
    status: r.status,
    detailPath: `/sales/${r.saleId}`,
  }))

  const totalAmount = rows.reduce((s, r) => s + r.refundAmount, 0)
  const paged = paginate(rows, page, pageSize)

  return {
    type: 'refunds',
    title: '退款明细',
    range: rangeInfo,
    summary: { totalAmount, count: rows.length, label: '已确认退款合计' },
    items: paged.items,
    unconfirmed: unconfirmedRows,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}

async function drillEffectiveSales(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
) {
  const sales = await prisma.sale.findMany({
    where: { isTrialRun: false, soldAt: { gte: start, lte: end } },
    include: { refunds: true },
    orderBy: { soldAt: 'desc' },
  })

  const userMap = await resolveUsersBrief(sales.map((s) => s.createdBy))
  const effective = calculateEffectiveSales(sales)

  const rows = sales
    .filter((s) => {
      const fin = calculateEffectiveSales([s])
      return fin.effectiveOrderCount > 0
    })
    .map((s) => {
      const eff = calculateEffectiveSales([s])
      return {
        id: s.id,
        soldAt: s.soldAt,
        externalOrderNo: s.externalOrderNo,
        braceletCode: s.braceletCode,
        status: s.status,
        afterSaleStatus: s.afterSaleStatus,
        saleAmount: toNumber(s.saleAmount),
        effectiveAmount: eff.effectiveSaleAmount,
        createdByName: userMap.get(s.createdBy)?.displayName || userMap.get(s.createdBy)?.username || '未知',
        detailPath: `/sales/${s.id}`,
      }
    })
    .filter((r) => matchSearch(q, r.externalOrderNo, r.braceletCode, r.createdByName))

  const paged = paginate(rows, page, pageSize)

  return {
    type: 'effective-sales',
    title: '有效成交明细',
    range: rangeInfo,
    ruleHint: EFFECTIVE_SALES_RULE_HINT,
    summary: {
      totalAmount: effective.effectiveSaleAmount,
      count: effective.effectiveOrderCount,
    },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}

async function drillInventory(
  rangeInfo: { key: string; label: string; startDate: string; endDate: string },
  page: number,
  pageSize: number,
  q: string,
) {
  const bracelets = await prisma.bracelet.findMany({
    where: { scannerStatus: { in: INVENTORY_STATUSES } },
    orderBy: { updatedAt: 'desc' },
  })

  const rows = bracelets
    .map((b) => ({
      id: b.id,
      code: b.braceletCode,
      scannerStatus: b.scannerStatus,
      costTotal: toNumber(b.costTotal),
      inboundCost: toNumber(b.inboundCost),
      detailPath: `/bracelets/${b.braceletCode}`,
    }))
    .filter((r) => matchSearch(q, r.code))

  const totalCost = rows.reduce((s, r) => s + r.costTotal, 0)
  const paged = paginate(rows, page, pageSize)

  return {
    type: 'inventory',
    title: '在库货品明细',
    range: rangeInfo,
    summary: { count: rows.length, totalCost },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}
