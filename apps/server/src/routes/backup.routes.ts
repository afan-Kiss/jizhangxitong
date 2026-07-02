import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { pullProductionDatabaseToWorker } from '../services/backup.service'
import { workerHub } from '../websocket/worker-hub'
import { ERROR_CODES } from '@jade-account/shared'

export const backupRouter = Router()
backupRouter.use(authMiddleware)

backupRouter.post('/pull-prod-db', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  try {
    const data = await pullProductionDatabaseToWorker(req.user)
    res.json({
      success: true,
      message: '生产数据库已备份到公司电脑',
      data,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as Error & { code?: string }).code
    const status = code === ERROR_CODES.LOCAL_WORKER_OFFLINE ? 503 : 500
    res.status(status).json({ success: false, message, code })
  }
})

backupRouter.get('/worker-ready', requirePermission('permission:manage'), async (_req, res) => {
  res.json({
    success: true,
    data: {
      workerOnline: workerHub.isOnline(),
      canBackup: workerHub.isOnline(),
    },
  })
})
