import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { config } from '../lib/config'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  addAttachments,
  createExpense,
  getExpense,
  getExpenseSummary,
  listExpenses,
  listPendingReimbursements,
  updateExpense,
  updateReimbursementStatus,
  voidExpense,
} from '../services/expense.service'
import { createReimbursementExport, previewReimbursementExport } from '../services/export.service'
import { ERROR_CODES } from '@jade-account/shared'

const upload = multer({ dest: config.tempUploadDir })

export const expenseRouter = Router()
expenseRouter.use(authMiddleware)

expenseRouter.get('/', requirePermission('expense:view'), async (req, res) => {
  const data = await listExpenses({
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    expenseType: req.query.expenseType as string,
    paySource: req.query.paySource as string,
    reimbursementStatus: req.query.reimbursementStatus as string,
    reimbursementPerson: req.query.reimbursementPerson as string,
    braceletCode: req.query.braceletCode as string,
    onlyWithBracelet: req.query.onlyWithBracelet === 'true',
    needsAttachment: req.query.needsAttachment === 'true',
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
  })
  res.json({ success: true, data })
})

expenseRouter.get('/summary', requirePermission('expense:view'), async (req, res) => {
  const data = await getExpenseSummary(
    req.query.period as string,
    req.query.startDate as string,
    req.query.endDate as string,
  )
  res.json({ success: true, data })
})

expenseRouter.get('/pending-reimbursements', requirePermission('reimbursement:view'), async (_req, res) => {
  const data = await listPendingReimbursements()
  res.json({ success: true, data })
})

expenseRouter.post('/export/reimbursement-excel/preview', requirePermission('expense:export'), async (req, res) => {
  const data = await previewReimbursementExport(req.body)
  res.json({ success: true, data })
})

expenseRouter.post('/export/reimbursement-excel', requirePermission('expense:export'), async (req: AuthRequest, res) => {
  try {
    const data = await createReimbursementExport(req.body, req.user!)
    res.json({ success: true, data })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({
      success: false,
      code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE,
      message: e.message,
    })
  }
})

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

expenseRouter.post('/:id/void', requirePermission('expense:void'), async (req: AuthRequest, res) => {
  const expense = await voidExpense(Number(req.params.id), req.body.voidReason || '', req.user!)
  res.json({ success: true, data: expense })
})

expenseRouter.post('/:id/attachments', requirePermission('expense:attachment:upload'), async (req: AuthRequest, res) => {
  const expense = await addAttachments(Number(req.params.id), req.body.items || [], req.user)
  res.json({ success: true, data: expense })
})

expenseRouter.patch('/:id/reimbursement-status', requirePermission('reimbursement:update'), async (req: AuthRequest, res) => {
  const expense = await updateReimbursementStatus(
    Number(req.params.id),
    req.body.status,
    req.body.remark,
    req.user,
  )
  res.json({ success: true, data: expense })
})
