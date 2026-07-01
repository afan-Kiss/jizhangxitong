import { getExpenseSummary } from './expense.service'
import { prisma } from '../lib/prisma'
import { startOfDay, endOfDay, startOfMonth } from '../lib/utils'
import {
  calculateProfit,
  calculateEffectiveSales,
  PROFIT_DEDUCT_EXPENSE_INCLUDE,
  EFFECTIVE_SALES_RULE_HINT,
} from '../finance/core-ledger'

export {
  saleProfitRow,
  calculateProfit,
  calculateEffectiveSales,
  PROFIT_DEDUCT_EXPENSE_INCLUDE,
  EFFECTIVE_SALES_RULE_HINT,
  isConfirmedRefund,
} from '../finance/core-ledger'

/** @deprecated alias */
export { PROFIT_DEDUCT_EXPENSE_INCLUDE as COMPENSATION_EXPENSE_INCLUDE } from '../finance/core-ledger'

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
    include: {
      refunds: true,
      expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE,
    },
  })

  let todaySaleAmount = 0
  let todayProfit = 0
  for (const s of todaySales) {
    const fin = calculateProfit(s)
    todaySaleAmount += fin.income
    todayProfit += fin.netProfit
  }

  return {
    todayExpenseAmount: expenseToday.totalAmount,
    todaySaleAmount,
    todayProfit,
    labels: {
      expense: '今天花了多少钱',
      sale: '今天卖了多少钱',
      profit: '今天大概赚了多少',
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
    include: {
      refunds: true,
      expenses: PROFIT_DEDUCT_EXPENSE_INCLUDE,
    },
  })

  let totalSaleAmount = 0
  let totalCost = 0
  let totalProfit = 0
  let totalRefund = 0

  for (const s of sales) {
    const fin = calculateProfit(s)
    if (s.status === 'sold') {
      totalSaleAmount += fin.income
      totalCost += fin.cost
      totalProfit += fin.netProfit
      totalRefund += fin.refund
    }
  }

  const effective = calculateEffectiveSales(sales)

  return {
    period: { start, end },
    totalSaleAmount,
    totalCost,
    totalProfit,
    totalRefund,
    effectiveSaleAmount: effective.effectiveSaleAmount,
    effectiveOrderCount: effective.effectiveOrderCount,
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
    saleAmount: salesSummary.totalSaleAmount,
    grossProfit: salesSummary.totalProfit,
    refundImpact: salesSummary.totalRefund,
    effectiveSaleAmount: salesSummary.effectiveSaleAmount,
    effectiveOrderCount: salesSummary.effectiveOrderCount,
    ruleHint: EFFECTIVE_SALES_RULE_HINT,
  }
}
