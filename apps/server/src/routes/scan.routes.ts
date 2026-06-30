import { Router, Request, Response, NextFunction } from 'express'
import { config } from '../lib/config'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import {
  recognizeScanCode,
  bindScan,
  listRecentScans,
  createSimpleOrderFromScan,
  bindExpenseToGoods,
  bindOrderToGoods,
} from '../services/scan-binding.service'

export const SCAN_WORKBENCH_DISABLED_MSG = '扫码工作台未启用'

export const scanRouter = Router()
scanRouter.use(authMiddleware)

function requireScanWorkbenchEnabled(req: Request, res: Response, next: NextFunction) {
  if (config.scanWorkbenchEnabled) {
    next()
    return
  }
  res.status(503).json({
    success: false,
    message: SCAN_WORKBENCH_DISABLED_MSG,
    paused: true,
    enabled: false,
  })
}

scanRouter.get('/status', requirePermission('bracelet:view'), async (_req, res) => {
  let scannerOnline = false
  try {
    const scannerUrl = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
    const h = await fetch(`${scannerUrl}/api/health`, { signal: AbortSignal.timeout(3000) })
    scannerOnline = h.ok
  } catch { /* offline */ }
  res.json({
    success: true,
    data: {
      enabled: config.scanWorkbenchEnabled,
      scannerOnline,
    },
  })
})

scanRouter.post('/recognize', requirePermission('bracelet:view'), requireScanWorkbenchEnabled, async (req: AuthRequest, res) => {
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

scanRouter.post('/bind', requirePermission('bracelet:sync'), requireScanWorkbenchEnabled, async (req: AuthRequest, res) => {
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

scanRouter.post('/orders/bind-goods', requirePermission('sale:create'), requireScanWorkbenchEnabled, async (req: AuthRequest, res) => {
  try {
    const data = await bindOrderToGoods(req.body, req.user)
    res.json({ success: true, data, message: '已绑定货品' })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '绑定失败，请重新扫码试试',
    })
  }
})

scanRouter.get('/recent', requirePermission('bracelet:view'), async (req, res) => {
  if (!config.scanWorkbenchEnabled) {
    res.json({ success: true, data: [], message: SCAN_WORKBENCH_DISABLED_MSG, paused: true, enabled: false })
    return
  }
  const limit = Math.min(Number(req.query.limit || 20), 50)
  const data = await listRecentScans(limit)
  res.json({ success: true, data })
})

scanRouter.post('/orders/simple', requirePermission('sale:create'), requireScanWorkbenchEnabled, async (req: AuthRequest, res) => {
  try {
    const data = await createSimpleOrderFromScan(req.body, req.user)
    const isDraft = data.isDraft
    res.json({
      success: true,
      data,
      message: isDraft ? '待绑定订单已保存，请绑定货品' : '订单已创建',
    })
  } catch (err) {
    res.status(400).json({
      success: false,
      message: (err as Error).message || '创建订单失败',
    })
  }
})

scanRouter.post('/expenses/:id/bind-goods', requirePermission('expense:update'), requireScanWorkbenchEnabled, async (req: AuthRequest, res) => {
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
