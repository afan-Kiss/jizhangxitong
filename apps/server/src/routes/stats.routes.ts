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
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    res.status(400).json({ success: false, message: '年份无效' })
    return
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    res.status(400).json({ success: false, message: '月份无效，应为 1–12' })
    return
  }
  const data = await getMonthlyReport(year, month)
  res.json({ success: true, data })
})
