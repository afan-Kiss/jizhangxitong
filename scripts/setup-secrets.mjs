/**
 * 自动生成 JWT_SECRET / WORKER_WS_TOKEN
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import {
  readEnvFile, writeEnvFile, getEnvValue, setEnvValue,
  generateSecret, isWeakJwtSecret, isWeakWorkerToken,
} from './lib/env-utils.mjs'
import { ROOT, ensureServerRunning, ensureWorkerRunning, fetchJson, authHeaders, login, sleep } from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENV = path.join(ROOT, 'apps/server/.env')
const WORKER_ENV = path.join(ROOT, 'apps/worker/.env')
const SERVER_EXAMPLE = path.join(ROOT, 'apps/server/.env.example')

async function ensureServerEnv() {
  let content = await readEnvFile(SERVER_ENV)
  if (!content) {
    content = (await readEnvFile(SERVER_EXAMPLE)) || ''
    await writeEnvFile(SERVER_ENV, content)
  }
  return content
}

async function restartServerOnPort() {
  try {
    const out = execSync('netstat -ano | findstr :3001 | findstr LISTENING', { encoding: 'utf-8' })
    const pid = out.trim().split(/\s+/).pop()
    if (pid && /^\d+$/.test(pid)) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      await sleep(2000)
    }
  } catch { /* not running */ }
}

async function main() {
  console.log('\n========== 密钥自动配置 setup:secrets ==========\n')
  const result = { generated: [], kept: [] }

  let serverEnv = await ensureServerEnv()
  let workerEnv = (await readEnvFile(WORKER_ENV)) || ''

  const jwt = getEnvValue(serverEnv, 'JWT_SECRET')
  const workerToken = getEnvValue(serverEnv, 'WORKER_WS_TOKEN')

  if (isWeakJwtSecret(jwt)) {
    const next = generateSecret(64)
    serverEnv = setEnvValue(serverEnv, 'JWT_SECRET', next)
    result.generated.push('JWT_SECRET')
  } else {
    result.kept.push('JWT_SECRET')
  }

  let finalWorkerToken = getEnvValue(serverEnv, 'WORKER_WS_TOKEN')
  if (isWeakWorkerToken(finalWorkerToken)) {
    finalWorkerToken = generateSecret(64)
    serverEnv = setEnvValue(serverEnv, 'WORKER_WS_TOKEN', finalWorkerToken)
    result.generated.push('WORKER_WS_TOKEN')
  } else {
    result.kept.push('WORKER_WS_TOKEN')
  }

  await writeEnvFile(SERVER_ENV, serverEnv)

  if (!workerEnv) {
    workerEnv = `SERVER_WS_URL=ws://localhost:3001/ws/worker\nWORKER_ID=local-worker-1\nWORKER_NAME=本地记账Worker\nSCANNER_API_URL=http://127.0.0.1:7789\nFILE_BASE_DIR=D:/jewelry-account-files\nWORKER_LOG_DIR=./logs\n`
  }
  workerEnv = setEnvValue(workerEnv, 'WORKER_WS_TOKEN', finalWorkerToken || getEnvValue(serverEnv, 'WORKER_WS_TOKEN'))
  await writeEnvFile(WORKER_ENV, workerEnv)

  console.log('已生成:', result.generated.length ? result.generated.join(', ') : '无')
  console.log('保留未改:', result.kept.length ? result.kept.join(', ') : '无')

  await restartServerOnPort()

  console.log('\n正在 build...')
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

  console.log('\n正在 acceptance 验证...')
  execSync('npm run acceptance', { cwd: ROOT, stdio: 'inherit' })

  await sleep(2000)
  try {
    const token = await login()
    const worker = await fetchJson(`${process.env.ACCEPTANCE_SERVER || 'http://localhost:3001'}/api/local-worker/status`, {
      headers: authHeaders(token),
    })
    const online = worker.json.data?.online
    console.log(`\nWorker 连接: ${online ? '正常' : '未连接（请确认 Worker 已启动）'}`)
  } catch (e) {
    console.log(`\nWorker 连接验证跳过: ${e.message}`)
  }

  console.log('\nsetup:secrets 完成\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
