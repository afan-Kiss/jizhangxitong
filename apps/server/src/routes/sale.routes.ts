import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { getSale, listSales, lookupSales, calculateSaleCost } from '../services/sale.service'

export const saleRouter = Router()
saleRouter.use(authMiddleware)

const MODULE_GONE = {
  success: false,
  message: '该模块已下线，现在系统只记录项目资金支出。',
}

saleRouter.get('/', requirePermission('expense:view'), async (req, res) => {
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

saleRouter.get('/lookup', requirePermission('expense:view'), async (req, res) => {
  const data = await lookupSales({
    externalOrderNo: req.query.externalOrderNo as string,
    logisticsNo: req.query.logisticsNo as string,
    braceletCode: req.query.braceletCode as string,
    keyword: req.query.keyword as string,
  })
  res.json({ success: true, data })
})

saleRouter.get('/cost-preview/:braceletId', requirePermission('expense:view'), async (_req, res) => {
  res.status(410).json(MODULE_GONE)
})

saleRouter.get('/:id', requirePermission('expense:view'), async (req, res) => {
  const sale = await getSale(Number(req.params.id))
  if (!sale) {
    res.status(404).json({ success: false, message: '销售记录不存在' })
    return
  }
  res.json({ success: true, data: sale })
})

saleRouter.post('/', requirePermission('expense:create'), async (_req: AuthRequest, res) => {
  res.status(410).json(MODULE_GONE)
})

saleRouter.post('/:id/refund', requirePermission('expense:void'), async (_req: AuthRequest, res) => {
  res.status(410).json(MODULE_GONE)
})
