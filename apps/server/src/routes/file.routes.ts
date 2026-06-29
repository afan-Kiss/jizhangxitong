import { Router } from 'express'
import multer from 'multer'
import { config } from '../lib/config'
import { authMiddleware, requirePermission, AuthRequest, getUserPermissions } from '../middleware/auth'
import { uploadAndRelay, getFileView, assertFileAccess } from '../services/file.service'
import { createFileAccessToken, verifyFileAccessToken } from '../lib/file-access-token'
import { sanitizeFile } from '../lib/serialize'
import { verifyToken } from '../lib/jwt'
import { ERROR_CODES } from '@jade-account/shared'

const upload = multer({ dest: config.tempUploadDir })

export const fileRouter = Router()

fileRouter.post('/upload', authMiddleware, requirePermission('expense:attachment:upload'), upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '未上传文件' })
    return
  }
  try {
    const record = await uploadAndRelay(req.file, {
      fileType: req.body.fileType || 'other',
      relatedType: req.body.relatedType,
      relatedId: req.body.relatedId ? Number(req.body.relatedId) : undefined,
      uploadedBy: req.user!.userId,
    }, req.user)
    res.json({ success: true, data: sanitizeFile(record) })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE, message: e.message })
  }
})

fileRouter.post('/:id/access-token', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const fileId = Number(req.params.id)
    await assertFileAccess(req.user!, fileId)
    const token = createFileAccessToken(req.user!.userId, fileId)
    res.json({ success: true, data: token })
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number }
    res.status(e.statusCode || 403).json({ success: false, code: e.code, message: e.message })
  }
})

async function resolveFileAuth(req: AuthRequest, fileId: number) {
  const accessToken = String(req.query.accessToken || '')
  if (accessToken) {
    const payload = verifyFileAccessToken(accessToken)
    if (payload.fileId !== fileId) throw Object.assign(new Error('无效的文件访问令牌'), { statusCode: 403 })
    const permissions = await getUserPermissions(payload.userId)
    req.user = { userId: payload.userId, username: '', name: '', permissions }
    await assertFileAccess(req.user, fileId)
    return
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw Object.assign(new Error('未登录'), { statusCode: 401 })
  }
  const payload = verifyToken(header.slice(7))
  const permissions = await getUserPermissions(payload.userId)
  req.user = { ...payload, permissions }
  await assertFileAccess(req.user, fileId)
}

fileRouter.get('/:id/view', async (req: AuthRequest, res) => {
  try {
    const fileId = Number(req.params.id)
    await resolveFileAuth(req, fileId)
    const file = await getFileView(fileId, false)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`)
    res.send(file.buffer)
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number }
    res.status(e.statusCode || 400).json({
      success: false,
      code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE,
      message: e.message,
    })
  }
})

fileRouter.get('/:id/thumb', async (req: AuthRequest, res) => {
  try {
    const fileId = Number(req.params.id)
    await resolveFileAuth(req, fileId)
    const file = await getFileView(fileId, true)
    res.setHeader('Content-Type', file.mimeType)
    res.send(file.buffer)
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number }
    res.status(e.statusCode || 400).json({
      success: false,
      code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE,
      message: e.message,
    })
  }
})
