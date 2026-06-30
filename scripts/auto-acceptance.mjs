/**
 * 和田玉镯子记账系统 - 全自动联调验收
 * 用法: node scripts/auto-acceptance.mjs [basic|full]
 * 退出码: 0=全部通过; 1=核心业务失败; 2=仅外部依赖失败（Worker/7789/Excel上传）
 */
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
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
  sale: ACCEPTANCE_TIER.CORE,
  excel: ACCEPTANCE_TIER.EXTERNAL,
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
    ['销售', 'sale'],
    ['Excel（外部依赖）', 'excel'],
    ['Full 模式扩展', 'full'],
    ['待处理', 'remaining'],
  ],
  data: Object.fromEntries(
    ['startup', 'api', 'worker', 'scanner', 'braceletSync', 'expense', 'image', 'sale', 'excel', 'full', 'remaining']
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

async function verifyExcelBuffer(xlsxBuf, opts = {}) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(xlsxBuf)
  const sheet = wb.getWorksheet('日常物料报销明细')
  const headers = sheet ? [1, 2, 3, 4, 5, 6, 7, 8].map((c) => sheet.getRow(1).getCell(c).value) : []
  const headerOk = headers.join(',') === '序号,日期,报销人,类型,摘要,报账金额,付款截图,备注'

  let mainAmount = 0
  let hasTargetAmount = false
  let attachmentRowsEmptyAmount = 0
  let hasFormula = false
  let embeddedImages = 0

  sheet?.eachRow((row, rn) => {
    if (rn === 1) return
    const amount = row.getCell(6).value
    const seq = row.getCell(1).value
    if (amount !== null && amount !== undefined && amount !== '') {
      if (typeof amount === 'object' && amount.formula) {
        hasFormula = true
        return
      }
      mainAmount += Number(amount) || 0
      if (opts.targetAmount && Math.abs(Number(amount) - opts.targetAmount) < 0.01) {
        hasTargetAmount = true
      }
    } else if (seq === '' || seq === null) {
      attachmentRowsEmptyAmount++
    }
  })

  try {
    embeddedImages = sheet?.getImages?.()?.length ?? wb.model?.media?.length ?? 0
  } catch {
    embeddedImages = wb.model?.media?.length ?? 0
  }

  const zipHasMedia = (wb.model?.media?.length ?? 0) >= (opts.minImages || 1) || embeddedImages >= (opts.minImages || 1)

  return {
    headerOk,
    mainAmount,
    hasTargetAmount,
    attachmentRowsEmptyAmount,
    hasFormula,
    embeddedImages,
    zipHasMedia,
    size: xlsxBuf.length,
  }
}

async function testMultiImageExcel(token, testCode, braceletId) {
  const expenseBody = {
    amount: 12.34,
    expenseType: '客户补偿',
    paySource: '员工垫付',
    reimbursementPerson: '自动多图验收',
    reimbursementStatus: 'pending',
    braceletCode: braceletId ? testCode : undefined,
    occurredAt: new Date().toISOString().slice(0, 10),
    expenseSummary: 'test_auto_check_multi_images',
    remark: 'test_auto_check_multi_images 多图验收',
    needsAttachment: true,
  }

  const expCreate = await fetchJson(`${SERVER}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(expenseBody),
  })
  if (!expCreate.res.ok) {
    log('full', `多图支出创建失败: ${expCreate.json.message}`, false)
    return
  }
  const expenseId = expCreate.json.data.id
  log('full', `多图支出 id=${expenseId} amount=12.34`)

  const types = ['payment_screenshot', 'chat_screenshot', 'after_sale_problem']
  const fileIds = []
  for (const ft of types) {
    const up = await uploadImage(token, ft, `${ft}.png`)
    if (up.success) {
      fileIds.push(up.data.id)
    } else {
      log('full', `上传 ${ft} 失败: ${up.message}`, false, ACCEPTANCE_TIER.EXTERNAL)
    }
  }

  if (fileIds.length) {
    await fetchJson(`${SERVER}/api/expenses/${expenseId}/attachments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ items: fileIds.map((id, i) => ({ fileId: id, fileType: types[i] })) }),
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.replace(/-\d{2}$/, '-01')
  const exportRes = await fetchJson(`${SERVER}/api/expenses/export/reimbursement-excel`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ startDate: monthStart, endDate: today, reimbursementStatus: 'all' }),
    signal: AbortSignal.timeout(120000),
  })

  if (!exportRes.res.ok) {
    log('full', `多图导出失败: ${exportRes.json.message}`, false, ACCEPTANCE_TIER.EXTERNAL)
    return
  }

  const dl = await fetch(`${SERVER}${exportRes.json.data.downloadUrl}`, { signal: AbortSignal.timeout(120000) })
  const xlsxBuf = Buffer.from(await dl.arrayBuffer())
  const v = await verifyExcelBuffer(xlsxBuf, { minImages: 3, targetAmount: 12.34 })

  log('full', `主行含12.34: ${v.hasTargetAmount}`, v.hasTargetAmount)
  log('full', `附图行(金额为空): ${v.attachmentRowsEmptyAmount}`, v.attachmentRowsEmptyAmount >= 2, ACCEPTANCE_TIER.EXTERNAL)
  log('full', `合计公式: ${v.hasFormula}`, v.hasFormula)
  log('full', `嵌入图片数: ${v.embeddedImages}`, v.embeddedImages >= 3, ACCEPTANCE_TIER.EXTERNAL)
  log('full', `xlsx 内含 media: ${v.zipHasMedia}`, v.zipHasMedia, ACCEPTANCE_TIER.EXTERNAL)

  await fetchJson(`${SERVER}/api/maintenance/cleanup-test-data`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  log('full', '多图测试数据已清理')
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
  await ensureScannerRunning((s, m, ok) => log('startup', m, ok !== false, ACCEPTANCE_TIER.EXTERNAL))
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

  const scanner = await checkScanner()
  const workerInfo = await resolveWorkerOnline(token)
  log('worker', `online=${workerInfo.online} (${workerInfo.base})`, workerInfo.online)

  let testCode = scanner.testCode || 'F0007584'
  let braceletId = null
  const workerOnline = workerInfo.online

  if (workerOnline && scanner.online) {
    const sync1 = await fetchJson(`${SERVER}/api/bracelets/${encodeURIComponent(testCode)}`, { headers: authHeaders(token) })
    braceletId = sync1.json.data?.id
    log('braceletSync', `同步 ${testCode} id=${braceletId}`, sync1.res.ok && !!braceletId)
  } else {
    log('braceletSync', `跳过（Worker=${workerOnline} 扫码枪=${scanner.online}）`, false)
  }

  const expCreate = await fetchJson(`${SERVER}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 1.23,
      expenseType: '日常物料',
      paySource: '员工垫付',
      reimbursementPerson: '自动验收',
      reimbursementStatus: 'pending',
      braceletCode: braceletId ? testCode : undefined,
      occurredAt: new Date().toISOString().slice(0, 10),
      expenseSummary: 'test_auto_check 自动联调测试',
      remark: 'test_auto_check 自动联调测试，可删除',
      needsAttachment: true,
    }),
  })
  const expenseId = expCreate.res.ok ? expCreate.json.data?.id : null
  log('expense', `创建 id=${expenseId}`, !!expenseId)

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
  if (braceletId && workerOnline) {
    const saleCreate = await fetchJson(`${SERVER}/api/sales`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        platform: '其他',
        customerName: '自动验收',
        braceletCode: testCode,
        braceletId,
        saleAmount: 9999,
        soldAt: new Date().toISOString().slice(0, 10),
        customerRemark: 'test_auto_check',
      }),
    })
    saleId = saleCreate.res.ok ? saleCreate.json.data?.id : null
    if (!saleId && saleCreate.res.status === 409) {
      log('sale', '重复登记已拦截（409）', true)
    } else {
      log('sale', `销售 id=${saleId}`, !!saleId)
    }
  }

  if (workerOnline && expenseId) {
    const today = new Date().toISOString().slice(0, 10)
    const exportRes = await fetchJson(`${SERVER}/api/expenses/export/reimbursement-excel`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        startDate: today.replace(/-\d{2}$/, '-01'),
        endDate: today,
        reimbursementStatus: 'all',
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (exportRes.res.ok) {
      const dl = await fetch(`${SERVER}${exportRes.json.data.downloadUrl}`, { signal: AbortSignal.timeout(120000) })
      const buf = Buffer.from(await dl.arrayBuffer())
      const v = await verifyExcelBuffer(buf)
      log('excel', `表头: ${v.headerOk}`, v.headerOk)
      log('excel', `合计公式: ${v.hasFormula}`, v.hasFormula)
      log('excel', `嵌入图片: ${v.embeddedImages}`, v.embeddedImages >= 1)
    } else {
      log('excel', exportRes.json.message, false)
    }
  }

  if (MODE === 'full') {
    if (workerOnline) {
      await testMultiImageExcel(token, testCode, braceletId)
    } else {
      log('full', '多图 Excel 跳过（Worker 离线）', false, ACCEPTANCE_TIER.EXTERNAL)
    }
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
