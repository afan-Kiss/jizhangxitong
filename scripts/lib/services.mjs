/**
 * 验收脚本公共工具：服务检测、自动启动、HTTP 辅助
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import net from 'net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..', '..')
export const SERVER = process.env.ACCEPTANCE_SERVER || 'http://localhost:3001'
export const SCANNER = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
export const SCANNER_ROOT = process.env.SCANNER_PROJECT_ROOT || path.join(ROOT, '..', '扫码枪登记出入库系统')

const childProcesses = []

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

export async function login() {
  const { res, json } = await fetchJson(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
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
  try {
    const h = await fetchJson(`${SERVER}/api/health`)
    if (h.res.ok) {
      logFn('startup', `服务端已运行 ${SERVER}`)
      return
    }
  } catch { /* start */ }

  const port = Number(new URL(SERVER).port || 3001)
  const open = await isPortOpen(port)
  if (open) {
    const owner = await getPortOwner(port)
    logFn('startup', `端口 ${port} 被占用 pid=${owner?.pid || '?'}，可能非本服务`, false)
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

export async function ensureWorkerRunning(logFn) {
  const token = await login()
  let status = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
  if (status.json.data?.online) {
    logFn('startup', 'Worker 已在线')
    return token
  }

  logFn('startup', '自动启动 Worker...')
  const proc = spawn('npm', ['run', 'dev:worker'], {
    cwd: ROOT,
    shell: true,
    stdio: 'ignore',
    detached: true,
  })
  proc.unref()
  childProcesses.push(proc)

  for (let i = 0; i < 20; i++) {
    await sleep(1000)
    status = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
    if (status.json.data?.online) {
      logFn('startup', 'Worker 已连接')
      return token
    }
  }
  logFn('worker', 'Worker 未能连接（部分测试将跳过）', false)
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
    else items.forEach((l) => lines.push(`- ${l}`))
    lines.push('')
  }
  await fs.writeFile(file, lines.join('\n'), 'utf-8')
  return file
}
