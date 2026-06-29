/**
 * 和田玉镯子记账系统 - 全自动联调验收
 * 用法: node scripts/auto-acceptance.mjs [basic|full]
 */
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { spawn, execSync } from 'child_process'
import {
  ROOT, SERVER, SCANNER, login, fetchJson, authHeaders, createTestPng,
  ensureServerRunning, ensureWorkerRunning, ensureScannerRunning,
  writeMarkdownReport, sleep,
} from './lib/services.mjs'

const MODE = process.argv[2] === 'full' || process.env.ACCEPTANCE_MODE === 'full' ? 'full' : 'basic'

const report = {
  sections: [
    ['启动检查', 'startup'],
    ['接口检查', 'api'],
    ['Worker', 'worker'],
    ['扫码枪', 'scanner'],
    ['镯子同步', 'braceletSync'],
    ['支出', 'expense'],
    ['图片', 'image'],
    ['销售', 'sale'],
    ['Excel', 'excel'],
    ['Full 模式扩展', 'full'],
    ['待处理', 'remaining'],
  ],
  data: Object.fromEntries(
    ['startup', 'api', 'worker', 'scanner', 'braceletSync', 'expense', 'image', 'sale', 'excel', 'full', 'remaining']
      .map((k) => [k, []]),
  ),
}

function log(section, msg, ok = true) {
  const line = `${ok ? '✓' : '✗'} ${msg}`
  report.data[section].push(line)
  console.log(`[${section}] ${line}`)
}

async function uploadImage(token, fileType, name) {
  const buf = await createTestPng()
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/png' }), name)
  form.append('fileType', fileType)
  const res = await fetch(`${SERVER}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  return res.json()
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
      log('full', `上传 ${ft} 失败: ${up.message}`, false)
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
  })

  if (!exportRes.res.ok) {
    log('full', `多图导出失败: ${exportRes.json.message}`, false)
    return
  }

  const dl = await fetch(`${SERVER}${exportRes.json.data.downloadUrl}`)
  const xlsxBuf = Buffer.from(await dl.arrayBuffer())
  const v = await verifyExcelBuffer(xlsxBuf, { minImages: 3, targetAmount: 12.34 })

  log('full', `主行含12.34: ${v.hasTargetAmount}`, v.hasTargetAmount)
  log('full', `附图行(金额为空): ${v.attachmentRowsEmptyAmount}`, v.attachmentRowsEmptyAmount >= 2)
  log('full', `合计公式: ${v.hasFormula}`, v.hasFormula)
  log('full', `嵌入图片数: ${v.embeddedImages}`, v.embeddedImages >= 3)
  log('full', `xlsx 内含 media: ${v.zipHasMedia}`, v.zipHasMedia)

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

  const workerStatus = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
  log('full', `Worker 在线: ${workerStatus.json.data?.online}`, workerStatus.json.data?.online)

  try {
    execSync('npm run worker:status', { cwd: ROOT, encoding: 'utf-8', timeout: 15000 })
    log('full', 'worker:status 命令可执行')
  } catch (e) {
    log('full', `worker:status: ${e.message}`, false)
  }
}

async function checkScanner() {
  try {
    const health = await fetchJson(`${SCANNER}/api/health`)
    log('scanner', `GET /api/health → ${health.res.status}`, health.res.ok)
    const search = await fetchJson(`${SCANNER}/api/bracelets/search?q=F`)
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
  console.log(`\n========== 验收 (${MODE}) ==========\n`)

  await ensureServerRunning((s, m, ok) => log('startup', m, ok !== false))
  await ensureScannerRunning((s, m, ok) => log('startup', m, ok !== false))
  const token = await ensureWorkerRunning((s, m, ok) => log('startup', m, ok !== false))

  const h = await fetchJson(`${SERVER}/api/health`)
  log('api', `health → ${h.json.message || h.text}`, h.res.ok)

  const me = await fetchJson(`${SERVER}/api/auth/me`, { headers: authHeaders(token) })
  log('api', `权限数: ${me.json.data?.permissions?.length || 0}`, me.res.ok)

  const scanner = await checkScanner()
  let workerBefore = await fetchJson(`${SERVER}/api/local-worker/status`, { headers: authHeaders(token) })
  log('worker', `online=${workerBefore.json.data?.online}`, workerBefore.json.data?.online)

  let testCode = scanner.testCode || 'F0007584'
  let braceletId = null
  const workerOnline = workerBefore.json.data?.online

  if (workerOnline && scanner.online) {
    const sync1 = await fetchJson(`${SERVER}/api/bracelets/${encodeURIComponent(testCode)}`, { headers: authHeaders(token) })
    braceletId = sync1.json.data?.id
    log('braceletSync', `同步 ${testCode} id=${braceletId}`, sync1.res.ok && !!braceletId)
  } else {
    log('braceletSync', '跳过', false)
  }

  const summaryBefore = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const pendingBefore = summaryBefore.json.data?.pendingAmount || 0

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
      const viewRes = await fetch(`${SERVER}/api/files/${fileId}/view`, { headers: { Authorization: `Bearer ${token}` } })
      log('image', `查看 → ${viewRes.status}`, viewRes.ok)
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
    })
    if (exportRes.res.ok) {
      const dl = await fetch(`${SERVER}${exportRes.json.data.downloadUrl}`)
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
    }
    await testFullExtras(token)
  }

  report.data.remaining.push(`测试数据 expenseId=${expenseId} saleId=${saleId} fileId=${fileId} — 运行 npm run acceptance:cleanup 清理`)

  const reportPath = await writeMarkdownReport(report, MODE)
  console.log(`\n报告: ${reportPath}\n`)

  const failed = Object.values(report.data).flat().filter((l) => l.startsWith('✗'))
  if (failed.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
