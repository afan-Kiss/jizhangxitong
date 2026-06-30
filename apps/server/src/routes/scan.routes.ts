import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  recognizeScanCode,
  bindScan,
  listRecentScans,
  createSimpleOrderFromScan,
  bindExpenseToGoods,
} from '../services/scan-binding.service'

export const scanRouter = Router()
scanRouter.use(authMiddleware)

scanRouter.post('/recognize', requirePermission('bracelet:view'), async (req: AuthRequest, res) => {
  try {
    const code = String(req.body.code || '')
    const source = (req.body.source || 'manual') as 'scanner' | 'manual' | 'paste'
    const data = await recognizeScanCode(code, source)
    res.json({ success: true, data })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '识别失败，请重新扫码试试',
    })
  }
})

scanRouter.post('/bind', requirePermission('bracelet:sync'), async (req: AuthRequest, res) => {
  try {
    const data = await bindScan(req.body, req.user)
    res.json({ success: true, data, message: '绑定成功' })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '绑定失败，请重新扫码试试',
    })
  }
})

scanRouter.get('/recent', requirePermission('bracelet:view'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50)
  const data = await listRecentScans(limit)
  res.json({ success: true, data })
})

scanRouter.post('/orders/simple', requirePermission('sale:create'), async (req: AuthRequest, res) => {
  try {
    const data = await createSimpleOrderFromScan(req.body, req.user)
    res.json({ success: true, data, message: '订单已创建' })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '创建订单失败',
    })
  }
})

scanRouter.post('/expenses/:id/bind-goods', requirePermission('expense:update'), async (req: AuthRequest, res) => {
  try {
    const expenseId = Number(req.params.id)
    const goodsId = Number(req.body.goodsId)
    if (!goodsId) {
      res.status(400).json({ success: false, message: '请选择要绑定的货品' })
      return
    }
    const data = await bindExpenseToGoods(expenseId, goodsId, req.user)
    res.json({ success: true, data, message: '支出已绑定到货品' })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '绑定失败，请重新扫码试试',
    })
  }
})
