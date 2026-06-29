import './lib/load-env'
import http from 'http'
import { createApp } from './app'
import { config, validateDefaultAdminPassword, validateProductionConfig } from './lib/config'
import { prisma } from './lib/prisma'
import { workerHub } from './websocket/worker-hub'
import { ensureDirs } from './services/file.service'
import { cleanupLegacyTrialData } from './services/trial-legacy-cleanup'

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason)
  process.exit(1)
})

async function initDatabase() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000')
    console.log('[db] SQLite WAL 模式已启用')
  } catch (err) {
    console.warn('[db] WAL 设置跳过:', (err as Error).message)
  }
}

async function main() {
  const prodWarnings = validateProductionConfig()
  for (const w of prodWarnings) console.error(`[生产检查] ${w}`)
  if (prodWarnings.length && config.isProd) {
    console.error('生产环境配置检查未通过，拒绝启动')
    process.exit(1)
  }

  const adminWarn = await validateDefaultAdminPassword()
  if (adminWarn) {
    if (config.isProd) {
      console.error(`[生产检查] ${adminWarn}`)
      process.exit(1)
    }
    console.warn(`[开发警告] ${adminWarn}`)
  }

  await initDatabase()
  await cleanupLegacyTrialData()
  await ensureDirs()
  const app = createApp()
  const server = http.createServer(app)
  workerHub.init(server)

  server.listen(config.port, () => {
    console.log(`和田玉镯子记账系统服务端已启动 [${config.nodeEnv}]: http://localhost:${config.port}`)
    console.log(`Worker WebSocket: ws://localhost:${config.port}/ws/worker`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
