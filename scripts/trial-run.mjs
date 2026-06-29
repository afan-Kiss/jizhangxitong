/**
 * 真实链路试用自动试跑
 */
import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  SERVER, SCANNER, login, fetchJson, authHeaders, createTestPng,
  ensureServerRunning, ensureWorkerRunning, ensureScannerRunning,
  writeMarkdownReport,
} from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const report = {
  sections: [['试跑步骤', 'steps'], ['结果', 'result']],
  data: { steps: [], result: [] },
}

function log(msg, ok = true) {
  report.data.steps.push(`${ok ? '✓' : '✗'} ${msg}`)
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
}

async function setTrialMode(token, enabled) {
  await fetchJson(`${SERVER}/api/settings/trial_mode_enabled`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ value: enabled ? 'true' : 'false' }),
  })
}

async function main() {
  console.log('\n========== 真实链路试用试跑 ==========\n')

  await ensureServerRunning((s, m, ok) => log(m, ok !== false))
  await ensureScannerRunning((s, m, ok) => log(m, ok !== false))
  const token = await ensureWorkerRunning((s, m, ok) => log(m, ok !== false))

  const search = await fetchJson(`${SCANNER}/api/bracelets/search?q=F`)
  const testCode = search.json?.data?.[0]?.braceletCode
  if (!testCode) {
    log('扫码枪无镯子数据', false)
    process.exit(1)
  }
  log(`真实镯子编号: ${testCode}`)

  await setTrialMode(token, true)
  log('已开启 trial_mode_enabled')

  const sync = await fetchJson(`${SERVER}/api/bracelets/${encodeURIComponent(testCode)}`, {
    headers: authHeaders(token),
  })
  const braceletId = sync.json.data?.id
  log(`同步镯子 id=${braceletId}`, !!braceletId)

  const summary0 = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const amount0 = summary0.json.data?.totalAmount || 0
  const pending0 = summary0.json.data?.pendingAmount || 0

  const exp = await fetchJson(`${SERVER}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 88.88,
      expenseType: '日常物料',
      paySource: '员工垫付',
      reimbursementPerson: '试用试跑',
      reimbursementStatus: 'pending',
      braceletCode: testCode,
      occurredAt: new Date().toISOString().slice(0, 10),
      expenseSummary: 'trial_run 真实链路试跑',
      remark: 'trial_run',
      needsAttachment: true,
    }),
  })
  const expenseId = exp.json.data?.id
  log(`试用支出 id=${expenseId} isTrialRun=${exp.json.data?.isTrialRun}`, exp.res.ok && exp.json.data?.isTrialRun)

  let fileId = null
  const buf = await createTestPng()
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/png' }), 'trial-run.png')
  form.append('fileType', 'payment_screenshot')
  const up = await fetch(`${SERVER}/api/files/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  })
  const upJson = await up.json()
  if (up.ok) {
    fileId = upJson.data.id
    await fetchJson(`${SERVER}/api/expenses/${expenseId}/attachments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ items: [{ fileId, fileType: 'payment_screenshot' }] }),
    })
    log(`上传图片 fileId=${fileId}`, true)
  } else {
    log(`上传失败: ${upJson.message}`, false)
  }

  const sale = await fetchJson(`${SERVER}/api/sales`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      platform: '其他',
      customerName: '试用试跑',
      braceletCode: testCode,
      braceletId,
      saleAmount: 8888,
      soldAt: new Date().toISOString().slice(0, 10),
      customerRemark: 'trial_run',
    }),
  })
  log(`试用销售 id=${sale.json.data?.id} isTrialRun=${sale.json.data?.isTrialRun}`, sale.res.ok && sale.json.data?.isTrialRun)

  const summary1 = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const amount1 = summary1.json.data?.totalAmount || 0
  log(`试跑后今日支出 ${amount0} → ${amount1}`, amount1 >= amount0 + 88.87)

  const today = new Date().toISOString().slice(0, 10)
  const ex = await fetchJson(`${SERVER}/api/expenses/export/reimbursement-excel`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ startDate: today, endDate: today, reimbursementStatus: 'all' }),
  })
  let excelOk = false
  if (ex.res.ok) {
    const dl = await fetch(`${SERVER}${ex.json.data.downloadUrl}`)
    const xlsxBuf = Buffer.from(await dl.arrayBuffer())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(xlsxBuf)
    const sheet = wb.getWorksheet('日常物料报销明细')
    const imgs = sheet?.getImages?.()?.length ?? wb.model?.media?.length ?? 0
    excelOk = imgs >= 1
    log(`试用 Excel 导出 OK，嵌入图 ${imgs} 张`, excelOk)
  } else {
    log(`导出失败: ${ex.json.message}`, false)
  }

  const logs = await fetchJson(`${SERVER}/api/operation-logs?pageSize=10`, { headers: authHeaders(token) })
  const hasTrialLog = logs.json.data?.items?.some((l) =>
    ['create_expense', 'create_sale', 'export_reimbursement_excel'].includes(l.action),
  )
  log(`操作日志有试跑记录: ${hasTrialLog}`, hasTrialLog)

  const cleanup = await fetchJson(`${SERVER}/api/trial/cleanup`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  log(`trial:cleanup 支出作废 ${cleanup.json.data?.expensesVoided?.length} 笔`, cleanup.res.ok)

  const summary2 = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const amount2 = summary2.json.data?.totalAmount || 0
  const pending2 = summary2.json.data?.pendingAmount || 0
  const restored = Math.abs(amount2 - amount0) < 0.02 && Math.abs(pending2 - pending0) < 0.02
  log(`清理后今日支出恢复 ${amount1} → ${amount2} (基线${amount0})`, restored)

  await setTrialMode(token, true)
  log('试用模式保持开启，供明天真实试用')

  report.data.result.push(restored ? '试跑成功，正式数据未污染' : '清理后金额与基线有差异，请检查')
  report.data.result.push('trial_mode_enabled 仍为 true')

  const p = await writeMarkdownReport(report, 'trial-run')
  console.log(`\n报告: ${p}\n`)

  const failed = report.data.steps.filter((l) => l.startsWith('✗'))
  if (failed.length) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
