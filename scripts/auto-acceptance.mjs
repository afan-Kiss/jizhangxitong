/**
 * 和田玉镯子记账系统 - 全自动联调验收
 * 用法: node scripts/auto-acceptance.mjs [basic|full]
 * 退出码: 0=全部通过; 1=核心业务失败; 2=仅外部依赖失败（Worker/7789/Excel上传）
 */
import fs from 'fs/promises'
import path from 'path'
import { execSync } from 'child_process'
import {
  ROOT, SERVER, SCANNER, login, fetchJson, authHeaders,
  ensureServerRunning, ensureWorkerRunning, ensureScannerRunning,
  writeMarkdownReport, sleep,
  getWorkerCheckBaseUrl, fetchWorkerStatus,
  uploadImageWithRetry, ACCEPTANCE_TIER, recordAcceptanceResult,
  resetAcceptanceFailures, getAcceptanceFailures, isLocalServer,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const MODE = process.argv[2] === 'full' || process.env.ACCEPTANCE_MODE === 'full' ? 'full' : 'basic'

const SECTION_TIER = {
  startup: ACCEPTANCE_TIER.CORE,
  api: ACCEPTANCE_TIER.CORE,
  worker: ACCEPTANCE_TIER.EXTERNAL,
  scanner: ACCEPTANCE_TIER.EXTERNAL,
  braceletSync: ACCEPTANCE_TIER.EXTERNAL,
  expense: ACCEPTANCE_TIER.CORE,
  image: ACCEPTANCE_TIER.EXTERNAL,
  sale: ACCEPTANCE_TIER.EXTERNAL,
  full: ACCEPTANCE_TIER.CORE,
  remaining: ACCEPTANCE_TIER.CORE,
}

const report = {
  sections: [
    ['启动检查', 'startup'],
    ['接口检查', 'api'],
    ['Worker（外部依赖）', 'worker'],
    ['扫码枪（外部依赖）', 'scanner'],
    ['镯子同步（外部依赖）', 'braceletSync'],
    ['支出', 'expense'],
    ['图片（外部依赖）', 'image'],
    ['销售（已下线）', 'sale'],
    ['Full 模式扩展', 'full'],
    ['待处理', 'remaining'],
  ],
  data: Object.fromEntries(
    ['startup', 'api', 'worker', 'scanner', 'braceletSync', 'expense', 'image', 'sale', 'full', 'remaining']
      .map((k) => [k, []]),
  ),
}

function log(section, msg, ok = true, tierOverride) {
  const tier = tierOverride ?? SECTION_TIER[section] ?? ACCEPTANCE_TIER.CORE
  const line = `${ok ? '✓' : '✗'} ${msg}`
  report.data[section].push(line)
  console.log(`[${section}] ${line}`)
  if (!ok) recordAcceptanceResult(tier, `[${section}] ${msg}`)
}

async function resolveWorkerOnline(token) {
  const workerBase = await getWorkerCheckBaseUrl()
  const workerToken = workerBase === SERVER.replace(/\/$/, '') ? token : await login(workerBase)
  const st = await fetchWorkerStatus(workerToken, workerBase)
  return {
    online: st.json.data?.online === true,
    base: workerBase,
    data: st.json.data || {},
  }
}

async function uploadImage(token, fileType, name) {
  const worker = await resolveWorkerOnline(token)
  const up = await uploadImageWithRetry(token, fileType, name, {
    maxRetries: 2,
    timeoutMs: 45000,
  })
  if (up.ok) return up.json

  const detail = [
    `接口=${up.uploadUrl}`,
    `大小=${up.fileSize}B`,
    `Worker.online=${worker.online}`,
    `Worker.base=${worker.base}`,
    `错误=${up.error?.message || 'unknown'}`,
    `重试=${up.attempts}次`,
  ].join('; ')
  return { success: false, message: detail, _uploadMeta: { worker, up } }
}

async function testFullExtras(token) {
  const noPerm = await fetchJson(`${SERVER}/api/permissions/users`)
  log('full', `无 token 访问权限 API → ${noPerm.res.status}`, noPerm.res.status === 401)

  const badFile = await fetch(`${SERVER}/api/files/999999/view`, { headers: { Authorization: `Bearer ${token}` } })
  log('full', `不存在图片 → ${badFile.status}`, badFile.status >= 400)

  const worker = await resolveWorkerOnline(token)
  if (worker.online) {
    log('full', `Worker 在线: true (${worker.base})`, true, ACCEPTANCE_TIER.EXTERNAL)
  } else if (isLocalServer(SERVER) && worker.base !== SERVER.replace(/\/$/, '')) {
    log('full', `Worker 离线（远程 ${worker.base}）：${worker.data.reason || worker.data.message || 'offline'}`, false, ACCEPTANCE_TIER.EXTERNAL)
  } else {
    log('full', `Worker 在线: false (${worker.base})`, false, ACCEPTANCE_TIER.EXTERNAL)
  }

  try {
    execSync('npm run worker:status', { cwd: ROOT, encoding: 'utf-8', timeout: 15000 })
    log('full', 'worker:status 命令可执行', true, ACCEPTANCE_TIER.EXTERNAL)
  } catch (e) {
    log('full', `worker:status: ${e.message}`, false, ACCEPTANCE_TIER.EXTERNAL)
  }
}

async function checkScanner() {
  try {
    const health = await fetchJson(`${SCANNER}/api/health`, { signal: AbortSignal.timeout(10000) })
    log('scanner', `GET /api/health → ${health.res.status}`, health.res.ok)
    const search = await fetchJson(`${SCANNER}/api/bracelets/search?q=F`, { signal: AbortSignal.timeout(15000) })
    log('scanner', `GET search → ${search.res.status}`, search.res.ok)
    let testCode = search.json?.data?.[0]?.braceletCode || search.json?.data?.[0]?.certNo || null
    if (testCode) log('scanner', `测试编号: ${testCode}`)
    return { online: health.res.ok, testCode }
  } catch (err) {
    log('scanner', `不可达: ${err.message}`, false)
    return { online: false, testCode: null }
  }
}

async function main() {
  resetAcceptanceFailures()
  installScriptTimeout(`acceptance:${MODE}`, MODE === 'full' ? TIMEOUTS.acceptanceFull : TIMEOUTS.acceptanceBasic)
  console.log(`\n========== 验收 (${MODE}) ==========\n`)
  if (isLocalServer(SERVER)) {
    const workerBase = await getWorkerCheckBaseUrl()
    if (workerBase !== SERVER.replace(/\/$/, '')) {
      console.log(`[info] 本地 API=${SERVER}，Worker 状态将查远程 ${workerBase}（与 test:worker-online 一致）\n`)
    }
  }

  await ensureServerRunning((s, m, ok) => log('startup', m, ok !== false))
  log('startup', '扫码枪模块已下线，跳过 7789', true, ACCEPTANCE_TIER.EXTERNAL)
  const token = await ensureWorkerRunning((s, m, ok) => {
    const tier = /Worker/.test(m) ? ACCEPTANCE_TIER.EXTERNAL : ACCEPTANCE_TIER.CORE
    log('startup', m, ok !== false, tier)
  })

  const h = await fetchJson(`${SERVER}/api/health`)
  log('api', `health → ${h.json.message || h.text}`, h.res.ok)
  if (h.json.scanWorkbenchEnabled !== undefined) {
    log('api', `scanWorkbenchEnabled=${h.json.scanWorkbenchEnabled}`, true)
  }
  if (h.json.version) {
    log('api', `version=${h.json.version}`, true)
  }

  const me = await fetchJson(`${SERVER}/api/auth/me`, { headers: authHeaders(token) })
  log('api', `权限数: ${me.json.data?.permissions?.length || 0}`, me.res.ok)

  const workerInfo = await resolveWorkerOnline(token)
  log('worker', `online=${workerInfo.online} (${workerInfo.base})`, workerInfo.online)
  const workerOnline = workerInfo.online

  log('braceletSync', '跳过（扫码模块已下线）', true, ACCEPTANCE_TIER.EXTERNAL)

  const expCreate = await fetchJson(`${SERVER}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 1.23,
      expenseType: '办公杂费',
      businessType: 'normal',
      paySource: '项目专用资金',
      occurredAt: new Date().toISOString().slice(0, 10),
      remark: 'test_auto_check 自动联调测试，可删除',
      needsAttachment: true,
    }),
  })
  const expenseId = expCreate.res.ok ? expCreate.json.data?.id : null
  log('expense', `创建 id=${expenseId}`, !!expenseId, ACCEPTANCE_TIER.CORE)
  if (!expenseId) {
    log('expense', `创建失败: ${expCreate.text?.slice(0, 120) || expCreate.res.status}`, false, ACCEPTANCE_TIER.CORE)
  }

  let fileId = null
  if (workerOnline && expenseId) {
    const up = await uploadImage(token, 'payment_screenshot', 'acceptance-test.png')
    if (up.success) {
      fileId = up.data.id
      log('image', `上传 fileId=${fileId}`, true)
      await fetchJson(`${SERVER}/api/expenses/${expenseId}/attachments`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ items: [{ fileId, fileType: 'payment_screenshot' }] }),
      })
      const viewRes = await fetch(`${SERVER}/api/files/${fileId}/view`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      })
      log('image', `查看 → ${viewRes.status}`, viewRes.ok)
    } else {
      log('image', `上传失败: ${up.message}`, false)
    }
  }

  let saleId = null
  const saleCreate = await fetchJson(`${SERVER}/api/sales`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      platform: '其他',
      customerName: '自动验收',
      saleAmount: 9999,
      soldAt: new Date().toISOString().slice(0, 10),
      customerRemark: 'test_auto_check',
    }),
  })
  if (saleCreate.res.status === 410) {
    log('sale', '销售模块已下线（410）', true, ACCEPTANCE_TIER.EXTERNAL)
  } else if (saleCreate.res.ok) {
    saleId = saleCreate.json.data?.id
    log('sale', `销售 id=${saleId}`, !!saleId, ACCEPTANCE_TIER.EXTERNAL)
  } else {
    log('sale', `销售接口 ${saleCreate.res.status}`, false, ACCEPTANCE_TIER.EXTERNAL)
  }

  if (MODE === 'full') {
    await testFullExtras(token)
  }

  report.data.remaining.push(`测试数据 expenseId=${expenseId} saleId=${saleId} fileId=${fileId} — 运行 npm run acceptance:cleanup 清理`)

  const failures = getAcceptanceFailures()
  report.data.remaining.push(`--- 分级汇总: 核心失败 ${failures.core.length} 项; 外部依赖失败 ${failures.external.length} 项 ---`)
  if (failures.core.length) failures.core.forEach((m) => report.data.remaining.push(`[核心] ${m}`))
  if (failures.external.length) failures.external.forEach((m) => report.data.remaining.push(`[外部] ${m}`))

  const reportPath = await writeMarkdownReport(report, MODE)
  console.log(`\n报告: ${reportPath}\n`)

  console.log('=== 验收分级 ===')
  console.log(`核心业务: ${failures.core.length ? `✗ ${failures.core.length} 项失败` : '✓ 通过'}`)
  console.log(`外部依赖: ${failures.external.length ? `⚠ ${failures.external.length} 项未通过` : '✓ 通过'}`)
  if (failures.external.length) {
    failures.external.forEach((m) => console.log(`  [外部] ${m}`))
  }

  if (failures.core.length) process.exit(1)
  if (failures.external.length) process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
