import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

export const WORKER_DIR = path.resolve(__dirname, '..')
export const PROJECT_ROOT = path.resolve(WORKER_DIR, '../..')

const PRODUCTION_WS = 'ws://8.137.126.18/account/ws/worker'

const ENV_CANDIDATES = [
  path.join(WORKER_DIR, '.env'),
  path.join(PROJECT_ROOT, '.env'),
]

let loadedEnvPath: string | null = null

/** 按固定路径加载 .env，不依赖 cwd；process.env 已有值优先 */
export function loadWorkerEnv(): string | null {
  if (loadedEnvPath !== null) return loadedEnvPath
  for (const envPath of ENV_CANDIDATES) {
    if (!fs.existsSync(envPath)) continue
    dotenv.config({ path: envPath, override: false })
    if (!loadedEnvPath) loadedEnvPath = envPath
  }
  return loadedEnvPath
}

export function getWorkerEnvPath(): string | null {
  loadWorkerEnv()
  return loadedEnvPath
}

export function getServerWsUrl(): string {
  loadWorkerEnv()
  return process.env.SERVER_WS_URL || PRODUCTION_WS
}

export function getWorkerWsToken(): string {
  loadWorkerEnv()
  return process.env.WORKER_WS_TOKEN || ''
}

export function assertWorkerEnvForBoot(): void {
  loadWorkerEnv()
  const url = getServerWsUrl()
  const isLocal = /localhost|127\.0\.0\.1/i.test(url)
  const allowLocal = process.env.WORKER_DEV === '1' || process.env.NODE_ENV === 'development'
  if (isLocal && !allowLocal) {
    throw new Error(
      'Worker 当前连的是 localhost，不会连接阿里云。请在 apps/worker/.env 设置 SERVER_WS_URL=ws://8.137.126.18/account/ws/worker',
    )
  }
  if (!getWorkerWsToken()) {
    throw new Error('WORKER_WS_TOKEN 为空，请检查 apps/worker/.env 或与服务器 .env 保持一致')
  }
}

export function maskToken(token: string): string {
  if (!token) return '(empty)'
  if (token.length <= 8) return '****'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export { PRODUCTION_WS }
