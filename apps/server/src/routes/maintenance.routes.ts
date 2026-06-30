import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { cleanupAcceptanceTestData } from '../services/cleanup.service'
import { rebuildLedger } from '../finance/core-ledger'
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

maintenanceRouter.post('/rebuild-ledger', requirePermission('permission:manage'), async (req: AuthRequest, res) => {
  const dryRun = req.body?.dryRun === true
  const force = req.body?.force === true

  if (config.isProd && !dryRun && !force) {
    return res.status(403).json({
      success: false,
      message: '生产环境真实 rebuild 必须设置 force=true；建议先 dryRun=true 预览',
    })
  }

  try {
    const result = await rebuildLedger({ dryRun, force })
    res.json({ success: true, data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[maintenance/rebuild-ledger]', message)
    res.status(500).json({ success: false, message })
  }
})
