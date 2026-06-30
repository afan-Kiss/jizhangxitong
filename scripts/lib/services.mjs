/**
 * 验收脚本公共工具：服务检测、自动启动、HTTP 辅助
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import net from 'net'

import { sanitizeReportLine } from './deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..', '..')
export const SERVER = (process.env.ACCEPTANCE_SERVER || 'http://127.0.0.1:3001').replace(/\/$/, '')
export const SCANNER = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
export const SCANNER_ROOT = process.env.SCANNER_PROJECT_ROOT || path.join(ROOT, '..', '扫码枪登记出入库系统')

/** 验收项分级：core=核心业务；external=Worker/7789/Excel上传等外部依赖 */
export const ACCEPTANCE_TIER = {
  CORE: 'core',
  EXTERNAL: 'external',
}

const childProcesses = []
const _acceptanceFailures = { core: [], external: [] }

export function recordAcceptanceResult(tier, msg, ok) {
  if (ok) return
  if (tier === ACCEPTANCE_TIER.CORE) _acceptanceFailures.core.push(msg)
  else _acceptanceFailures.external.push(msg)
}

export function getAcceptanceFailures() {
  return { ..._acceptanceFailures, core: [..._acceptanceFailures.core], external: [..._acceptanceFailures.external] }
}

export function resetAcceptanceFailures() {
  _acceptanceFailures.core.length = 0
  _acceptanceFailures.external.length = 0
}

export function isLocalServer(url = SERVER) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(url).replace(/\/$/, ''))
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 本地日历日期 yyyy-mm-dd（避免 UTC toISOString 在凌晨跨日导致验收失败） */
export function localDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function monthStartDateString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { res, json, text }
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function getAdminCredentials() {
  try {
    const text = await fs.readFile(path.join(ROOT, 'secrets/initial-admin-password.txt'), 'utf-8')
    const userM = text.match(/用户名:\s*(.+)/)
    const pwdM = text.match(/密码:\s*(.+)/)
    return {
      username: userM?.[1]?.trim() || 'fanfan',
      password: pwdM?.[1]?.trim() || 'admin123',
    }
  } catch {
    return { username: 'fanfan', password: 'admin123' }
  }
}

export async function getAdminPassword() {
  return (await getAdminCredentials()).password
}

export async function getAdminUsername() {
  return (await getAdminCredentials()).username
}

export async function login(serverUrl) {
  const server = (serverUrl || process.env.ACCEPTANCE_SERVER || 'http://127.0.0.1:3001').replace(/\/$/, '')
  const { username, password } = await getAdminCredentials()
  const { res, json } = await fetchJson(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok || !json.data?.token) throw new Error(`登录失败: ${JSON.stringify(json)}`)
  return json.data.token
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false) })
  })
}

export async function getPortOwner(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' })
      const line = out.split('\n').find((l) => l.includes('LISTENING'))
      if (!line) return null
      const pid = line.trim().split(/\s+/).pop()
      return { pid: Number(pid), raw: line.trim() }
    }
    const out = execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null || true`, { encoding: 'utf-8' })
    const pid = out.trim().split('\n')[0]
    return pid ? { pid: Number(pid) } : null
  } catch {
    return null
  }
}

export async function waitForHttp(url, maxSec = 30, label = url) {
  for (let i = 0; i < maxSec; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* retry */ }
    await sleep(1000)
  }
  throw new Error(`${label} 在 ${maxSec}s 内未就绪`)
}

export async function ensureServerRunning(logFn) {
  const serverUrl = SERVER.replace(/\/$/, '')
  for (let i = 0; i < 5; i++) {
    try {
      const h = await fetchJson(`${serverUrl}/api/health`)
      if (h.res.ok) {
        logFn('startup', `服务端已运行 ${SERVER}`)
        return
      }
    } catch { /* retry */ }
    await sleep(1000)
  }

  const isRemote = !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(serverUrl)
  if (isRemote) {
    throw new Error(`远程服务端未就绪: ${serverUrl}/api/health`)
  }

  const port = Number(new URL(SERVER).port || 3001)
  const open = await isPortOpen(port)
  if (open) {
    const owner = await getPortOwner(port)
    logFn('startup', `端口 ${port} 被占用 pid=${owner?.pid || '?'}，等待健康检查...`)
    try {
      await waitForHttp(`${SERVER}/api/health`, 15, '记账服务端')
      logFn('startup', `服务端已运行 ${SERVER}`)
      return
    } catch {
      logFn('startup', `端口 ${port} 被占用但健康检查失败`, false)
    }
  }

  logFn('startup', '自动启动服务端...')
  const proc = spawn('npm', ['run', 'dev:server'], {
    cwd: ROOT,
    shell: true,
    stdio: 'ignore',
    detached: true,
  })
  proc.unref()
  childProcesses.push(proc)
  await waitForHttp(`${SERVER}/api/health`, 45, '记账服务端')
  logFn('startup', '服务端启动成功')
}

export const WEB_DEV = 'http://127.0.0.1:5173'

export async function ensureWebDevRunning(logFn = () => {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(WEB_DEV)
      if (r.ok) {
        logFn('startup', `Web 已运行 ${WEB_DEV}`)
        return WEB_DEV
      }
    } catch { /* retry */ }
    await sleep(500)
  }

  logFn('startup', '自动启动 Web preview...')
  const distIndex = path.join(ROOT, 'apps/web/dist/index.html')
  if (!existsSync(distIndex)) {
    logFn('startup', '构建 Web dist...')
    execSync('npm run build -w @jade-account/web', { cwd: ROOT, stdio: 'inherit', timeout: 180000 })
  }
  const proc = spawn('npx', ['vite', 'preview', '--port', '5173', '--host', '127.0.0.1'], {
    cwd: path.join(ROOT, 'apps/web'),
    shell: true,
    stdio: 'ignore',
    detached: true,
  })
  proc.unref()
  childProcesses.push(proc)
  await waitForHttp(WEB_DEV, 30, 'Web preview')
  logFn('startup', 'Web 启动成功')
  return WEB_DEV
}

/** 浏览器验收基址：远程 /account/；本地仅 API 时用 Vite dev（/scan 无 /account 前缀） */
export async function resolveAcceptanceWebBase(logFn = () => {}) {
  if (process.env.ACCEPTANCE_WEB) {
    return process.env.ACCEPTANCE_WEB.replace(/\/$/, '')
  }
  const server = (process.env.ACCEPTANCE_SERVER || 'http://127.0.0.1:3001').replace(/\/$/, '')
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(server)
  if (!isLocal) {
    if (/\/account$/i.test(server)) return server
    return server.includes('/account') ? server : `${server}/account`
  }
  return ensureWebDevRunning(logFn)
}

/** Worker 状态应查询的 API 基址（本地 dev + 远程 Worker 时查远程，与 test:worker-online 一致） */
export async function getWorkerCheckBaseUrl() {
  const apiServer = SERVER.replace(/\/$/, '')
  if (!isLocalServer(apiServer)) return apiServer

  try {
    const text = await fs.readFile(path.join(ROOT, 'apps/worker/.env'), 'utf-8')
    const m = text.match(/^SERVER_WS_URL=(.*)$/m)
    const wsUrl = m?.[1]?.trim().replace(/^["']|["']$/g, '')
    if (wsUrl && !/localhost|127\.0\.0\.1/i.test(wsUrl)) {
      const u = new URL(wsUrl.replace(/^ws/i, 'http'))
      let base = `${u.protocol}//${u.host}`
      if (/\/account/i.test(u.pathname)) base = `${base}/account`
      return base.replace(/\/$/, '')
    }
  } catch { /* local worker */ }
  return apiServer
}

export async function fetchWorkerStatus(token, baseUrl) {
  return fetchJson(`${baseUrl.replace(/\/$/, '')}/api/local-worker/status`, {
    headers: authHeaders(token),
  })
}

async function tryStartLocalWorker() {
  const ps1 = path.join(ROOT, 'scripts/windows/restart-local-worker.ps1')
  if (process.platform === 'win32' && existsSync(ps1)) {
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
        cwd: ROOT,
        stdio: 'ignore',
        timeout: 120000,
      })
      return
    } catch { /* fall through */ }
  }
  const proc = spawn('npm', ['run', 'dev:worker'], {
    cwd: ROOT,
    shell: true,
    stdio: 'ignore',
    detached: true,
  })
  proc.unref()
  childProcesses.push(proc)
}

export async function ensureWorkerRunning(logFn) {
  const token = await login()
  const workerBase = await getWorkerCheckBaseUrl()
  const isRemoteCheck = workerBase !== SERVER.replace(/\/$/, '')

  let workerToken = token
  if (isRemoteCheck) workerToken = await login(workerBase)

  let status = await fetchWorkerStatus(workerToken, workerBase)
  if (status.json.data?.online) {
    const label = isRemoteCheck ? `Worker 已在线（远程 ${workerBase}）` : 'Worker 已在线'
    logFn('startup', label)
    return token
  }

  if (isRemoteCheck) {
    logFn('startup', `尝试启动本地 Worker 并连接 ${workerBase}...`)
    await tryStartLocalWorker()
    for (let i = 0; i < 25; i++) {
      await sleep(1000)
      status = await fetchWorkerStatus(workerToken, workerBase)
      if (status.json.data?.online) {
        logFn('startup', `Worker 已连接远程 ${workerBase}`)
        return token
      }
    }
    const reason = status.json.data?.reason || status.json.data?.message || 'offline'
    logFn('startup', `远程 Worker 未在线（${workerBase}）：${reason} — 外部依赖项将跳过`, false)
    return token
  }

  logFn('startup', '自动启动 Worker...')
  await tryStartLocalWorker()

  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    status = await fetchWorkerStatus(token, SERVER)
    if (status.json.data?.online) {
      logFn('startup', 'Worker 已连接')
      return token
    }
  }
  logFn('startup', 'Worker 未能连接（外部依赖项将跳过）', false)
  return token
}

export async function ensureScannerRunning(logFn) {
  try {
    const h = await fetchJson(`${SCANNER}/api/health`)
    if (h.res.ok) {
      logFn('startup', `扫码枪 API 已运行 ${SCANNER}`)
      return true
    }
  } catch { /* start */ }

  const scannerServer = path.join(SCANNER_ROOT, 'apps', 'server')
  try {
    await fs.access(scannerServer)
  } catch {
    logFn('scanner', `扫码枪项目不存在: ${scannerServer}`, false)
    return false
  }

  logFn('startup', '自动启动扫码枪服务...')
  const proc = spawn('npm', ['run', 'dev'], {
    cwd: scannerServer,
    shell: true,
    stdio: 'ignore',
    detached: true,
  })
  proc.unref()
  childProcesses.push(proc)

  try {
    await waitForHttp(`${SCANNER}/api/health`, 30, '扫码枪 API')
    logFn('startup', '扫码枪 API 启动成功')
    return true
  } catch {
    logFn('scanner', '扫码枪 API 启动失败', false)
    return false
  }
}

export async function createTestPng() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return Buffer.from(b64, 'base64')
}

/**
 * Worker 文件上传（带超时与重试）
 * @returns {{ ok: boolean, json?: object, error?: Error, fileSize?: number, attempts?: number, uploadUrl?: string }}
 */
export async function uploadImageWithRetry(token, fileType, name, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2
  const timeoutMs = opts.timeoutMs ?? 45000
  const server = (opts.server ?? SERVER).replace(/\/$/, '')
  const uploadUrl = `${server}/api/files/upload`
  const buf = await createTestPng()
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const form = new FormData()
      form.append('file', new Blob([buf], { type: 'image/png' }), name)
      form.append('fileType', fileType)
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const json = await res.json()
      if (json.success) return { ok: true, json, attempt, fileSize: buf.length, uploadUrl }
      lastError = new Error(json.message || `HTTP ${res.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < maxRetries) await sleep(2000)
  }

  return {
    ok: false,
    error: lastError,
    fileSize: buf.length,
    attempts: maxRetries + 1,
    uploadUrl,
  }
}

export async function writeMarkdownReport(report, mode) {
  const dir = path.join(ROOT, 'reports')
  await fs.mkdir(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(dir, `acceptance-${ts}-${mode}.md`)
  const lines = [
    `# 验收报告 (${mode})`,
    '',
    `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
  ]
  for (const [title, key] of report.sections) {
    lines.push(`## ${title}`)
    lines.push('')
    const items = report.data[key] || []
    if (!items.length) lines.push('- (无)')
    else items.forEach((l) => lines.push(`- ${sanitizeReportLine(l)}`))
    lines.push('')
  }
  await fs.writeFile(file, lines.join('\n'), 'utf-8')
  return file
}
