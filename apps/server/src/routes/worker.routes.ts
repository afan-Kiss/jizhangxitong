import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import {
  getWorkerStatusDetail,
  probeScanChannel,
  probeUploadChannel,
} from '../services/worker-status.service'

export const workerApiRouter = Router()
workerApiRouter.use(authMiddleware)

workerApiRouter.get('/status', async (_req, res) => {
  const data = await getWorkerStatusDetail({ probeUpload: true, probeScan: true })
  res.json({ success: true, data })
})

workerApiRouter.post('/probe-upload', async (_req, res) => {
  const timeoutMs = Number(_req.body?.timeoutMs || 3000)
  const result = await probeUploadChannel(Math.min(timeoutMs, 5000))
  const status = await getWorkerStatusDetail()
  res.json({
    success: true,
    data: {
      ...result,
      uploadChannelReady: status.uploadChannelReady,
      message: result.ok
        ? '图片上传通道正常'
        : '公司电脑本地助手没连上，先重启本地助手；这笔账可以先不传图保存。',
    },
  })
})

workerApiRouter.post('/probe-scan', async (_req, res) => {
  const timeoutMs = Number(_req.body?.timeoutMs || 3000)
  const result = await probeScanChannel(Math.min(timeoutMs, 5000))
  const status = await getWorkerStatusDetail()
  res.json({
    success: true,
    data: {
      ...result,
      scanChannelReady: status.scanChannelReady,
    },
  })
})
