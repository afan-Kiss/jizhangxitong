import { Router } from 'express'
import { authMiddleware, requirePermission, AuthRequest } from '../middleware/auth'
import { isTrialModeEnabled } from '../services/trial-mode.service'
import {
  cleanupTrialData,
  previewTrialData,
  promoteTrialToFormal,
} from '../services/trial.service'

export const trialRouter = Router()
trialRouter.use(authMiddleware)

trialRouter.get('/status', async (_req, res) => {
  const enabled = await isTrialModeEnabled()
  const preview = await previewTrialData()
  res.json({ success: true, data: { enabled, preview } })
})

trialRouter.get('/preview', requirePermission('setting:update'), async (_req, res) => {
  const preview = await previewTrialData()
  res.json({ success: true, data: preview })
})

trialRouter.post('/cleanup', requirePermission('setting:update'), async (req: AuthRequest, res) => {
  const result = await cleanupTrialData(req.user!)
  res.json({ success: true, data: result })
})

trialRouter.post('/promote', requirePermission('setting:update'), async (req: AuthRequest, res) => {
  const result = await promoteTrialToFormal(req.user!, req.body)
  res.json({ success: true, data: result })
})
