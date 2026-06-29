#!/usr/bin/env node
/**
 * 一键部署阿里云：本地构建 → 上传 → 同步 Worker token → 远程验收
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadDeployEnv, RECOMMENDED_URL } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DEPLOY_PY = path.join(ROOT, 'deploy/aliyun/upload-and-deploy.py')

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}

async function restartWorker() {
  console.log('\n>>> 重启本地 Worker...')
  try {
    execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'@jade-account/worker\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
      { stdio: 'ignore' },
    )
  } catch { /* ignore */ }

  const logDir = path.join(ROOT, 'apps/worker/logs')
  await fs.mkdir(logDir, { recursive: true })
  const out = path.join(logDir, 'worker-deploy-restart.log')
  const logStream = fsSync.openSync(out, 'a')
  const child = spawn('npm', ['run', 'dev:worker'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    shell: true,
    env: { ...process.env },
  })
  child.unref()
  fsSync.closeSync(logStream)
  console.log(`Worker 已在后台启动，日志: ${out}`)
}

async function main() {
  loadDeployEnv()
  if (!process.env.SSH_PASS) {
    console.error('缺少 SSH_PASS 环境变量，无法 SSH 部署阿里云。')
    process.exit(1)
  }

  run('npm run build -w @jade-account/shared')
  run('npm run build -w @jade-account/server')
  run('npm run build -w @jade-account/web', {
    env: { ...process.env, VITE_APP_BASE: '/account/' },
  })
  run('npm run build -w @jade-account/worker')

  run(`python "${DEPLOY_PY}"`, { env: { ...process.env } })

  await restartWorker()

  console.log('等待 Worker 连接阿里云 (30s)...')
  await new Promise((r) => setTimeout(r, 30000))

  const remoteUrl = RECOMMENDED_URL
  run(`node scripts/remote-acceptance.mjs`, {
    env: { ...process.env, ACCEPTANCE_SERVER: remoteUrl, ACCEPTANCE_MODE: 'full' },
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
