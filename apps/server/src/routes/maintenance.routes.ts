import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { cleanupAcceptanceTestData } from '../services/cleanup.service'
import { config } from '../lib/config'

export const maintenanceRouter = Router()
maintenanceRouter.use(authMiddleware)

maintenanceRouter.post('/cleanup-test-data', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  if (config.isProd && req.body.force !== true) {
    return res.status(403).json({
      success: false,
      message: '生产环境请设置 force=true 并确认仅清理 test_auto_check 标记数据',
    })
  }
  const result = await cleanupAcceptanceTestData(req.user!)
  res.json({ success: true, data: result })
})
