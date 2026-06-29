import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest, getUserPermissions } from '../middleware/auth'
import { verifyToken } from '../lib/jwt'
import { workerHub } from '../websocket/worker-hub'
import {
  findBraceletByExactCode,
  getBraceletDetail,
  getBraceletImage,
  getOrSyncBracelet,
  presentBracelet,
  searchBracelets,
} from '../services/bracelet.service'
import { createCostAdjustment } from '../services/sale.service'
import { ERROR_CODES } from '@jade-account/shared'
import { createBraceletImageAccessToken, verifyBraceletImageAccessToken } from '../lib/file-access-token'

export const braceletRouter = Router()
braceletRouter.use(authMiddleware)

braceletRouter.get('/search', requirePermission('bracelet:view'), async (req, res) => {
  const items = await searchBracelets(String(req.query.q || ''))
  res.json({ success: true, data: items })
})

braceletRouter.post('/detail/:id/image-access-token', requirePermission('bracelet:view'), async (req: AuthRequest, res) => {
  const braceletId = Number(req.params.id)
  const token = createBraceletImageAccessToken(req.user!.userId, braceletId)
  res.json({ success: true, data: token })
})

braceletRouter.get('/detail/:id/image', async (req, res) => {
  try {
    const braceletId = Number(req.params.id)
    const accessToken = String(req.query.accessToken || '')
    if (accessToken) {
      const payload = verifyBraceletImageAccessToken(accessToken)
      if (payload.braceletId !== braceletId) {
        res.status(403).json({ success: false, message: '无效的文件访问令牌' })
        return
      }
      const perms = await getUserPermissions(payload.userId)
      if (!perms.includes('bracelet:view')) {
        res.status(403).json({ success: false, message: '无权限查看此图片' })
        return
      }
    } else {
      const header = req.headers.authorization
      if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: '未登录' })
        return
      }
      const payload = verifyToken(header.slice(7))
      const perms = await getUserPermissions(payload.userId)
      if (!perms.includes('bracelet:view')) {
        res.status(403).json({ success: false, message: '无权限查看此图片' })
        return
      }
    }
    const file = await getBraceletImage(braceletId)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`)
    res.send(file.buffer)
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({
      success: false,
      code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE,
      message: e.message || '本地电脑未连接，暂时无法查看镯子图片。',
    })
  }
})

braceletRouter.get('/detail/:id', requirePermission('bracelet:view'), async (req, res) => {
  const detail = await getBraceletDetail(Number(req.params.id))
  if (!detail) {
    res.status(404).json({ success: false, message: '镯子不存在' })
    return
  }
  res.json({ success: true, data: detail })
})

braceletRouter.get('/:code', requirePermission('bracelet:view'), async (req: AuthRequest, res) => {
  const code = String(req.params.code)
  try {
    const existing = await findBraceletByExactCode(code)
    const bracelet = existing ? presentBracelet(existing) : await getOrSyncBracelet(code, req.user)
    res.json({ success: true, data: bracelet })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({
      success: false,
      code: e.code || ERROR_CODES.SCANNER_NOT_FOUND,
      message: e.message,
    })
  }
})

braceletRouter.post('/:code/sync', requirePermission('bracelet:sync'), async (req: AuthRequest, res) => {
  try {
    const bracelet = await getOrSyncBracelet(String(req.params.code), req.user, true)
    res.json({ success: true, data: bracelet })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code, message: e.message })
  }
})

braceletRouter.post('/:id/cost-adjustment', requirePermission('cost:adjust'), async (req: AuthRequest, res) => {
  const record = await createCostAdjustment({
    braceletId: Number(req.params.id),
    braceletCode: req.body.braceletCode,
    amount: Number(req.body.amount),
    reason: req.body.reason,
  }, req.user!)
  res.json({ success: true, data: record })
})

export const workerRouter = Router()
workerRouter.use(authMiddleware)
workerRouter.get('/status', async (_req, res) => {
  const status = await workerHub.getStatus()
  res.json({ success: true, data: status })
})
