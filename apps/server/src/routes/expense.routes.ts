import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  addAttachments,
  createExpense,
  getExpense,
  getExpenseSummary,
  linkExpense,
  listExpenses,
  updateExpense,
  voidExpense,
} from '../services/expense.service'

const REIMBURSEMENT_GONE = {
  success: false,
  message: '报销功能已下线，现在统一使用专属经费记支出。',
}

function reimbursementGone(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(410).json(REIMBURSEMENT_GONE)
}

export const expenseRouter = Router()
expenseRouter.use(authMiddleware)

expenseRouter.get('/', requirePermission('expense:view'), async (req: AuthRequest, res) => {
  const mine = req.query.mine === '1' || req.query.createdByMe === '1'
  const data = await listExpenses({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    expenseType: req.query.expenseType as string,
    paySource: req.query.paySource as string,
    braceletCode: req.query.braceletCode as string,
    businessType: req.query.businessType as string,
    externalOrderNo: req.query.externalOrderNo as string,
    customerPaymentStatus: req.query.customerPaymentStatus as string,
    pendingLinkStatus: req.query.pendingLinkStatus as string,
    onlyWithBracelet: req.query.onlyWithBracelet === 'true',
    needsAttachment: req.query.needsAttachment === 'true',
    createdBy: mine ? req.user!.userId : undefined,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
  })
  res.json({ success: true, data })
})

expenseRouter.get('/summary', requirePermission('expense:view'), async (req: AuthRequest, res) => {
  const data = await getExpenseSummary(
    req.query.period as string,
    req.query.startDate as string,
    req.query.endDate as string,
    req.user!.userId,
  )
  res.json({ success: true, data })
})

expenseRouter.get('/reimbursements/summary', reimbursementGone)
expenseRouter.get('/pending-reimbursements', reimbursementGone)
expenseRouter.post('/export/reimbursement-excel/preview', reimbursementGone)
expenseRouter.post('/export/reimbursement-excel', reimbursementGone)

expenseRouter.get('/:id', requirePermission('expense:view'), async (req, res) => {
  const expense = await getExpense(Number(req.params.id))
  if (!expense) {
    res.status(404).json({ success: false, message: '支出不存在' })
    return
  }
  res.json({ success: true, data: expense })
})

expenseRouter.post('/', requirePermission('expense:create'), async (req: AuthRequest, res) => {
  try {
    const expense = await createExpense(req.body, req.user!)
    res.json({ success: true, data: expense })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code, message: e.message })
  }
})

expenseRouter.patch('/:id', requirePermission('expense:update'), async (req: AuthRequest, res) => {
  try {
    const expense = await updateExpense(Number(req.params.id), req.body, req.user!)
    res.json({ success: true, data: expense })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code, message: e.message })
  }
})

expenseRouter.post('/:id/link', requirePermission('expense:update'), async (req: AuthRequest, res) => {
  try {
    const expense = await linkExpense(Number(req.params.id), req.body, req.user!)
    res.json({ success: true, data: expense })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code, message: e.message })
  }
})

expenseRouter.post('/:id/void', requirePermission('expense:void'), async (req: AuthRequest, res) => {
  try {
    const expense = await voidExpense(Number(req.params.id), req.body.voidReason || '', req.user!)
    res.json({ success: true, data: expense })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

expenseRouter.patch('/:id/reimbursement-status', reimbursementGone)

expenseRouter.post('/:id/attachments', requirePermission('expense:attachment:upload'), async (req: AuthRequest, res) => {
  const expense = await addAttachments(Number(req.params.id), req.body.items || [], req.user)
  res.json({ success: true, data: expense })
})
