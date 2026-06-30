import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { createSale, getSale, listSales, refundSale, calculateSaleCost } from '../services/sale.service'

export const saleRouter = Router()
saleRouter.use(authMiddleware)

saleRouter.get('/', requirePermission('sale:view'), async (req, res) => {
  const data = await listSales({
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 20),
    platform: req.query.platform as string,
    braceletCode: req.query.braceletCode as string,
    status: req.query.status as string,
    afterSaleStatus: req.query.afterSaleStatus as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    logisticsNo: req.query.logisticsNo as string,
    externalOrderNo: req.query.externalOrderNo as string,
  })
  res.json({ success: true, data })
})

saleRouter.get('/cost-preview/:braceletId', requirePermission('sale:create'), async (req, res) => {
  const cost = await calculateSaleCost(Number(req.params.braceletId))
  res.json({ success: true, data: cost })
})

saleRouter.get('/:id', requirePermission('sale:view'), async (req, res) => {
  const sale = await getSale(Number(req.params.id))
  if (!sale) {
    res.status(404).json({ success: false, message: '销售记录不存在' })
    return
  }
  res.json({ success: true, data: sale })
})

saleRouter.post('/', requirePermission('sale:create'), async (req: AuthRequest, res) => {
  try {
    const sale = await createSale(req.body, req.user!)
    res.json({ success: true, data: sale })
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number }
    res.status(e.statusCode || 400).json({
      success: false,
      code: e.code,
      message: e.message,
    })
  }
})

saleRouter.post('/:id/refund', requirePermission('sale:refund'), async (req: AuthRequest, res) => {
  const result = await refundSale(Number(req.params.id), req.body, req.user!)
  res.json({ success: true, data: result })
})
