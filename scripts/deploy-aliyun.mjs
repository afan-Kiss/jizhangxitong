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

const deployReport = {
  core: [],
  external: [],
}

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout: opts.timeout ?? 600000, ...opts })
}

/** 运行子命令；exit 2 = 仅外部依赖失败，不阻断部署 */
function runTiered(label, cmd, tier, opts = {}) {
  console.log(`\n>>> ${cmd}`)
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout: opts.timeout ?? 600000, ...opts })
    deployReport[tier].push({ name: label, ok: true })
    return { ok: true }
  } catch (e) {
    const code = e.status ?? 1
    if (tier === 'external' && code === 2) {
      console.warn(`\nWARN — ${label}: 外部依赖未全部通过（exit 2），不阻断部署`)
      deployReport.external.push({ name: label, ok: false, warnOnly: true, exitCode: 2 })
      return { ok: false, warnOnly: true }
    }
    deployReport[tier].push({ name: label, ok: false, exitCode: code })
    throw e
  }
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

    deployReport.external.push({
      name: 'Worker online（远程 API）',
      ok: d.online === true,
      detail: d.message || d.reason,
    })

    return d
  } catch (e) {
    console.error('Worker 验收失败:', e.message)
    deployReport.external.push({ name: 'Worker online（远程 API）', ok: false, detail: e.message })
    return { online: false, reason: 'WORKER_NOT_CONNECTED' }
  } finally {
    if (prev !== undefined) process.env.ACCEPTANCE_SERVER = prev
    else delete process.env.ACCEPTANCE_SERVER
  }
}

async function check7789() {
  const scanner = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
  try {
    const h = await fetch(`${scanner}/api/health`, { signal: AbortSignal.timeout(10000) })
    deployReport.external.push({ name: '7789 health', ok: h.ok, detail: scanner })
    return h.ok
  } catch (e) {
    deployReport.external.push({ name: '7789 health', ok: false, detail: e.message })
    return false
  }
}

function printDeploySummary(gitHash, workerReport) {
  console.log('\n========================================')
  console.log('部署验收分级报告')
  console.log('========================================')
  console.log('\n【核心业务验收】')
  console.log('  /account/、/api/health、APP_VERSION、扫码工作台、记账/销售利润口径')
  const coreFail = deployReport.core.filter((x) => !x.ok)
  if (coreFail.length) {
    coreFail.forEach((x) => console.log(`  ✗ ${x.name}`))
  } else {
    console.log('  ✓ 全部通过')
  }
  console.log('\n【外部依赖验收】')
  console.log('  Worker online、7789、Excel 图片上传')
  for (const x of deployReport.external) {
    const icon = x.ok ? '✓' : (x.warnOnly ? '⚠' : '✗')
    console.log(`  ${icon} ${x.name}${x.detail ? ` — ${x.detail}` : ''}`)
  }
  console.log(`\nAPP_VERSION: ${gitHash}`)
  console.log(`Worker online: ${workerReport.online}`)
  console.log('========================================\n')
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
  deployReport.core.push({ name: 'APP_VERSION 与 HEAD 一致（上传后）', ok: true })
  console.log(`\nOK — 远程版本与 HEAD 一致: ${gitHash}\n`)

  const workerReport = await verifyWorkerRemote(remoteUrl)
  await check7789()

  runTiered('remote-acceptance（含 Excel/Worker 上传）', `node scripts/remote-acceptance.mjs`, 'external', {
    env: { ...process.env, ACCEPTANCE_SERVER: remoteUrl, ACCEPTANCE_MODE: 'full' },
    timeout: TIMEOUTS.remoteAcceptance + 30000,
  })

  const testEnv = { ...process.env, ACCEPTANCE_SERVER: remoteUrl }
  const coreTests = [
    ['test:white-screen', `node scripts/test-white-screen.mjs`, TIMEOUTS.whiteScreen + 180000],
    ['test:responsive', `node scripts/test-responsive.mjs`, TIMEOUTS.responsive + 180000],
    ['test:login', `node scripts/test-login.mjs`, TIMEOUTS.login + 30000],
    ['test:subpath', `node scripts/test-subpath-refresh.mjs`, TIMEOUTS.subpath + 30000],
    ['test:customer-payments', `node scripts/test-customer-payments.mjs`, TIMEOUTS.acceptanceFull + 120000],
    ['test:accounting-flow', `node scripts/test-accounting-flow.mjs`, TIMEOUTS.acceptanceFull + 60000],
    ['test:effective-sales', `node scripts/test-effective-sales.mjs`, TIMEOUTS.acceptanceBasic + 30000],
    ['test:fund-expense', `node scripts/test-fund-expense.mjs`, TIMEOUTS.acceptanceBasic + 60000],
    ['test:reimbursement-offline', `node scripts/test-reimbursement-offline.mjs`, TIMEOUTS.acceptanceBasic + 120000],
  ]
  for (const [label, script, timeout] of coreTests) {
    try {
      run(script, { env: testEnv, timeout })
      deployReport.core.push({ name: label, ok: true })
    } catch (e) {
      deployReport.core.push({ name: label, ok: false })
      throw e
    }
  }

  runTiered('test:scan-workbench', `node scripts/test-scan-workbench.mjs`, 'external', {
    env: testEnv,
    timeout: TIMEOUTS.acceptanceFull + 60000,
  })

  try {
    run('node scripts/test-worker-online.mjs', { env: testEnv, timeout: TIMEOUTS.workerOnline + 60000 })
    deployReport.external.push({ name: 'test:worker-online', ok: true })
  } catch (e) {
    deployReport.external.push({ name: 'test:worker-online', ok: false, detail: e.message })
    console.warn('\nWARN — test:worker-online 未通过（外部依赖），不阻断部署')
  }

  const versionCheck2 = await verifyDeployVersion(gitHash, remoteUrl)
  if (!versionCheck2.ok) {
    console.error('\nFAIL — 部署末尾版本一致性检查未通过')
    console.error('本地 HEAD:', versionCheck2.localHead)
    console.error('远程 APP_VERSION:', versionCheck2.remote.metaVersion ?? '(missing)')
    console.error('远程 health version:', versionCheck2.remote.healthVersion ?? '(missing)')
    for (const e of versionCheck2.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  deployReport.core.push({ name: 'APP_VERSION 与 HEAD 一致（部署末）', ok: true })

  printDeploySummary(gitHash, workerReport)

  const extHardFail = deployReport.external.filter((x) => !x.ok && !x.warnOnly)
  if (extHardFail.length) {
    console.warn('提示: 部分外部依赖硬失败，但核心业务与版本已验收通过')
  }
  if (!workerReport.online) {
    console.error('警告: 部署后 Worker 仍离线，请在公司电脑运行「一键修复本地Worker连接.bat」')
  }

  console.log(`\nOK — 部署完成，版本一致: ${gitHash}\n`)
  console.log('\n=== 部署 Worker 报告 ===')
  console.log(JSON.stringify(workerReport, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
