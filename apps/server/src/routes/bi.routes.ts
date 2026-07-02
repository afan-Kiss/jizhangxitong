import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { getBiSummary, getBiDrilldown } from '../services/bi.service'
import { createBiDrilldownExport, downloadBiDrilldownExport } from '../services/export.service'

export const biRouter = Router()

biRouter.get('/drilldown/export/:id/download', async (req, res) => {
  try {
    const token = String(req.query.token || '')
    const file = await downloadBiDrilldownExport(Number(req.params.id), token)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`)
    res.status(200).send(file.buffer)
  } catch (err) {
    const message = (err as Error).message
    const status = /不存在|无效|过期/.test(message) ? 404 : 400
    res.status(status).json({ success: false, message })
  }
})

biRouter.use(authMiddleware)

biRouter.get('/summary', requirePermission('expense:view'), async (req, res) => {
  const data = await getBiSummary(
    req.query.range as string | undefined,
    req.query.startDate as string | undefined,
    req.query.endDate as string | undefined,
  )
  res.json({ success: true, data })
})

biRouter.post('/drilldown/export/excel', requirePermission('expense:view'), async (req: AuthRequest, res) => {
  try {
    const data = await createBiDrilldownExport(req.body, req.user!)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
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
