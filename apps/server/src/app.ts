import express from 'express'
import cors from 'cors'
import { config } from './lib/config'
import { authRouter } from './routes/auth.routes'
import { braceletRouter, workerRouter } from './routes/bracelet.routes'
import { expenseRouter } from './routes/expense.routes'
import { saleRouter } from './routes/sale.routes'
import { fileRouter } from './routes/file.routes'
import { exportRouter } from './routes/export.routes'
import {
  logRouter,
  permissionRouter,
  settingsRouter,
} from './routes/settings.routes'
import { maintenanceRouter } from './routes/maintenance.routes'

export function createApp() {
  const app = express()
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }))
  app.use(express.json({ limit: '50mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, message: '和田玉镯子记账系统运行中' })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/local-worker', workerRouter)
  app.use('/api/bracelets', braceletRouter)
  app.use('/api/expenses', expenseRouter)
  app.use('/api/sales', saleRouter)
  app.use('/api/files', fileRouter)
  app.use('/api/exports', exportRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/operation-logs', logRouter)
  app.use('/api/permissions', permissionRouter)
  app.use('/api/maintenance', maintenanceRouter)

  return app
}
