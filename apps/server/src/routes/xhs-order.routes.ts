import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { getXhsShopStatuses, searchXhsOrders } from '../services/xhs-order.service'

export const xhsOrderRouter = Router()
xhsOrderRouter.use(authMiddleware)

xhsOrderRouter.get('/orders/shops', requirePermission('expense:view'), async (_req, res) => {
  const data = await getXhsShopStatuses()
  res.json({ success: true, data })
})

xhsOrderRouter.get('/orders/search', requirePermission('expense:view'), async (req, res) => {
  try {
    const data = await searchXhsOrders({
      shopKey: String(req.query.shopKey || 'all'),
      keyword: req.query.keyword as string | undefined,
      cursor: req.query.cursor as string | undefined,
      pageSize: Number(req.query.pageSize) || 10,
    })
    res.json({ success: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '订单查询失败'
    res.status(400).json({ success: false, message: msg })
  }
})
