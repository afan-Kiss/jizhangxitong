import { isProfitDeductingExpense } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { startOfDay, endOfDay, parseDateInput, localDateString } from '../lib/utils'
import { sumMoney, toMoneyNumber, moneyAdd } from '../lib/money'
import { getExpenseSummary } from '../services/expense.service'
import { getBiSummary } from '../services/bi.service'
import { queryExpensesForExport } from '../services/export.service'
import {
  aggregateProfitFromLedger,
  calculateProfit,
} from '../finance/core-ledger'
import {
  type ReconcileAlert,
  type ReconcileStatus,
  createAlert,
  createAmountMismatchAlert,
  filterAlertsForResponse,
  resolveOverallStatus,
  isFloatToleranceDiff,
} from './alarm.service'

export type DailyReconcileTotals = {
  totalAmount: number
  count: number
  income?: number
  cost?: number
  refund?: number
  compensation?: number
  netProfit?: number
}

export type DailyReconcileDiff = {
  bi_vs_expense: { expected: number; actual: number; diff: number }
  export_vs_bi: { expected: number; actual: number; diff: number }
  export_vs_expense: { expected: number; actual: number; diff: number }
  export_vs_ledger_expense: { expected: number; actual: number; diff: number }
  ledger_vs_expense: { expected: number; actual: number; diff: number }
  ledger_vs_bi: { expected: number; actual: number; diff: number }
  ledger_vs_sale: { expected: number; actual: number; diff: number }
}

export type DailyReconcileResult = {
  date: string
  status: ReconcileStatus
  ranAt: string
  ledger: DailyReconcileTotals
  bi: DailyReconcileTotals
  expense: DailyReconcileTotals
  sale: DailyReconcileTotals
  export: DailyReconcileTotals
  diff: DailyReconcileDiff
  alerts: ReconcileAlert[]
}

function dayRange(dateStr: string) {
  const start = startOfDay(parseDateInput(dateStr))
  const end = endOfDay(start)
  return { start, end }
}

async function aggregateLedgerForDay(start: Date, end: Date) {
  const rows = await prisma.financeLedger.findMany({
    where: { occurredAt: { gte: start, lte: end } },
  })

  let income = 0
  let cost = 0
  let refund = 0
  let compensation = 0
  let expenseLinked = 0

  for (const row of rows) {
    const amt = toMoneyNumber(row.amount)
    switch (row.category) {
      case 'income': income = moneyAdd(income, amt); break
      case 'cost': cost = moneyAdd(cost, amt); break
      case 'refund': refund = moneyAdd(refund, amt); break
      case 'compensation':
        compensation = moneyAdd(compensation, amt)
        if (row.expenseId) expenseLinked = moneyAdd(expenseLinked, amt)
        break
      default: break
    }
  }

  return {
    rows,
    totals: {
      totalAmount: sumMoney(rows.map((r) => r.amount)),
      count: rows.length,
      income,
      cost,
      refund,
      compensation,
      expenseLinked,
      netProfit: moneyAdd(income, -cost, -refund, -compensation),
    },
  }
}

async function aggregateExpenseForDay(start: Date, end: Date) {
  const expenses = await prisma.expense.findMany({
    where: { isVoided: false, isTrialRun: false, occurredAt: { gte: start, lte: end } },
  })
  const ledgerTracked = expenses.filter((e) => isProfitDeductingExpense(e))
  return {
    expenses,
    totals: {
      totalAmount: sumMoney(expenses.map((e) => e.amount)),
      count: expenses.length,
      ledgerTrackedAmount: sumMoney(ledgerTracked.map((e) => e.amount)),
      ledgerTrackedCount: ledgerTracked.length,
    },
  }
}

async function aggregateSaleForDay(start: Date, end: Date) {
  const sales = await prisma.sale.findMany({
    where: {
      isTrialRun: false,
      soldAt: { gte: start, lte: end },
      status: { in: ['sold', 'refunded'] },
    },
    include: { refunds: true, expenses: { where: { isVoided: false } } },
  })

  let income = 0
  let cost = 0
  let netProfit = 0

  for (const sale of sales) {
    income = moneyAdd(income, toMoneyNumber(sale.saleAmount))
    cost = moneyAdd(cost, toMoneyNumber(sale.totalCostSnapshot))
    netProfit = moneyAdd(netProfit, toMoneyNumber(sale.finalProfit))
  }

  return {
    sales,
    totals: {
      totalAmount: income,
      count: sales.length,
      income,
      cost,
      netProfit,
    },
  }
}

async function aggregateExportForDay(dateStr: string) {
  const expenses = await queryExpensesForExport({
    startDate: dateStr,
    endDate: dateStr,
    isVoided: false,
    excludeTrial: true,
  })
  return {
    totalAmount: sumMoney(expenses.map((e) => e.amount)),
    count: expenses.length,
  }
}

async function detectDuplicateLedger(alerts: ReconcileAlert[]) {
  const rows = await prisma.financeLedger.findMany({
    select: { id: true, refType: true, refId: true, entryType: true, saleId: true, expenseId: true, category: true, amount: true },
  })
  const keyCount = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = `${row.refType}|${row.refId}|${row.entryType}`
    const list = keyCount.get(key) || []
    list.push(row)
    keyCount.set(key, list)
  }
  for (const [key, list] of keyCount) {
    if (list.length <= 1) continue
    alerts.push(createAlert({
      level: 'L3',
      type: 'duplicate_ledger',
      dimension: 'ledger_integrity',
      message: `账本分录重复：${key} 共 ${list.length} 条`,
      refId: key,
      details: { ids: list.map((r) => r.id) },
    }))
  }

  const expenseMap = new Map<number, number>()
  for (const row of rows) {
    if (!row.expenseId || row.category !== 'compensation') continue
    expenseMap.set(row.expenseId, (expenseMap.get(row.expenseId) || 0) + 1)
  }
  for (const [expenseId, count] of expenseMap) {
    if (count <= 1) continue
    alerts.push(createAlert({
      level: 'L3',
      type: 'duplicate_ledger',
      dimension: 'ledger_vs_expense',
      message: `支出 #${expenseId} 在账本中出现 ${count} 条补偿分录`,
      refId: String(expenseId),
    }))
  }
}

async function detectOrphanLedger(alerts: ReconcileAlert[]) {
  const rows = await prisma.financeLedger.findMany({
    select: { id: true, refType: true, refId: true, expenseId: true, saleId: true, amount: true },
  })

  for (const row of rows) {
    if (row.expenseId) {
      const expense = await prisma.expense.findUnique({ where: { id: row.expenseId } })
      if (!expense || expense.isVoided) {
        alerts.push(createAlert({
          level: 'L3',
          type: 'orphan_ledger',
          dimension: 'ledger_vs_expense',
          message: `账本分录 #${row.id} 关联支出 #${row.expenseId} 不存在或已作废`,
          refId: String(row.id),
          actual: toMoneyNumber(row.amount),
        }))
      }
    }
    if (row.saleId) {
      const sale = await prisma.sale.findUnique({ where: { id: row.saleId } })
      if (!sale || sale.isTrialRun) {
        alerts.push(createAlert({
          level: 'L3',
          type: 'orphan_ledger',
          dimension: 'ledger_vs_sale',
          message: `账本分录 #${row.id} 关联销售 #${row.saleId} 不存在或为试运行`,
          refId: String(row.id),
        }))
      }
    }
    if (row.refType === 'expense' && !row.expenseId) {
      const expense = await prisma.expense.findUnique({ where: { id: Number(row.refId) } })
      if (!expense) {
        alerts.push(createAlert({
          level: 'L3',
          type: 'orphan_ledger',
          dimension: 'ledger_integrity',
          message: `账本分录 #${row.id} 指向不存在的支出 refId=${row.refId}`,
          refId: row.refId,
        }))
      }
    }
    if (row.refType === 'refund') {
      const refund = await prisma.refund.findUnique({ where: { id: Number(row.refId) } })
      if (!refund) {
        alerts.push(createAlert({
          level: 'L3',
          type: 'orphan_ledger',
          dimension: 'ledger_vs_sale',
          message: `账本分录 #${row.id} 指向不存在的退款 #${row.refId}`,
          refId: row.refId,
        }))
      }
    }
  }
}

async function detectNegativeAbnormal(alerts: ReconcileAlert[], expenses: Awaited<ReturnType<typeof aggregateExpenseForDay>>['expenses']) {
  const ledgerRows = await prisma.financeLedger.findMany({
    select: { id: true, amount: true, category: true, refType: true, refId: true },
  })
  for (const row of ledgerRows) {
    const amt = toMoneyNumber(row.amount)
    if (amt < 0) {
      alerts.push(createAlert({
        level: 'L2',
        type: 'negative_abnormal',
        dimension: 'ledger_integrity',
        message: `账本分录 #${row.id} 金额为负：${amt}`,
        refId: String(row.id),
        actual: amt,
      }))
    }
  }
  for (const expense of expenses) {
    const amt = toMoneyNumber(expense.amount)
    if (amt < 0) {
      alerts.push(createAlert({
        level: 'L2',
        type: 'negative_abnormal',
        dimension: 'expense',
        message: `支出 #${expense.id} 金额为负：${amt}`,
        refId: String(expense.id),
        actual: amt,
      }))
    }
  }
}

async function detectTimeInconsistency(alerts: ReconcileAlert[]) {
  const rows = await prisma.financeLedger.findMany({
    where: { expenseId: { not: null } },
    select: { id: true, expenseId: true, occurredAt: true },
  })
  for (const row of rows) {
    if (!row.expenseId) continue
    const expense = await prisma.expense.findUnique({ where: { id: row.expenseId } })
    if (!expense) continue
    const ledgerDay = localDateString(row.occurredAt)
    const expenseDay = localDateString(expense.occurredAt)
    if (ledgerDay !== expenseDay) {
      alerts.push(createAlert({
        level: 'L2',
        type: 'time_inconsistency',
        dimension: 'ledger_vs_expense',
        message: `支出 #${expense.id} 业务日期 ${expenseDay} 与账本分录 #${row.id} 日期 ${ledgerDay} 不一致`,
        refId: String(expense.id),
        details: { ledgerDay, expenseDay },
      }))
    }
  }
}

async function detectLedgerGenerationFailures(
  alerts: ReconcileAlert[],
  sales: Awaited<ReturnType<typeof aggregateSaleForDay>>['sales'],
) {
  for (const sale of sales) {
    const entryCount = await prisma.financeLedger.count({ where: { saleId: sale.id } })
    if (entryCount === 0) {
      alerts.push(createAlert({
        level: 'L4',
        type: 'ledger_generation_failure',
        dimension: 'ledger_vs_sale',
        message: `销售 #${sale.id} 应有账本分录但一条都没有`,
        refId: String(sale.id),
      }))
      continue
    }
    const agg = await aggregateProfitFromLedger(sale.id)
    const calc = calculateProfit({
      saleAmount: sale.saleAmount,
      totalCostSnapshot: sale.totalCostSnapshot,
      grossProfit: sale.grossProfit,
      refunds: sale.refunds,
      expenses: sale.expenses,
    })
    if (!agg) {
      alerts.push(createAlert({
        level: 'L4',
        type: 'ledger_generation_failure',
        dimension: 'ledger_vs_sale',
        message: `销售 #${sale.id} 无法从账本聚合利润`,
        refId: String(sale.id),
      }))
      continue
    }
    if (!isFloatToleranceDiff(calc.netProfit, agg.netProfit)) {
      const alert = createAmountMismatchAlert({
        dimension: 'ledger_vs_sale',
        expected: calc.netProfit,
        actual: agg.netProfit,
        message: `销售 #${sale.id} 账本利润与计算利润不一致`,
        refId: String(sale.id),
      })
      if (alert) alerts.push(alert)
    }
  }
}

function pushAmountAlert(alerts: ReconcileAlert[], input: Parameters<typeof createAmountMismatchAlert>[0]) {
  const alert = createAmountMismatchAlert(input)
  if (alert) alerts.push(alert)
}

/** 按天对账 — 只读检测层，不修改业务数据 */
export async function runDailyReconcile(dateStr?: string): Promise<DailyReconcileResult> {
  const date = dateStr?.trim() || localDateString()
  const { start, end } = dayRange(date)
  const alerts: ReconcileAlert[] = []

  const [expenseAgg, ledgerAgg, saleAgg, exportTotals, expenseSummary, biSummary] = await Promise.all([
    aggregateExpenseForDay(start, end),
    aggregateLedgerForDay(start, end),
    aggregateSaleForDay(start, end),
    aggregateExportForDay(date),
    getExpenseSummary('custom', date, date),
    getBiSummary('custom', date, date),
  ])

  const expenseTotals: DailyReconcileTotals = {
    totalAmount: expenseAgg.totals.totalAmount,
    count: expenseAgg.totals.count,
  }
  const biTotals: DailyReconcileTotals = {
    totalAmount: biSummary.expenseAmount,
    count: biSummary.expenseCount,
  }
  const ledgerTotals: DailyReconcileTotals = {
    totalAmount: ledgerAgg.totals.totalAmount,
    count: ledgerAgg.totals.count,
    income: ledgerAgg.totals.income,
    cost: ledgerAgg.totals.cost,
    refund: ledgerAgg.totals.refund,
    compensation: ledgerAgg.totals.compensation,
    netProfit: ledgerAgg.totals.netProfit,
  }
  const saleTotals: DailyReconcileTotals = {
    totalAmount: saleAgg.totals.income,
    count: saleAgg.totals.count,
    income: saleAgg.totals.income,
    cost: saleAgg.totals.cost,
    netProfit: saleAgg.totals.netProfit,
  }
  const exportTotal: DailyReconcileTotals = {
    totalAmount: exportTotals.totalAmount,
    count: exportTotals.count,
  }

  const diff: DailyReconcileDiff = {
    bi_vs_expense: {
      expected: expenseSummary.totalAmount,
      actual: biSummary.expenseAmount,
      diff: Math.abs(biSummary.expenseAmount - expenseSummary.totalAmount),
    },
    export_vs_bi: {
      expected: biSummary.expenseAmount,
      actual: exportTotals.totalAmount,
      diff: Math.abs(exportTotals.totalAmount - biSummary.expenseAmount),
    },
    export_vs_expense: {
      expected: expenseAgg.totals.totalAmount,
      actual: exportTotals.totalAmount,
      diff: Math.abs(exportTotals.totalAmount - expenseAgg.totals.totalAmount),
    },
    export_vs_ledger_expense: {
      expected: ledgerAgg.totals.expenseLinked,
      actual: exportTotals.totalAmount,
      diff: Math.abs(exportTotals.totalAmount - ledgerAgg.totals.expenseLinked),
    },
    ledger_vs_expense: {
      expected: expenseAgg.totals.ledgerTrackedAmount,
      actual: ledgerAgg.totals.expenseLinked,
      diff: Math.abs(ledgerAgg.totals.expenseLinked - expenseAgg.totals.ledgerTrackedAmount),
    },
    ledger_vs_bi: {
      expected: biSummary.expenseAmount,
      actual: ledgerAgg.totals.expenseLinked,
      diff: Math.abs(biSummary.expenseAmount - ledgerAgg.totals.expenseLinked),
    },
    ledger_vs_sale: {
      expected: saleAgg.totals.income,
      actual: ledgerAgg.totals.income,
      diff: Math.abs(ledgerAgg.totals.income - saleAgg.totals.income),
    },
  }

  pushAmountAlert(alerts, {
    dimension: 'bi_vs_expense',
    expected: diff.bi_vs_expense.expected,
    actual: diff.bi_vs_expense.actual,
    message: 'BI 汇总与支出表合计不一致',
  })
  pushAmountAlert(alerts, {
    dimension: 'export_vs_bi',
    expected: diff.export_vs_bi.expected,
    actual: diff.export_vs_bi.actual,
    message: '导出合计与 BI 汇总不一致',
  })
  pushAmountAlert(alerts, {
    dimension: 'export_vs_expense',
    expected: diff.export_vs_expense.expected,
    actual: diff.export_vs_expense.actual,
    message: '导出合计与支出表不一致',
  })
  pushAmountAlert(alerts, {
    dimension: 'ledger_vs_expense',
    expected: diff.ledger_vs_expense.expected,
    actual: diff.ledger_vs_expense.actual,
    message: '账本补偿分录与应入账支出不一致',
  })
  if (saleAgg.totals.count > 0) {
    pushAmountAlert(alerts, {
      dimension: 'ledger_vs_sale',
      expected: diff.ledger_vs_sale.expected,
      actual: diff.ledger_vs_sale.actual,
      message: '账本销售收入与销售表不一致',
    })
  }

  await detectDuplicateLedger(alerts)
  await detectOrphanLedger(alerts)
  await detectNegativeAbnormal(alerts, expenseAgg.expenses)
  await detectTimeInconsistency(alerts)
  await detectLedgerGenerationFailures(alerts, saleAgg.sales)

  const status = resolveOverallStatus(alerts)

  return {
    date,
    status,
    ranAt: new Date().toISOString(),
    ledger: ledgerTotals,
    bi: biTotals,
    expense: expenseTotals,
    sale: saleTotals,
    export: exportTotal,
    diff,
    alerts: filterAlertsForResponse(alerts),
  }
}
