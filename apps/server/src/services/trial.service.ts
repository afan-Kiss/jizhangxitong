import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'
import { voidExpense } from './expense.service'
import { refundSale } from './sale.service'
import { writeOperationLog } from './operation-log.service'
import { AuthRequest } from '../middleware/auth'

export interface TrialPreview {
  expenseCount: number
  expenseAmount: number
  saleCount: number
  saleAmount: number
  exportCount: number
  expenseIds: number[]
  saleIds: number[]
}

export interface TrialCleanupResult {
  preview: TrialPreview
  expensesVoided: number[]
  salesRefunded: number[]
  exportsMarked: number[]
  summaryAfter: { pendingAmount: number; todayAmount: number }
}

export async function previewTrialData(): Promise<TrialPreview> {
  const expenses = await prisma.expense.findMany({
    where: { isTrialRun: true, isVoided: false },
  })
  const sales = await prisma.sale.findMany({
    where: { isTrialRun: true, status: 'sold' },
  })
  const exports = await prisma.exportTask.findMany({
    where: { isTrialRun: true },
  })

  return {
    expenseCount: expenses.length,
    expenseAmount: expenses.reduce((s, e) => s + toNumber(e.amount), 0),
    saleCount: sales.length,
    saleAmount: sales.reduce((s, e) => s + toNumber(e.saleAmount), 0),
    exportCount: exports.length,
    expenseIds: expenses.map((e) => e.id),
    saleIds: sales.map((s) => s.id),
  }
}

export async function cleanupTrialData(operator: AuthRequest['user']): Promise<TrialCleanupResult> {
  const preview = await previewTrialData()
  const expensesVoided: number[] = []
  const salesRefunded: number[] = []

  for (const expense of await prisma.expense.findMany({
    where: { isTrialRun: true, isVoided: false },
  })) {
    await voidExpense(expense.id, 'trial cleanup', operator)
    expensesVoided.push(expense.id)
  }

  for (const sale of await prisma.sale.findMany({
    where: { isTrialRun: true, status: 'sold' },
  })) {
    await refundSale(
      sale.id,
      { refundAmount: toNumber(sale.saleAmount), refundReason: 'trial cleanup' },
      operator,
    )
    salesRefunded.push(sale.id)
  }

  const exportsMarked = await prisma.exportTask.findMany({
    where: { isTrialRun: true, status: { not: 'cancelled' } },
    select: { id: true },
  })
  await prisma.exportTask.updateMany({
    where: { isTrialRun: true },
    data: { status: 'cancelled', errorMessage: 'trial cleanup' },
  })

  await writeOperationLog({
    module: 'trial',
    action: 'cleanup_trial_data',
    targetType: 'trial',
    afterJson: { preview, expensesVoided, salesRefunded },
    operator,
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const activeExpenses = await prisma.expense.findMany({
    where: { isVoided: false, isTrialRun: false, occurredAt: { gte: today, lt: tomorrow } },
  })
  const pendingExpenses = await prisma.expense.findMany({
    where: {
      isVoided: false,
      isTrialRun: false,
      reimbursementStatus: 'pending',
      paySource: '员工垫付',
    },
  })

  return {
    preview,
    expensesVoided,
    salesRefunded,
    exportsMarked: exportsMarked.map((e) => e.id),
    summaryAfter: {
      todayAmount: activeExpenses.reduce((s, e) => s + toNumber(e.amount), 0),
      pendingAmount: pendingExpenses.reduce((s, e) => s + toNumber(e.amount), 0),
    },
  }
}

export async function promoteTrialToFormal(
  operator: AuthRequest['user'],
  input?: { expenseIds?: number[]; saleIds?: number[]; all?: boolean },
) {
  const expenseWhere = input?.all
    ? { isTrialRun: true, isVoided: false }
    : input?.expenseIds?.length
      ? { id: { in: input.expenseIds }, isTrialRun: true }
      : null

  const saleWhere = input?.all
    ? { isTrialRun: true, status: 'sold' }
    : input?.saleIds?.length
      ? { id: { in: input.saleIds }, isTrialRun: true }
      : null

  let expenseCount = 0
  let saleCount = 0

  if (expenseWhere) {
    const r = await prisma.expense.updateMany({
      where: expenseWhere,
      data: { isTrialRun: false },
    })
    expenseCount = r.count
  }

  if (saleWhere) {
    const r = await prisma.sale.updateMany({
      where: saleWhere,
      data: { isTrialRun: false },
    })
    saleCount = r.count
  }

  await prisma.exportTask.updateMany({
    where: { isTrialRun: true },
    data: { isTrialRun: false },
  })

  await writeOperationLog({
    module: 'trial',
    action: 'promote_trial_to_formal',
    targetType: 'trial',
    afterJson: { expenseCount, saleCount, input },
    operator,
  })

  return { expenseCount, saleCount }
}
