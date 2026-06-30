import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { getHomeDashboard, getSalesSummary, getMonthlyReport } from '../services/stats.service'

export const statsRouter = Router()
statsRouter.use(authMiddleware)

statsRouter.get('/home', requirePermission('expense:view'), async (_req, res) => {
  const data = await getHomeDashboard()
  res.json({ success: true, data })
})

statsRouter.get('/sales', requirePermission('sale:view'), async (req, res) => {
  const data = await getSalesSummary(
    String(req.query.period || 'month'),
    req.query.startDate as string | undefined,
    req.query.endDate as string | undefined,
  )
  res.json({ success: true, data })
})

statsRouter.get('/monthly', requirePermission('sale:view'), async (req, res) => {
  const now = new Date()
  const year = Number(req.query.year || now.getFullYear())
  const month = Number(req.query.month || now.getMonth() + 1)
  const data = await getMonthlyReport(year, month)
  res.json({ success: true, data })
})
