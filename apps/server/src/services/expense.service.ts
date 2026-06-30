import { prisma } from '../lib/prisma'
import { generateNo, toNumber, startOfDay, endOfDay, startOfWeek, startOfMonth } from '../lib/utils'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { clampPage, clampPageSize } from '../lib/pagination'
import { resolveBraceletBinding } from '../lib/bracelet-bind'
import { sanitizeFile } from '../lib/serialize'
import { refreshBraceletCostTotal } from './goods.service'

export interface ExpenseFilter {
  startDate?: string
  endDate?: string
  expenseType?: string
  paySource?: string
  reimbursementStatus?: string
  reimbursementPerson?: string
  braceletCode?: string
  onlyWithBracelet?: boolean
  isVoided?: boolean
  isTrialRun?: boolean
  excludeTrial?: boolean
  needsAttachment?: boolean
  page?: number
  pageSize?: number
}

function buildWhere(filter: ExpenseFilter) {
  const where: Record<string, unknown> = {}
  if (filter.isVoided !== undefined) where.isVoided = filter.isVoided
  else where.isVoided = false

  if (filter.startDate || filter.endDate) {
    where.occurredAt = {}
    if (filter.startDate) (where.occurredAt as Record<string, Date>).gte = startOfDay(new Date(filter.startDate))
    if (filter.endDate) (where.occurredAt as Record<string, Date>).lte = endOfDay(new Date(filter.endDate))
  }
  if (filter.expenseType) where.expenseType = filter.expenseType
  if (filter.paySource) where.paySource = filter.paySource
  if (filter.reimbursementStatus && filter.reimbursementStatus !== 'all') {
    where.reimbursementStatus = filter.reimbursementStatus
  }
  if (filter.reimbursementPerson) {
    where.reimbursementPerson = { contains: filter.reimbursementPerson }
  }
  if (filter.braceletCode) where.braceletCode = { contains: filter.braceletCode }
  if (filter.onlyWithBracelet) where.braceletId = { not: null }
  if (filter.needsAttachment) where.needsAttachment = true
  // 正式业务始终排除遗留试用数据
  where.isTrialRun = false
  return where
}

export async function listExpenses(filter: ExpenseFilter) {
  const page = clampPage(filter.page)
  const pageSize = clampPageSize(filter.pageSize)
  const where = buildWhere(filter)
  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { attachments: { include: { file: true } } },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ])
  const sanitized = items.map((e) => ({
    ...e,
    attachments: e.attachments.map((a) => ({
      ...a,
      file: a.file ? sanitizeFile(a.file) : a.file,
    })),
  }))
  return { items: sanitized, total, page, pageSize }
}

export async function getExpense(id: number) {
  return prisma.expense.findUnique({
    where: { id },
    include: {
      attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
      bracelet: true,
      sale: true,
    },
  })
}

export async function createExpense(
  input: {
    amount: number
    expenseType: string
    paySource: string
    occurredAt: string
    braceletCode?: string
    braceletId?: number
    saleId?: number
    expenseSummary?: string
    remark?: string
    reimbursementPerson?: string
    reimbursementStatus?: string
    attachmentFileIds?: number[]
    attachments?: Array<{ fileId: number; fileType: string }>
    needsAttachment?: boolean
  },
  operator: AuthRequest['user'],
) {
  if (!input.amount || input.amount <= 0) throw new Error('金额必须大于 0')

  const binding = await resolveBraceletBinding(input.braceletCode, input.braceletId, operator)
  const braceletId = binding.braceletId
  const braceletCode = binding.braceletCode
  if (input.braceletCode?.trim() && !braceletId) {
    throw new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
  }

  let reimbursementStatus = input.reimbursementStatus || 'pending'
  if (input.paySource !== '员工垫付') {
    reimbursementStatus = input.reimbursementStatus || 'not_required'
  }

  const expense = await prisma.expense.create({
    data: {
      expenseNo: generateNo('EX'),
      braceletId,
      braceletCode,
      saleId: input.saleId,
      expenseType: input.expenseType,
      paySource: input.paySource,
      amount: input.amount,
      occurredAt: new Date(input.occurredAt),
      expenseSummary: input.expenseSummary,
      remark: input.remark,
      reimbursementPerson: input.reimbursementPerson,
      reimbursementStatus,
      needsAttachment: input.needsAttachment || false,
      isTrialRun: false,
      createdBy: operator!.userId,
    },
  })

  const attachmentItems = input.attachments?.length
    ? input.attachments
    : (input.attachmentFileIds || []).map((fileId) => ({ fileId, fileType: 'payment_screenshot' }))

  if (attachmentItems.length) {
    await prisma.expenseAttachment.createMany({
      data: attachmentItems.map((item, idx) => ({
        expenseId: expense.id,
        fileId: item.fileId,
        fileType: item.fileType,
        sortOrder: idx,
      })),
    })
    await prisma.file.updateMany({
      where: { id: { in: attachmentItems.map((i) => i.fileId) } },
      data: { relatedType: 'expense', relatedId: expense.id },
    })
  }

  if (braceletId) await refreshBraceletCostTotal(braceletId)

  await writeOperationLog({
    module: 'expense',
    action: 'create_expense',
    targetType: 'expense',
    targetId: expense.id,
    targetCode: expense.expenseNo,
    afterJson: expense,
    operator,
  })

  return getExpense(expense.id)
}

export async function updateExpense(
  id: number,
  input: Partial<{
    amount: number
    expenseType: string
    paySource: string
    occurredAt: string
    braceletCode: string
    expenseSummary: string
    remark: string
    reimbursementPerson: string
    reimbursementStatus: string
    needsAttachment: boolean
  }>,
  operator: AuthRequest['user'],
) {
  const before = await prisma.expense.findUnique({ where: { id } })
  if (!before) throw new Error('支出不存在')
  if (before.isVoided) throw new Error('这条记录现在不能改')

  const oldBraceletId = before.braceletId
  const data: Record<string, unknown> = { ...input }
  if (input.occurredAt) data.occurredAt = new Date(input.occurredAt)
  if (input.amount !== undefined && input.amount <= 0) throw new Error('金额得填一下')
  if (input.braceletCode !== undefined) {
    const binding = await resolveBraceletBinding(input.braceletCode, undefined, operator)
    if (input.braceletCode.trim() && !binding.braceletId) {
      throw new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
    }
    data.braceletId = binding.braceletId
    data.braceletCode = binding.braceletCode
  }

  const expense = await prisma.expense.update({ where: { id }, data })

  const newBraceletId = expense.braceletId
  if (newBraceletId) await refreshBraceletCostTotal(newBraceletId)
  if (oldBraceletId && oldBraceletId !== newBraceletId) {
    await refreshBraceletCostTotal(oldBraceletId)
  }

  await writeOperationLog({
    module: 'expense',
    action: 'update_expense',
    targetType: 'expense',
    targetId: id,
    targetCode: before.expenseNo,
    beforeJson: before,
    afterJson: expense,
    operator,
  })

  return getExpense(id)
}

export async function voidExpense(id: number, voidReason: string, operator: AuthRequest['user']) {
  const before = await prisma.expense.findUnique({ where: { id } })
  if (!before) throw new Error('支出不存在')

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      isVoided: true,
      voidReason,
      voidedAt: new Date(),
      voidedBy: operator!.userId,
    },
  })

  if (before.braceletId) {
    await refreshBraceletCostTotal(before.braceletId)
  }

  await writeOperationLog({
    module: 'expense',
    action: 'void_expense',
    targetType: 'expense',
    targetId: id,
    targetCode: before.expenseNo,
    beforeJson: before,
    afterJson: expense,
    operator,
  })

  return expense
}

export async function updateReimbursementStatus(
  id: number,
  status: string,
  remark?: string,
  operator?: AuthRequest['user'],
) {
  const before = await prisma.expense.findUnique({ where: { id } })
  if (!before) throw new Error('支出不存在')

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      reimbursementStatus: status,
      remark: remark || before.remark,
    },
  })

  await writeOperationLog({
    module: 'reimbursement',
    action: 'update_reimbursement_status',
    targetType: 'expense',
    targetId: id,
    targetCode: before.expenseNo,
    beforeJson: { status: before.reimbursementStatus },
    afterJson: { status },
    operator,
  })

  return expense
}

export async function addAttachments(
  expenseId: number,
  items: Array<{ fileId: number; fileType: string }>,
  operator?: AuthRequest['user'],
) {
  const maxOrder = await prisma.expenseAttachment.aggregate({
    where: { expenseId },
    _max: { sortOrder: true },
  })
  let order = (maxOrder._max.sortOrder || 0) + 1

  for (const item of items) {
    await prisma.expenseAttachment.create({
      data: {
        expenseId,
        fileId: item.fileId,
        fileType: item.fileType,
        sortOrder: order++,
      },
    })
    await prisma.file.update({
      where: { id: item.fileId },
      data: { relatedType: 'expense', relatedId: expenseId },
    })
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: { needsAttachment: false },
  })

  await writeOperationLog({
    module: 'expense',
    action: 'upload_attachment',
    targetType: 'expense',
    targetId: expenseId,
    afterJson: { fileIds: items.map((i) => i.fileId) },
    operator,
  })

  return getExpense(expenseId)
}

export async function getExpenseSummary(period?: string, startDate?: string, endDate?: string) {
  const now = new Date()
  let start: Date
  let end: Date = endOfDay(now)

  switch (period) {
    case 'today':
      start = startOfDay(now)
      break
    case 'week':
      start = startOfWeek(now)
      break
    case '15days':
      start = startOfDay(now)
      start.setDate(start.getDate() - 14)
      break
    case 'month':
      start = startOfMonth(now)
      break
    case 'custom':
      start = startDate ? startOfDay(new Date(startDate)) : startOfMonth(now)
      end = endDate ? endOfDay(new Date(endDate)) : endOfDay(now)
      break
    default:
      start = startOfDay(now)
  }

  const baseWhere = { isVoided: false, isTrialRun: false, occurredAt: { gte: start, lte: end } }

  const expenses = await prisma.expense.findMany({ where: baseWhere })
  const totalAmount = expenses.reduce((s, e) => s + toNumber(e.amount), 0)

  const byType: Record<string, number> = {}
  const byPaySource: Record<string, number> = {}
  const byPerson: Record<string, number> = {}
  const byReimbursement: Record<string, number> = {}

  for (const e of expenses) {
    byType[e.expenseType] = (byType[e.expenseType] || 0) + toNumber(e.amount)
    byPaySource[e.paySource] = (byPaySource[e.paySource] || 0) + toNumber(e.amount)
    const person = e.reimbursementPerson || '未填写'
    byPerson[person] = (byPerson[person] || 0) + toNumber(e.amount)
    byReimbursement[e.reimbursementStatus] = (byReimbursement[e.reimbursementStatus] || 0) + toNumber(e.amount)
  }

  const compensationAmount = (byType['客户补偿'] || 0) + (byType['售后补偿'] || 0)

  const pendingExpenses = await prisma.expense.findMany({
    where: { isVoided: false, isTrialRun: false, reimbursementStatus: 'pending', paySource: '员工垫付' },
  })
  const pendingAmount = pendingExpenses.reduce((s, e) => s + toNumber(e.amount), 0)
  const pendingCount = pendingExpenses.length

  const needsAttachment = await prisma.expense.count({
    where: { isVoided: false, isTrialRun: false, needsAttachment: true },
  })

  return {
    period: { start, end },
    totalAmount,
    byType,
    byPaySource,
    byPerson,
    byReimbursement,
    compensationAmount,
    pendingAmount,
    pendingCount,
    needsAttachmentCount: needsAttachment,
  }
}

export async function listPendingReimbursements() {
  return prisma.expense.findMany({
    where: {
      isVoided: false,
      isTrialRun: false,
      paySource: '员工垫付',
      reimbursementStatus: 'pending',
    },
    include: { attachments: { include: { file: true } } },
    orderBy: { occurredAt: 'desc' },
  })
}

export { buildWhere }
