import {
  EXPENSE_BUSINESS_TYPES,
  PENDING_LINK_STATUSES,
  defaultExpenseTypeForBusiness,
  buildQianfanOrderUrl,
  isProfitDeductingExpense,
  type ExpenseBusinessType,
} from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { generateNo, toNumber, startOfDay, endOfDay, startOfWeek, startOfMonth, parseDateInput } from '../lib/utils'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { getEntityOperationLogs, resolveUserBrief, resolveUsersBrief } from './audit.service'
import { clampPage, clampPageSize } from '../lib/pagination'
import { resolveBraceletBinding } from '../lib/bracelet-bind'
import { sanitizeFile } from '../lib/serialize'
import { refreshBraceletCostTotal } from './goods.service'
import { getQianfanOrderUrlTemplate, isQianfanOrderLinkEnabled } from './settings.service'
import { getSale } from './sale.service'
import { calculateExpenseImpact, syncExpenseLedger } from '../finance/core-ledger'

export interface ExpenseFilter {
  startDate?: string
  endDate?: string
  expenseType?: string
  businessType?: string
  paySource?: string
  braceletCode?: string
  externalOrderNo?: string
  customerPaymentStatus?: string
  pendingLinkStatus?: string
  onlyWithBracelet?: boolean
  isVoided?: boolean
  isTrialRun?: boolean
  excludeTrial?: boolean
  needsAttachment?: boolean
  createdBy?: number
  page?: number
  pageSize?: number
}

function maskPayeeAccount(account?: string): string | null {
  const a = account?.trim()
  if (!a) return null
  if (a.length <= 4) return '****'
  return `${a.slice(0, 2)}****${a.slice(-2)}`
}

function buildWhere(filter: ExpenseFilter) {
  const where: Record<string, unknown> = {}
  if (filter.isVoided !== undefined) where.isVoided = filter.isVoided
  else where.isVoided = false

  if (filter.startDate || filter.endDate) {
    where.occurredAt = {}
    if (filter.startDate) (where.occurredAt as Record<string, Date>).gte = startOfDay(parseDateInput(filter.startDate))
    if (filter.endDate) (where.occurredAt as Record<string, Date>).lte = endOfDay(parseDateInput(filter.endDate))
  }
  if (filter.expenseType) where.expenseType = filter.expenseType
  if (filter.businessType) where.businessType = filter.businessType
  if (filter.paySource) where.paySource = filter.paySource
  if (filter.braceletCode) where.braceletCode = { contains: filter.braceletCode }
  if (filter.externalOrderNo) where.externalOrderNo = { contains: filter.externalOrderNo }
  if (filter.customerPaymentStatus) where.customerPaymentStatus = filter.customerPaymentStatus
  if (filter.pendingLinkStatus) where.pendingLinkStatus = filter.pendingLinkStatus
  if (filter.onlyWithBracelet) where.braceletId = { not: null }
  if (filter.needsAttachment) where.needsAttachment = true
  if (filter.createdBy) where.createdBy = filter.createdBy
  where.isTrialRun = false
  return where
}

async function resolveSaleBinding(input: {
  saleId?: number
  externalOrderNo?: string
  logisticsNo?: string
}) {
  if (input.saleId) {
    const sale = await prisma.sale.findFirst({
      where: { id: input.saleId, isTrialRun: false },
    })
    if (!sale) return { saleId: null as number | null, braceletId: null as number | null, braceletCode: null as string | null, externalOrderNo: input.externalOrderNo?.trim() || null, logisticsNo: input.logisticsNo?.trim() || null }
    return {
      saleId: sale.id,
      braceletId: sale.braceletId,
      braceletCode: sale.braceletCode,
      externalOrderNo: sale.externalOrderNo || input.externalOrderNo?.trim() || null,
      logisticsNo: sale.logisticsNo || input.logisticsNo?.trim() || null,
    }
  }
  const orderNo = input.externalOrderNo?.trim()
  if (orderNo) {
    const sale = await prisma.sale.findFirst({
      where: { externalOrderNo: orderNo, isTrialRun: false },
      orderBy: { soldAt: 'desc' },
    })
    if (sale) {
      return {
        saleId: sale.id,
        braceletId: sale.braceletId,
        braceletCode: sale.braceletCode,
        externalOrderNo: sale.externalOrderNo,
        logisticsNo: sale.logisticsNo || input.logisticsNo?.trim() || null,
      }
    }
    return { saleId: null, braceletId: null, braceletCode: null, externalOrderNo: orderNo, logisticsNo: input.logisticsNo?.trim() || null }
  }
  const logisticsNo = input.logisticsNo?.trim()
  if (logisticsNo) {
    const sale = await prisma.sale.findFirst({
      where: { logisticsNo: { contains: logisticsNo }, isTrialRun: false },
      orderBy: { soldAt: 'desc' },
    })
    if (sale) {
      return {
        saleId: sale.id,
        braceletId: sale.braceletId,
        braceletCode: sale.braceletCode,
        externalOrderNo: sale.externalOrderNo,
        logisticsNo: sale.logisticsNo,
      }
    }
  }
  return { saleId: null, braceletId: null, braceletCode: null, externalOrderNo: orderNo || null, logisticsNo: logisticsNo || null }
}

function resolvePendingLinkStatus(input: {
  businessType?: string | null
  saleId?: number | null
  braceletId?: number | null
  externalOrderNo?: string | null
  braceletCode?: string | null
}): string {
  if (input.businessType === EXPENSE_BUSINESS_TYPES.manual_pending) {
    if (input.saleId || input.braceletId) return PENDING_LINK_STATUSES.linked
    if (input.externalOrderNo) return PENDING_LINK_STATUSES.pending_order
    if (input.braceletCode) return PENDING_LINK_STATUSES.pending_goods
    return PENDING_LINK_STATUSES.manual
  }
  if (input.saleId || input.braceletId) return PENDING_LINK_STATUSES.linked
  if (input.externalOrderNo) return PENDING_LINK_STATUSES.pending_order
  return PENDING_LINK_STATUSES.linked
}

function requiresBraceletBinding(businessType?: string | null): boolean {
  return businessType === EXPENSE_BUSINESS_TYPES.item_cost
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
  const userMap = await resolveUsersBrief(sanitized.map((e) => e.createdBy))
  const withCreator = sanitized.map((e) => ({
    ...e,
    createdByUser: userMap.get(e.createdBy) || null,
    submitterName: userMap.get(e.createdBy)?.displayName || null,
  }))
  return { items: withCreator, total, page, pageSize }
}

export async function getExpense(id: number) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
      bracelet: true,
      sale: true,
    },
  })
  if (!expense) return null
  const orderNo = expense.externalOrderNo || expense.sale?.externalOrderNo || ''
  const qianfanTemplate = await getQianfanOrderUrlTemplate()
  const qianfanOrderUrl = expense.qianfanOrderUrl
    || (orderNo ? buildQianfanOrderUrl(qianfanTemplate, orderNo) : null)

  const [createdByUser, updatedByUser, voidedByUser, operationLogs] = await Promise.all([
    resolveUserBrief(expense.createdBy),
    resolveUserBrief(expense.updatedBy),
    resolveUserBrief(expense.voidedBy),
    getEntityOperationLogs('expense', expense.id),
  ])

  return {
    ...expense,
    qianfanOrderUrl,
    qianfanOrderLinkEnabled: await isQianfanOrderLinkEnabled(),
    affectsProfit: calculateExpenseImpact(expense).affectsProfit,
    createdByUser: createdByUser || { displayName: '历史数据，未记录操作人' },
    updatedByUser,
    voidedByUser,
    operationLogs,
  }
}

export async function createExpense(
  input: {
    amount: number
    expenseType?: string
    businessType?: ExpenseBusinessType | string
    paySource: string
    occurredAt: string
    braceletCode?: string
    braceletId?: number
    saleId?: number
    externalOrderNo?: string
    logisticsNo?: string
    expenseSummary?: string
    remark?: string
    customerPaymentStatus?: string
    paidAt?: string
    payeeName?: string
    payeeAccount?: string
    linkNote?: string
    pendingLinkStatus?: string
    attachmentFileIds?: number[]
    attachments?: Array<{ fileId: number; fileType: string }>
    needsAttachment?: boolean
  },
  operator: AuthRequest['user'],
) {
  if (!input.amount || input.amount <= 0) throw new Error('金额必须大于 0')

  const businessType = (input.businessType || EXPENSE_BUSINESS_TYPES.normal) as ExpenseBusinessType
  const expenseType = input.expenseType || defaultExpenseTypeForBusiness(businessType)

  const saleBinding = await resolveSaleBinding({
    saleId: input.saleId,
    externalOrderNo: input.externalOrderNo,
    logisticsNo: input.logisticsNo,
  })

  let braceletId = saleBinding.braceletId
  let braceletCode = saleBinding.braceletCode

  if (input.braceletCode?.trim() || input.braceletId) {
    const binding = await resolveBraceletBinding(input.braceletCode, input.braceletId, operator)
    if (input.braceletCode?.trim() && !binding.braceletId && requiresBraceletBinding(businessType)) {
      throw new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
    }
    if (binding.braceletId) {
      braceletId = binding.braceletId
      braceletCode = binding.braceletCode
    } else if (input.braceletCode?.trim()) {
      braceletCode = input.braceletCode.trim().toUpperCase()
    }
  }

  if (requiresBraceletBinding(businessType) && !braceletId && !braceletCode) {
    throw new Error('货品成本支出需要填写货品编号')
  }

  const pendingLinkStatus = input.pendingLinkStatus
    || resolvePendingLinkStatus({
      businessType,
      saleId: saleBinding.saleId,
      braceletId,
      externalOrderNo: saleBinding.externalOrderNo,
      braceletCode,
    })

  const orderNo = saleBinding.externalOrderNo || input.externalOrderNo?.trim() || null
  const qianfanTemplate = await getQianfanOrderUrlTemplate()
  const qianfanOrderUrl = orderNo
    ? buildQianfanOrderUrl(qianfanTemplate, orderNo)
    : null

  let paidAt: Date | null = null
  if (input.paidAt) paidAt = new Date(input.paidAt)
  else if (input.customerPaymentStatus === 'paid') paidAt = new Date()

  const expense = await prisma.expense.create({
    data: {
      expenseNo: generateNo('EX'),
      braceletId,
      braceletCode,
      saleId: saleBinding.saleId,
      expenseType,
      businessType,
      paySource: input.paySource,
      amount: input.amount,
      occurredAt: parseDateInput(input.occurredAt),
      expenseSummary: input.expenseSummary,
      remark: input.remark,
      reimbursementStatus: 'not_required',
      needsAttachment: input.needsAttachment || false,
      isTrialRun: false,
      createdBy: operator!.userId,
      externalOrderNo: orderNo,
      logisticsNo: saleBinding.logisticsNo || input.logisticsNo?.trim() || null,
      qianfanOrderUrl,
      pendingLinkStatus,
      customerPaymentStatus: input.customerPaymentStatus || null,
      paidAt,
      payeeName: input.payeeName?.trim() || null,
      payeeAccountMasked: maskPayeeAccount(input.payeeAccount),
      linkNote: input.linkNote?.trim() || null,
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
  if (saleBinding.saleId) await getSale(saleBinding.saleId)

  await writeOperationLog({
    module: 'expense',
    action: 'create_expense',
    targetType: 'expense',
    targetId: expense.id,
    targetCode: expense.expenseNo,
    afterJson: expense,
    operator,
  })

  await syncExpenseLedger(expense.id)
  return getExpense(expense.id)
}

export async function linkExpense(
  id: number,
  input: {
    saleId?: number
    externalOrderNo?: string
    braceletCode?: string
    braceletId?: number
    linkNote?: string
  },
  operator: AuthRequest['user'],
) {
  const before = await prisma.expense.findUnique({ where: { id } })
  if (!before) throw new Error('支出不存在')
  if (before.isVoided) throw new Error('这条记录现在不能改')

  const saleBinding = await resolveSaleBinding({
    saleId: input.saleId ?? before.saleId ?? undefined,
    externalOrderNo: input.externalOrderNo ?? before.externalOrderNo ?? undefined,
  })

  let braceletId = saleBinding.braceletId ?? before.braceletId
  let braceletCode = saleBinding.braceletCode ?? before.braceletCode

  if (input.braceletCode?.trim() || input.braceletId) {
    const binding = await resolveBraceletBinding(input.braceletCode, input.braceletId, operator)
    if (binding.braceletId) {
      braceletId = binding.braceletId
      braceletCode = binding.braceletCode
    } else if (input.braceletCode?.trim()) {
      braceletCode = input.braceletCode.trim().toUpperCase()
    }
  }

  const orderNo = saleBinding.externalOrderNo || before.externalOrderNo
  const qianfanTemplate = await getQianfanOrderUrlTemplate()
  const qianfanOrderUrl = orderNo
    ? buildQianfanOrderUrl(qianfanTemplate, orderNo)
    : before.qianfanOrderUrl

  const pendingLinkStatus = resolvePendingLinkStatus({
    businessType: before.businessType,
    saleId: saleBinding.saleId,
    braceletId,
    externalOrderNo: orderNo,
    braceletCode,
  })

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      saleId: saleBinding.saleId,
      braceletId,
      braceletCode,
      externalOrderNo: orderNo,
      qianfanOrderUrl,
      pendingLinkStatus,
      linkNote: input.linkNote?.trim() || before.linkNote,
      updatedBy: operator!.userId,
    },
  })

  const oldBraceletId = before.braceletId
  if (braceletId) await refreshBraceletCostTotal(braceletId)
  if (oldBraceletId && oldBraceletId !== braceletId) await refreshBraceletCostTotal(oldBraceletId)
  if (saleBinding.saleId) await getSale(saleBinding.saleId)
  if (before.saleId && before.saleId !== saleBinding.saleId) await getSale(before.saleId)

  await writeOperationLog({
    module: 'expense',
    action: 'link_expense',
    targetType: 'expense',
    targetId: id,
    targetCode: before.expenseNo,
    beforeJson: before,
    afterJson: expense,
    operator,
  })

  await syncExpenseLedger(id)
  return getExpense(id)
}

export async function updateExpense(
  id: number,
  input: Partial<{
    amount: number
    expenseType: string
    businessType: string
    paySource: string
    occurredAt: string
    braceletCode: string
    braceletId: number
    saleId: number
    externalOrderNo: string
    logisticsNo: string
    expenseSummary: string
    remark: string
    customerPaymentStatus: string
    paidAt: string
    payeeName: string
    payeeAccount: string
    linkNote: string
    needsAttachment: boolean
  }>,
  operator: AuthRequest['user'],
) {
  const before = await prisma.expense.findUnique({ where: { id } })
  if (!before) throw new Error('支出不存在')
  if (before.isVoided) throw new Error('这条记录现在不能改')

  const oldBraceletId = before.braceletId
  const data: Record<string, unknown> = { ...input }
  delete data.payeeAccount
  if (input.occurredAt) data.occurredAt = parseDateInput(input.occurredAt)
  if (input.amount !== undefined && input.amount <= 0) throw new Error('金额得填一下')
  if (input.payeeAccount !== undefined) {
    data.payeeAccountMasked = maskPayeeAccount(input.payeeAccount)
  }
  if (input.customerPaymentStatus === 'paid' && !input.paidAt && !before.paidAt) {
    data.paidAt = new Date()
  }
  if (input.paidAt) data.paidAt = new Date(input.paidAt)

  if (input.externalOrderNo !== undefined || input.saleId !== undefined || input.logisticsNo !== undefined) {
    const saleBinding = await resolveSaleBinding({
      saleId: input.saleId ?? before.saleId ?? undefined,
      externalOrderNo: input.externalOrderNo ?? before.externalOrderNo ?? undefined,
      logisticsNo: input.logisticsNo ?? before.logisticsNo ?? undefined,
    })
    data.saleId = saleBinding.saleId
    if (!input.braceletCode && !input.braceletId) {
      if (saleBinding.braceletId) {
        data.braceletId = saleBinding.braceletId
        data.braceletCode = saleBinding.braceletCode
      }
    }
    data.externalOrderNo = saleBinding.externalOrderNo
    data.logisticsNo = saleBinding.logisticsNo
    const orderNo = saleBinding.externalOrderNo
    if (orderNo) {
      const qianfanTemplate = await getQianfanOrderUrlTemplate()
      data.qianfanOrderUrl = buildQianfanOrderUrl(qianfanTemplate, orderNo)
    }
    data.pendingLinkStatus = resolvePendingLinkStatus({
      businessType: (input.businessType || before.businessType) as string,
      saleId: saleBinding.saleId,
      braceletId: (data.braceletId as number) ?? before.braceletId,
      externalOrderNo: saleBinding.externalOrderNo,
      braceletCode: (data.braceletCode as string) ?? before.braceletCode,
    })
  }

  if (input.braceletCode !== undefined || input.braceletId !== undefined) {
    const binding = await resolveBraceletBinding(input.braceletCode, input.braceletId, operator)
    if (input.braceletCode?.trim() && !binding.braceletId) {
      throw new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
    }
    data.braceletId = binding.braceletId
    data.braceletCode = binding.braceletCode || input.braceletCode?.trim().toUpperCase()
  }

  const expense = await prisma.expense.update({ where: { id }, data: { ...data, updatedBy: operator!.userId } })

  const newBraceletId = expense.braceletId
  if (newBraceletId) await refreshBraceletCostTotal(newBraceletId)
  if (oldBraceletId && oldBraceletId !== newBraceletId) {
    await refreshBraceletCostTotal(oldBraceletId)
  }
  if (expense.saleId) await getSale(expense.saleId)
  if (before.saleId && before.saleId !== expense.saleId) await getSale(before.saleId)

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

  await syncExpenseLedger(id)
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

  await syncExpenseLedger(id)

  if (before.saleId) {
    await getSale(before.saleId)
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
    data: { needsAttachment: false, updatedBy: operator?.userId },
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

export async function getExpenseSummary(
  period?: string,
  startDate?: string,
  endDate?: string,
  userId?: number,
) {
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

  for (const e of expenses) {
    byType[e.expenseType] = (byType[e.expenseType] || 0) + toNumber(e.amount)
    byPaySource[e.paySource] = (byPaySource[e.paySource] || 0) + toNumber(e.amount)
  }

  const compensationAmount = expenses
    .filter((e) => isProfitDeductingExpense(e))
    .reduce((s, e) => s + toNumber(e.amount), 0)

  const needsAttachment = await prisma.expense.count({
    where: { isVoided: false, isTrialRun: false, needsAttachment: true },
  })

  const totalCount = expenses.length
  const myCount = userId ? expenses.filter((e) => e.createdBy === userId).length : undefined

  return {
    period: { start, end },
    totalAmount,
    totalCount,
    myCount,
    byType,
    byPaySource,
    compensationAmount,
    needsAttachmentCount: needsAttachment,
  }
}

export { buildWhere }
