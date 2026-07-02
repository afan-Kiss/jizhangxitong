import { getExpenseSummary } from './expense.service'
import { startOfDay, endOfDay, startOfMonth, localDateString } from '../lib/utils'

export async function getHomeDashboard() {
  const [expenseToday, expenseMonth] = await Promise.all([
    getExpenseSummary('today'),
    getExpenseSummary('month'),
  ])

  return {
    todayExpenseAmount: expenseToday.totalAmount,
    todayExpenseCount: expenseToday.totalCount,
    monthExpenseAmount: expenseMonth.totalAmount,
    missingAttachmentCount: expenseToday.needsAttachmentCount,
    pendingReimbursementAmount: expenseMonth.pendingReimbursementAmount,
    labels: {
      expense: '今日支出',
      month: '本月支出',
    },
  }
}

/** @deprecated 销售汇总已下线 */
export async function getSalesSummary() {
  return {
    period: { start: new Date(), end: new Date() },
    totalSaleAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    totalRefund: 0,
    effectiveSaleAmount: 0,
    effectiveOrderCount: 0,
    ruleHint: '该模块已下线，现在系统只记录项目资金支出。',
  }
}

export async function getMonthlyReport(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = endOfDay(new Date(year, month, 0))
  const summary = await getExpenseSummary(
    'custom',
    localDateString(start),
    localDateString(end),
  )

  return {
    year,
    month,
    expenseTotal: summary.totalAmount,
    expenseCount: summary.totalCount,
    byType: summary.byType,
    byPaySource: summary.byPaySource,
    linkedOrderCount: summary.linkedOrderCount,
    unlinkedOrderCount: summary.unlinkedOrderCount,
    needsAttachmentCount: summary.needsAttachmentCount,
  }
}
