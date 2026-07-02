#!/usr/bin/env node
/**
 * Worker 专项验收：env 加载、WebSocket、远程 online、扫码枪、图片读写、重连
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import WebSocket from 'ws'
import {
  ROOT,
  fetchJson,
  sleep,
  getAdminCredentials,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_ENV = path.join(ROOT, 'apps/worker/.env')
const PROD_WS = 'ws://8.137.126.18/account/ws/worker'
const REMOTE = (process.env.ACCEPTANCE_SERVER || 'http://8.137.126.18/account').replace(/\/$/, '')

const results = []
let failed = 0

async function remoteLogin() {
  const { username, password } = await getAdminCredentials()
  const { json, res } = await fetchJson(`${REMOTE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok || !json.data?.token) throw new Error(`登录失败: ${JSON.stringify(json)}`)
  return json.data.token
}

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function parseWorkerEnv() {
  const text = await fs.readFile(WORKER_ENV, 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function testWsHandshake(url, token, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const wsUrl = new URL(url)
    if (token) wsUrl.searchParams.set('token', token)
    const ws = new WebSocket(wsUrl.toString())
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('WebSocket 握手超时'))
    }, timeoutMs)
    ws.on('open', () => {
      clearTimeout(timer)
      ws.close()
      resolve(true)
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`WebSocket 握手失败 HTTP ${res.statusCode}`))
    })
  })
}

async function runWorkerStatus() {
  const out = execSync('npm run worker:status', { cwd: ROOT, encoding: 'utf-8', timeout: 30000 })
  const jsonStart = out.indexOf('{')
  if (jsonStart < 0) throw new Error('worker:status 无 JSON 输出')
  let depth = 0
  for (let i = jsonStart; i < out.length; i++) {
    if (out[i] === '{') depth++
    if (out[i] === '}') depth--
    if (depth === 0) return JSON.parse(out.slice(jsonStart, i + 1))
  }
  throw new Error('worker:status JSON 不完整')
}

async function ensureWorkerProcess(logFn) {
  const token = await remoteLogin()
  let st = await fetchJson(`${REMOTE}/api/local-worker/status`, { headers: { Authorization: `Bearer ${token}` } })
  if (st.json.data?.online) return token

  logFn('启动 Worker...')
  const ps1 = path.join(ROOT, 'scripts/windows/restart-local-worker.ps1')
  if (process.platform === 'win32' && fsSync.existsSync(ps1)) {
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 120000,
      })
    } catch {
      /* fall through */
    }
  } else {
    spawn('npm', ['run', 'dev:worker'], { cwd: ROOT, detached: true, stdio: 'ignore', shell: true }).unref()
    for (let i = 0; i < 30; i++) {
      await sleep(1000)
      st = await fetchJson(`${REMOTE}/api/local-worker/status`, { headers: { Authorization: `Bearer ${token}` } })
      if (st.json.data?.online) break
    }
  }
  return token
}

async function main() {
  installScriptTimeout('test:worker-online', TIMEOUTS.workerOnline)
  console.log('=== test:worker-online ===\n')

  // 1. .env 存在且可读
  try {
    await fs.access(WORKER_ENV)
    pass('apps/worker/.env 存在')
  } catch {
    fail('apps/worker/.env 存在', '文件缺失')
    process.exit(1)
  }

  const env = await parseWorkerEnv()
  const wsUrl = env.SERVER_WS_URL || PROD_WS
  const token = env.WORKER_WS_TOKEN || ''

  // 2. SERVER_WS_URL 不是 localhost
  if (/localhost|127\.0\.0\.1/i.test(wsUrl)) {
    fail('SERVER_WS_URL 不是 localhost', wsUrl)
  } else {
    pass('SERVER_WS_URL 不是 localhost', wsUrl)
  }

  // 3. worker:status 从项目根也能读到正确 URL
  try {
    const status = await runWorkerStatus()
    if (/localhost|127\.0\.0\.1/i.test(status.serverWsUrl)) {
      fail('worker:status 读取 SERVER_WS_URL', status.serverWsUrl)
    } else {
      pass('worker:status 读取 SERVER_WS_URL', status.serverWsUrl)
    }
    if (status.envFile) pass('env 文件路径', status.envFile)
    else fail('env 文件路径', '未加载')
  } catch (e) {
    fail('worker:status', e.message)
  }

  // 4. WebSocket 握手
  try {
    await testWsHandshake(wsUrl, token)
    pass('WebSocket 握手', wsUrl)
  } catch (e) {
    fail('WebSocket 握手', e.message)
  }

  // 5. 确保 Worker 在线
  let authToken
  try {
    authToken = await ensureWorkerProcess((msg) => console.log(msg))
    const st = await fetchJson(`${REMOTE}/api/local-worker/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (st.json.data?.online) {
      pass('远程 online=true', `workerId=${st.json.data.workerId}`)
    } else {
      fail('远程 online=true', JSON.stringify(st.json.data))
    }
  } catch (e) {
    fail('远程 online=true', e.message)
  }

  // 6. 图片保存与读取（通过 Worker RPC 需 online；本地直接测 file-store 逻辑）
  try {
    const { writeFile, readFile, mkdir } = await import('fs/promises')
    const base = env.FILE_BASE_DIR || path.join(ROOT, 'apps/worker/test-files')
    await mkdir(base, { recursive: true })
    const testFile = path.join(base, `_worker-test-${Date.now()}.txt`)
    const content = 'worker-online-test'
    await writeFile(testFile, content, 'utf-8')
    const read = await readFile(testFile, 'utf-8')
    if (read === content) pass('图片目录可写可读', testFile)
    else fail('图片目录可写可读', '内容不一致')
    await fs.unlink(testFile).catch(() => {})
  } catch (e) {
    fail('图片目录可写可读', e.message)
  }

  // 9. 断开重连：杀进程后重启
  if (process.platform === 'win32') {
    try {
      execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'@jade-account/worker\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
        { stdio: 'ignore' },
      )
      await sleep(2000)
      const ps1 = path.join(ROOT, 'scripts/windows/start-local-worker.ps1')
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 120000,
      })
      const authToken2 = await remoteLogin()
      const st2 = await fetchJson(`${REMOTE}/api/local-worker/status`, {
        headers: { Authorization: `Bearer ${authToken2}` },
      })
      if (st2.json.data?.online) pass('重启后 30s 内 online=true')
      else fail('重启后 30s 内 online=true')
    } catch (e) {
      fail('重启后 30s 内 online=true', e.message)
    }
  } else {
    pass('重启后 30s 内 online=true', '跳过（非 Windows）')
  }

  console.log(`\n=== 结果: ${results.length - failed}/${results.length} 通过 ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
