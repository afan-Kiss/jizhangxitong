import { isEffectiveSale, EFFECTIVE_SALES_RULE_HINT } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { toNumber, startOfDay, endOfDay, startOfMonth } from '../lib/utils'
import { getExpenseSummary } from './expense.service'

function saleProfitRow(sale: {
  saleAmount: unknown
  totalCostSnapshot: unknown
  grossProfit: unknown
  finalProfit: unknown
  status: string
  refunds?: { refundAmount: unknown }[]
}) {
  const refundSum = (sale.refunds || []).reduce((s, r) => s + toNumber(r.refundAmount as string | number), 0)
  const saleAmount = toNumber(sale.saleAmount as string | number)
  const cost = toNumber(sale.totalCostSnapshot as string | number)
  const gross = toNumber(sale.grossProfit as string | number)
  const profit = gross - refundSum
  const margin = saleAmount > 0 ? (profit / saleAmount) * 100 : 0
  return {
    saleAmount,
    cost,
    grossProfit: gross,
    refundAmount: refundSum,
    profit,
    profitMargin: Math.round(margin * 100) / 100,
  }
}

export async function getHomeDashboard() {
  const expenseToday = await getExpenseSummary('today')
  const now = new Date()
  const dayStart = startOfDay(now)
  const dayEnd = endOfDay(now)

  const todaySales = await prisma.sale.findMany({
    where: {
      isTrialRun: false,
      status: 'sold',
      soldAt: { gte: dayStart, lte: dayEnd },
    },
    include: { refunds: true },
  })

  let todaySaleAmount = 0
  let todayProfit = 0
  for (const s of todaySales) {
    const row = saleProfitRow(s)
    todaySaleAmount += row.saleAmount
    todayProfit += row.profit
  }

  return {
    todayExpenseAmount: expenseToday.totalAmount,
    todaySaleAmount,
    todayProfit,
    pendingReimbursementAmount: expenseToday.pendingAmount,
    pendingReimbursementCount: expenseToday.pendingCount,
    labels: {
      expense: '今天花了多少钱',
      sale: '今天卖了多少钱',
      profit: '今天大概赚了多少',
      pending: '还有多少没报销',
    },
  }
}

export async function getSalesSummary(period?: string, startDate?: string, endDate?: string) {
  const now = new Date()
  let start: Date
  let end: Date = endOfDay(now)

  switch (period) {
    case 'today':
      start = startOfDay(now)
      break
    case 'month':
      start = startOfMonth(now)
      break
    case 'custom':
      start = startDate ? startOfDay(new Date(startDate)) : startOfMonth(now)
      end = endDate ? endOfDay(new Date(endDate)) : endOfDay(now)
      break
    default:
      start = startOfMonth(now)
  }

  const sales = await prisma.sale.findMany({
    where: {
      isTrialRun: false,
      soldAt: { gte: start, lte: end },
    },
    include: { refunds: true },
  })

  let totalSaleAmount = 0
  let totalCost = 0
  let totalProfit = 0
  let totalRefund = 0
  let effectiveSaleAmount = 0
  let effectiveOrderCount = 0

  for (const s of sales) {
    const row = saleProfitRow(s)
    if (s.status === 'sold') {
      totalSaleAmount += row.saleAmount
      totalCost += row.cost
      totalProfit += row.profit
      totalRefund += row.refundAmount
    }
    if (isEffectiveSale(s.status, s.afterSaleStatus)) {
      effectiveSaleAmount += row.saleAmount - row.refundAmount
      effectiveOrderCount += 1
    }
  }

  return {
    period: { start, end },
    totalSaleAmount,
    totalCost,
    totalProfit,
    totalRefund,
    effectiveSaleAmount,
    effectiveOrderCount,
    ruleHint: EFFECTIVE_SALES_RULE_HINT,
  }
}

export async function getMonthlyReport(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = endOfDay(new Date(year, month, 0))

  const [expenseSummary, salesSummary] = await Promise.all([
    getExpenseSummary('custom', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)),
    getSalesSummary('custom', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)),
  ])

  return {
    year,
    month,
    expenseTotal: expenseSummary.totalAmount,
    pendingReimbursement: expenseSummary.pendingAmount,
    saleAmount: salesSummary.totalSaleAmount,
    grossProfit: salesSummary.totalProfit,
    refundImpact: salesSummary.totalRefund,
    effectiveSaleAmount: salesSummary.effectiveSaleAmount,
    effectiveOrderCount: salesSummary.effectiveOrderCount,
    ruleHint: EFFECTIVE_SALES_RULE_HINT,
  }
}

export { saleProfitRow, EFFECTIVE_SALES_RULE_HINT }
