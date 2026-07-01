import { EXPENSE_BUSINESS_LABELS } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'
import { resolveDateRange, rangeLabel } from '../lib/date-range'
import { resolveUsersBrief } from './audit.service'
import { getExpenseSummary } from './expense.service'
import { startOfDay, endOfDay } from '../lib/utils'

export async function getBiSummary(range?: string, startDate?: string, endDate?: string) {
  const resolved = resolveDateRange(range, startDate, endDate)
  const { key, startDate: sd, endDate: ed } = resolved
  const summary = await getExpenseSummary('custom', sd, ed)
  const today = await getExpenseSummary('today')
  const month = await getExpenseSummary('month')

  return {
    range: {
      key,
      label: rangeLabel(key, sd, ed),
      startDate: sd,
      endDate: ed,
    },
    expenseAmount: summary.totalAmount,
    expenseCount: summary.totalCount,
    todayExpenseAmount: today.totalAmount,
    monthExpenseAmount: month.totalAmount,
    missingAttachmentCount: summary.needsAttachmentCount,
    linkedOrderCount: summary.linkedOrderCount,
    unlinkedOrderCount: summary.unlinkedOrderCount,
    byExpenseType: summary.byType,
    byPaySource: summary.byPaySource,
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
  const type = params.type || 'expenses'
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
  const q = params.q?.trim() || ''
  const resolved = resolveDateRange(params.range, params.startDate, params.endDate)
  const { start, end, key, startDate: sd, endDate: ed } = resolved
  const rangeInfo = { key, label: rangeLabel(key, sd, ed), startDate: sd, endDate: ed }

  switch (type) {
    case 'expenses':
    case 'by-category':
    case 'by-pay-source':
    case 'missing-attachment':
    case 'linked-order':
    case 'unlinked-order':
      return drillExpenses(rangeInfo, start, end, page, pageSize, q, type)
    default:
      throw new Error(`未知的下钻类型: ${type}`)
  }
}

type RangeInfo = { key: string; label: string; startDate: string; endDate: string }

async function drillExpenses(
  rangeInfo: RangeInfo,
  start: Date,
  end: Date,
  page: number,
  pageSize: number,
  q: string,
  filterType: string,
) {
  const where: Record<string, unknown> = {
    isVoided: false,
    isTrialRun: false,
    occurredAt: { gte: start, lte: end },
  }
  if (filterType === 'missing-attachment') where.needsAttachment = true
  if (filterType === 'linked-order') where.externalOrderNo = { not: null }
  if (filterType === 'unlinked-order') where.externalOrderNo = null

  const expenses = await prisma.expense.findMany({
    where,
    include: { _count: { select: { attachments: true } } },
    orderBy: { occurredAt: 'desc' },
  })

  const userMap = await resolveUsersBrief(expenses.map((e) => e.createdBy))

  const byBusinessType: Record<string, number> = {}
  const byPaySource: Record<string, number> = {}
  for (const e of expenses) {
    const label = e.expenseType
      || EXPENSE_BUSINESS_LABELS[e.businessType as keyof typeof EXPENSE_BUSINESS_LABELS]
      || '其他'
    byBusinessType[label] = (byBusinessType[label] || 0) + toNumber(e.amount)
    byPaySource[e.paySource] = (byPaySource[e.paySource] || 0) + toNumber(e.amount)
  }

  const rows = expenses
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      amount: toNumber(e.amount),
      expenseType: e.expenseType,
      paySource: e.paySource,
      externalOrderNo: e.externalOrderNo,
      createdByName: userMap.get(e.createdBy)?.displayName || userMap.get(e.createdBy)?.username || '未知',
      attachmentCount: e._count.attachments,
      needsAttachment: e.needsAttachment,
      detailPath: `/expense/${e.id}`,
    }))
    .filter((r) => matchSearch(q, r.externalOrderNo, r.createdByName, r.expenseType, r.paySource))

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  const paged = paginate(rows, page, pageSize)

  const titles: Record<string, string> = {
    expenses: '支出明细',
    'by-category': '按分类支出',
    'by-pay-source': '按付款来源',
    'missing-attachment': '待补凭证',
    'linked-order': '已关联订单',
    'unlinked-order': '未关联订单',
  }

  return {
    type: filterType,
    title: titles[filterType] || '支出明细',
    range: rangeInfo,
    summary: {
      totalAmount,
      count: rows.length,
      label: '合计支出',
      byBusinessType,
      byPaySource,
    },
    items: paged.items,
    pagination: { total: paged.total, page, pageSize, hasMore: paged.hasMore },
  }
}
