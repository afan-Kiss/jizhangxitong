#!/usr/bin/env node
/**
 * 一键部署阿里云：本地构建 → 上传 → 重启 Worker → 远程验收
 */
import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DEPLOY_PY = path.join(ROOT, 'deploy/aliyun/upload-and-deploy.py')

function loadDeployEnv() {
  const envPath = path.join(ROOT, 'secrets/deploy.env')
  try {
    const text = fsSync.readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^SSH_PASS=(.+)$/)
      if (m && !process.env.SSH_PASS) {
        process.env.SSH_PASS = m[1].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* optional */ }
}

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
    console.error('请在当前终端设置 SSH_PASS 后重试，或由 Cursor 在具备凭据的环境下执行。')
    process.exit(1)
  }

  run('npm run build -w @jade-account/shared')
  run('npm run build -w @jade-account/server')
  run('npm run build -w @jade-account/web', {
    env: { ...process.env, VITE_APP_BASE: '/account/' },
  })
  run('npm run build -w @jade-account/worker')

  run(`python "${DEPLOY_PY}"`, {
    env: { ...process.env },
  })

  await restartWorker()

  // 等待 Worker 连接
  console.log('等待 Worker 连接阿里云 (30s)...')
  await new Promise((r) => setTimeout(r, 30000))

  const infoPath = path.join(ROOT, 'deploy/aliyun/last-deploy-info.json')
  let remoteUrl = `https://${process.env.JADE_PUBLIC_DOMAIN || 'xiangyuzhubao.xyz'}/account/`
  try {
    const info = JSON.parse(await fs.readFile(infoPath, 'utf-8'))
    remoteUrl = info.url || remoteUrl
  } catch { /* use default */ }

  run(`node scripts/remote-acceptance.mjs`, {
    env: { ...process.env, ACCEPTANCE_SERVER: remoteUrl, ACCEPTANCE_MODE: 'full' },
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
