import path from 'path'
import fs from 'fs'
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
import { trialRouter } from './routes/trial.routes'

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
  app.use('/api/trial', trialRouter)

  attachAccountWeb(app)

  return app
}

/** 生产环境在 /account/ 子路径托管前端（配合 Nginx 反代到本端口） */
function attachAccountWeb(app: express.Application) {
  const webDir = config.publicWebDir
    ? path.resolve(config.publicWebDir)
    : config.isProd
      ? path.resolve(__dirname, '../../../web')
      : ''

  const indexFile = webDir ? path.join(webDir, 'index.html') : ''
  if (!indexFile || !fs.existsSync(indexFile)) {
    if (config.isProd) {
      console.warn('[web] 未找到前端 index.html，跳过 /account 静态托管')
    }
    return
  }

  console.log(`[web] 托管 /account/ -> ${webDir}`)
  app.use('/account/assets', express.static(path.join(webDir, 'assets'), { maxAge: '7d' }))
  app.get(['/account', '/account/*'], (req, res) => {
    const rel = req.path.replace(/^\/account\/?/, '') || 'index.html'
    const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')
    const filePath = path.join(webDir, safe)
    if (
      safe !== 'index.html'
      && !safe.startsWith('..')
      && fs.existsSync(filePath)
      && fs.statSync(filePath).isFile()
    ) {
      return res.sendFile(filePath)
    }
    return res.sendFile(indexFile)
  })
}
