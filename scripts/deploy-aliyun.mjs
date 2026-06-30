#!/usr/bin/env node
/**
 * 一键部署阿里云：本地构建 → 上传 → 重启 Worker → 远程验收
 */
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadDeployEnv, RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { fetchJson, login, sleep } from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'
import { verifyDeployVersion } from './verify-deploy-version.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DEPLOY_PY = path.join(ROOT, 'deploy/aliyun/upload-and-deploy.py')

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout: opts.timeout ?? 600000, ...opts })
}

async function restartWorker() {
  console.log('\n>>> 重启本地 Worker...')
  const ps1 = path.join(ROOT, 'scripts/windows/restart-local-worker.ps1')
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 120000,
    })
  } catch (e) {
    console.error('Worker 重启脚本失败:', e.message)
  }
}

async function verifyWorkerRemote(baseUrl) {
  console.log('\n>>> 部署后 Worker 验收...')
  const prev = process.env.ACCEPTANCE_SERVER
  process.env.ACCEPTANCE_SERVER = baseUrl
  try {
    const token = await login()
    const st = await fetchJson(`${baseUrl}/api/local-worker/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = st.json.data || {}
    console.log('Worker online:', d.online)
    console.log('reason:', d.reason)
    console.log('message:', d.message)
    console.log('lastHeartbeatAt:', d.lastHeartbeatAt)
    console.log('scannerAvailable:', d.scannerAvailable)
    console.log('scannerApiBaseUrl:', d.scannerApiBaseUrl)

    let localStatus = {}
    try {
      const out = execSync('npm run worker:status', { cwd: ROOT, encoding: 'utf-8', timeout: 30000 })
      const i = out.indexOf('{')
      if (i >= 0) localStatus = JSON.parse(out.slice(i))
    } catch { /* ignore */ }
    console.log('本地 serverWsUrl:', localStatus.serverWsUrl)
    console.log('本地 fileBaseWritable:', localStatus.fileBaseWritable)
    console.log('本地 scannerAvailable:', localStatus.scannerAvailable)

    return d
  } catch (e) {
    console.error('Worker 验收失败:', e.message)
    return { online: false, reason: 'WORKER_NOT_CONNECTED' }
  } finally {
    if (prev !== undefined) process.env.ACCEPTANCE_SERVER = prev
    else delete process.env.ACCEPTANCE_SERVER
  }
}

async function main() {
  installScriptTimeout('deploy:aliyun', TIMEOUTS.deploy)
  run('node scripts/guard-no-networkidle.mjs', { timeout: 10000 })

  loadDeployEnv()
  if (!process.env.SSH_PASS) {
    console.error('缺少 SSH_PASS 环境变量，无法 SSH 部署阿里云。')
    process.exit(1)
  }

  run('npm run build -w @jade-account/shared', { timeout: 300000 })
  run('npm run build -w @jade-account/server', { timeout: 300000 })
  const gitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim()
  run('npm run build -w @jade-account/web', {
    env: { ...process.env, VITE_APP_BASE: '/account/', APP_VERSION: gitHash },
    timeout: 300000,
  })
  run('npm run build -w @jade-account/worker', { timeout: 300000 })

  run(`python "${DEPLOY_PY}"`, {
    env: { ...process.env, DEPLOY_APP_VERSION: gitHash },
    timeout: 900000,
  })

  await restartWorker()
  await sleep(5000)

  const remoteUrl = RECOMMENDED_URL.replace(/\/$/, '')
  const versionCheck1 = await verifyDeployVersion(gitHash, remoteUrl)
  if (!versionCheck1.ok) {
    console.error('\nFAIL — 部署后版本不一致（上传后立即检查）')
    console.error('本地 HEAD:', versionCheck1.localHead)
    console.error('远程 APP_VERSION:', versionCheck1.remote.metaVersion ?? '(missing)')
    console.error('远程 health version:', versionCheck1.remote.healthVersion ?? '(missing)')
    for (const e of versionCheck1.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`\nOK — 远程版本与 HEAD 一致: ${gitHash}\n`)
  const workerReport = await verifyWorkerRemote(remoteUrl)

  run(`node scripts/remote-acceptance.mjs`, {
    env: { ...process.env, ACCEPTANCE_SERVER: remoteUrl, ACCEPTANCE_MODE: 'full' },
    timeout: TIMEOUTS.remoteAcceptance + 30000,
  })

  const testEnv = { ...process.env, ACCEPTANCE_SERVER: remoteUrl }
  run('node scripts/test-white-screen.mjs', { env: testEnv, timeout: TIMEOUTS.whiteScreen + 180000 })
  run('node scripts/test-responsive.mjs', { env: testEnv, timeout: TIMEOUTS.responsive + 180000 })
  run('node scripts/test-login.mjs', { env: testEnv, timeout: TIMEOUTS.login + 30000 })
  run('node scripts/test-subpath-refresh.mjs', { env: testEnv, timeout: TIMEOUTS.subpath + 30000 })
  run('node scripts/test-worker-online.mjs', { env: testEnv, timeout: TIMEOUTS.workerOnline + 60000 })

  const versionCheck2 = await verifyDeployVersion(gitHash, remoteUrl)
  if (!versionCheck2.ok) {
    console.error('\nFAIL — 部署末尾版本一致性检查未通过')
    console.error('本地 HEAD:', versionCheck2.localHead)
    console.error('远程 APP_VERSION:', versionCheck2.remote.metaVersion ?? '(missing)')
    console.error('远程 health version:', versionCheck2.remote.healthVersion ?? '(missing)')
    for (const e of versionCheck2.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`\nOK — 部署完成，版本一致: ${gitHash}\n`)

  console.log('\n=== 部署 Worker 报告 ===')
  console.log(JSON.stringify(workerReport, null, 2))
  if (!workerReport.online) {
    console.error('警告: 部署后 Worker 仍离线，请在公司电脑运行「一键修复本地Worker连接.bat」')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
