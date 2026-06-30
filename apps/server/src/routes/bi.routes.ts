import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { getBiSummary, getBiDrilldown } from '../services/bi.service'

export const biRouter = Router()
biRouter.use(authMiddleware)

biRouter.get('/summary', requirePermission('expense:view'), async (req, res) => {
  const data = await getBiSummary(
    req.query.range as string | undefined,
    req.query.startDate as string | undefined,
    req.query.endDate as string | undefined,
  )
  res.json({ success: true, data })
})

biRouter.get('/drilldown', requirePermission('expense:view'), async (req, res) => {
  try {
    const data = await getBiDrilldown({
      type: String(req.query.type || 'sales'),
      range: req.query.range as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      q: req.query.q as string | undefined,
    })
    res.json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '查询失败'
    res.status(400).json({ success: false, message: msg })
  }
})
