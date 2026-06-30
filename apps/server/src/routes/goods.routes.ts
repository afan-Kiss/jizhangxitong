import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  createGoodsFromScan,
  getGoodsById,
  getGoodsByCode,
  getGoodsCostDetail,
  getGoodsProfit,
} from '../services/goods.service'

export const goodsRouter = Router()
goodsRouter.use(authMiddleware)

goodsRouter.post('/', requirePermission('bracelet:sync'), async (req: AuthRequest, res) => {
  try {
    const data = await createGoodsFromScan(req.body, req.user)
    res.json({ success: true, data, message: '货品已创建' })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '创建货品失败',
    })
  }
})

goodsRouter.get('/by-code/:code', requirePermission('bracelet:view'), async (req, res) => {
  const code = decodeURIComponent(String(req.params.code))
  const data = await getGoodsByCode(code)
  if (!data) {
    res.status(404).json({ success: false, message: '没找到这个货品' })
    return
  }
  res.json({ success: true, data })
})

goodsRouter.get('/:id/profit', requirePermission('bracelet:cost:view'), async (req, res) => {
  try {
    const data = await getGoodsProfit(Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) {
    res.status(404).json({
      success: false,
      message: (err as Error).message || '没找到这个货品',
    })
  }
})

goodsRouter.get('/:id/cost', requirePermission('bracelet:cost:view'), async (req, res) => {
  try {
    const data = await getGoodsCostDetail(Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) {
    res.status(404).json({
      success: false,
      message: (err as Error).message || '没找到这个货品',
    })
  }
})

goodsRouter.get('/:id', requirePermission('bracelet:view'), async (req, res) => {
  const data = await getGoodsById(Number(req.params.id))
  if (!data) {
    res.status(404).json({ success: false, message: '没找到这个货品' })
    return
  }
  res.json({ success: true, data })
})
