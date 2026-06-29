#!/usr/bin/env node
/**
 * 显式轮换 WORKER_WS_TOKEN：更新远程 .env + 本地 worker .env + 重启 Worker
 */
import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchJson, loadDeployEnv, RECOMMENDED_WS, ROOT } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROTATE_PY = path.join(ROOT, 'deploy/aliyun/rotate-worker-token.py')

function restartWorker() {
  try {
    execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'@jade-account/worker\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
      { stdio: 'ignore' },
    )
  } catch { /* */ }
  const child = spawn('npm', ['run', 'dev:worker'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  })
  child.unref()
}

async function waitWorkerOnline(maxSec = 30) {
  const server = (process.env.ACCEPTANCE_SERVER || 'http://8.137.126.18/account').replace(/\/$/, '')
  const login = await fetchJson(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: await readAdminPassword() }),
  })
  if (!login.res.ok) return false
  const token = login.json.data?.token
  for (let i = 0; i < maxSec; i++) {
    const st = await fetchJson(`${server}/api/local-worker/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (st.json.data?.online) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function readAdminPassword() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'secrets/initial-admin-password.txt'), 'utf-8')
    const m = text.match(/密码:\s*(.+)/)
    if (m?.[1]?.trim()) return m[1].trim()
  } catch { /* */ }
  return process.env.ADMIN_PASSWORD || ''
}

async function main() {
  loadDeployEnv()
  if (!process.env.SSH_PASS) {
    console.error('缺少 SSH_PASS，无法更新远程 WORKER_WS_TOKEN')
    process.exit(1)
  }

  console.log('\n========== 轮换 WORKER_WS_TOKEN ==========\n')
  execSync(`python "${ROTATE_PY}"`, { cwd: ROOT, stdio: 'inherit', env: process.env })

  restartWorker()
  console.log('已重启本地 Worker，等待连接...')
  const online = await waitWorkerOnline(45)
  console.log(`Worker online: ${online ? 'true ✓' : 'false ✗'}`)
  console.log(`Worker WS: ${RECOMMENDED_WS}`)
  if (!online) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
