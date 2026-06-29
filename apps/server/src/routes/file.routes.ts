import { Router } from 'express'
import multer from 'multer'
import { config } from '../lib/config'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { uploadAndRelay, getFileView } from '../services/file.service'
import { verifyToken } from '../lib/jwt'
import { ERROR_CODES } from '@jade-account/shared'

const upload = multer({ dest: config.tempUploadDir })

export const fileRouter = Router()
fileRouter.use(authMiddleware)

fileRouter.post('/upload', requirePermission('expense:attachment:upload'), upload.single('file'), async (req: AuthRequest, res) => {
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
    res.json({ success: true, data: record })
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE, message: e.message })
  }
})

fileRouter.get('/:id/view', async (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7) || String(req.query.token || '')
    if (!token) {
      res.status(401).json({ success: false, message: '未登录' })
      return
    }
    verifyToken(token)
    const file = await getFileView(Number(req.params.id), false)
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`)
    res.send(file.buffer)
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE, message: e.message })
  }
})

fileRouter.get('/:id/thumb', async (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7) || String(req.query.token || '')
    if (!token) {
      res.status(401).json({ success: false, message: '未登录' })
      return
    }
    verifyToken(token)
    const file = await getFileView(Number(req.params.id), true)
    res.setHeader('Content-Type', file.mimeType)
    res.send(file.buffer)
  } catch (err) {
    const e = err as Error & { code?: string }
    res.status(400).json({ success: false, code: e.code || ERROR_CODES.LOCAL_WORKER_OFFLINE, message: e.message })
  }
})
