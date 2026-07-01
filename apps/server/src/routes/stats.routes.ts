import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { getHomeDashboard, getMonthlyReport } from '../services/stats.service'

export const statsRouter = Router()
statsRouter.use(authMiddleware)

statsRouter.get('/home', requirePermission('expense:view'), async (_req, res) => {
  const data = await getHomeDashboard()
  res.json({ success: true, data })
})

statsRouter.get('/sales', requirePermission('expense:view'), async (_req, res) => {
  res.status(410).json({
    success: false,
    message: '该模块已下线，现在系统只记录项目资金支出。',
  })
})

statsRouter.get('/monthly', requirePermission('expense:view'), async (req, res) => {
  const now = new Date()
  const year = Number(req.query.year || now.getFullYear())
  const month = Number(req.query.month || now.getMonth() + 1)
  const data = await getMonthlyReport(year, month)
  res.json({ success: true, data })
})
