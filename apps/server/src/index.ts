import http from 'http'
import path from 'path'
import dotenv from 'dotenv'
import { createApp } from './app'
import { config, validateDefaultAdminPassword, validateProductionConfig } from './lib/config'
import { workerHub } from './websocket/worker-hub'
import { ensureDirs } from './services/file.service'

dotenv.config({ path: path.join(__dirname, '../.env') })

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
