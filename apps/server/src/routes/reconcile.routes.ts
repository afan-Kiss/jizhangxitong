import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { localDateString } from '../lib/utils'
import { runDailyReconcile } from '../reconcile/reconcile.service'

export const reconcileRouter = Router()
reconcileRouter.use(authMiddleware)

reconcileRouter.get('/daily', requirePermission('expense:view'), async (req, res) => {
  try {
    const date = (req.query.date as string | undefined)?.trim() || localDateString()
    const data = await runDailyReconcile(date)
    res.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : '对账失败'
    res.status(400).json({ success: false, message })
  }
})
