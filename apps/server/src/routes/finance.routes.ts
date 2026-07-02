import { Router, Response, NextFunction } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  createFinanceShareLink,
  exportFinanceExcel,
  getFinanceShareByToken,
} from '../services/finance.service'

export const financeRouter = Router()

/** 带 share token 可匿名导出；否则需登录且有 expense:view */
function financeExportAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.query.token) {
    next()
    return
  }
  authMiddleware(req, res, () => {
    requirePermission('expense:view')(req, res, next)
  })
}

financeRouter.get('/share-links/:token', async (req, res) => {
  try {
    const data = await getFinanceShareByToken(req.params.token, req)
    res.json({ success: true, data })
  } catch (err) {
    res.status(404).json({ success: false, message: (err as Error).message })
  }
})

financeRouter.get('/export', financeExportAuth, async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx')
    if (format !== 'xlsx') {
      res.status(400).json({ success: false, message: '仅支持 format=xlsx' })
      return
    }
    const { buffer, fileName } = await exportFinanceExcel({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      title: req.query.title as string,
      token: req.query.token as string,
    }, req)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.status(200).send(buffer)
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})

financeRouter.use(authMiddleware)

financeRouter.post('/share-links', requirePermission('expense:view'), async (req: AuthRequest, res) => {
  try {
    const data = await createFinanceShareLink(req.body, req.user!, req)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message })
  }
})
