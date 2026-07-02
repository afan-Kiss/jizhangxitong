#!/usr/bin/env node
/** 页面汇总 / BI 下钻 / Excel 导出金额一致性验收 */
import ExcelJS from 'exceljs'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, localDateString,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = SERVER.replace(/\/$/, '')
const TAG = `MONEY-EXP-${Date.now()}`
let failed = 0

function pass(name, detail = '') {
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  failed += 1
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

function sumAmounts(values) {
  return Math.round(values.reduce((s, n) => s + n, 0) * 100) / 100
}

installScriptTimeout('test:money-export-consistency', TIMEOUTS.acceptanceFull)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function parseXlsxAmountTotal(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  let total = 0
  let dataRows = 0
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const label = String(row.getCell(4).value || '')
    const amount = Number(row.getCell(5).value)
    if (label === '合计' && Number.isFinite(amount)) {
      total = amount
      return
    }
    if (Number.isFinite(amount) && amount > 0) dataRows += 1
  })
  return { total, dataRows }
}

async function main() {
  console.log('\n=== test:money-export-consistency ===\n')
  console.log(`BASE: ${BASE}`)
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = localDateString()
  const amounts = [0.1, 0.2, 0.3, 10.01]
  const createdIds = []

  for (const amount of amounts) {
    const res = await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        expenseType: '办公杂费',
        businessType: 'normal',
        paySource: '项目专用资金',
        occurredAt: today,
        remark: `${TAG}-${amount}`,
      }),
    })
    if (res.res.ok && res.json.data?.id) {
      createdIds.push(res.json.data.id)
    } else {
      fail(`创建测试支出 ${amount}`, res.text?.slice(0, 120))
    }
  }

  const legacy = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 1.11,
      expenseType: '办公杂费',
      paySource: '专属经费',
      occurredAt: today,
      remark: `${TAG}-legacy`,
    }),
  })
  if (legacy.res.ok && legacy.json.data?.paySource === '项目专用资金') {
    pass('专属经费入库映射为项目专用资金')
    createdIds.push(legacy.json.data.id)
  } else {
    fail('专属经费入库映射为项目专用资金', legacy.text?.slice(0, 120))
  }

  const expectedTotal = sumAmounts([...amounts, 1.11])

  const drill = await api(token, `/api/bi/drilldown?type=expenses&range=custom&startDate=${today}&endDate=${today}&page=1&pageSize=2&q=${TAG}`)
  const drillTotal = Number(drill.json.data?.summary?.totalAmount || 0)
  const drillCount = Number(drill.json.data?.summary?.count || 0)
  if (drill.res.ok && Math.abs(drillTotal - expectedTotal) < 0.001) {
    pass('BI drilldown 合计一致', String(drillTotal))
  } else {
    fail('BI drilldown 合计一致', `expected=${expectedTotal} actual=${drillTotal}`)
  }
  if (drillCount >= createdIds.length) pass('BI drilldown 统计全量而非仅当前页', `count=${drillCount}`)
  else fail('BI drilldown 统计全量而非仅当前页', `count=${drillCount}`)

  const exportRes = await api(token, '/api/expenses/export/excel', {
    method: 'POST',
    body: JSON.stringify({ startDate: today, endDate: today, remarkContains: TAG }),
  })
  if (!exportRes.res.ok) {
    fail('导出接口创建任务', exportRes.text?.slice(0, 120))
  } else {
    const downloadUrl = exportRes.json.data?.downloadUrl
    const exportTotal = Number(exportRes.json.data?.totalAmount || 0)
    const exportCount = Number(exportRes.json.data?.recordCount || 0)
    if (Math.abs(exportTotal - expectedTotal) < 0.001) pass('导出接口 totalAmount 一致', String(exportTotal))
    else fail('导出接口 totalAmount 一致', `expected=${expectedTotal} actual=${exportTotal}`)
    if (exportCount >= createdIds.length) pass('导出记录数覆盖筛选全量', `count=${exportCount}`)
    else fail('导出记录数覆盖筛选全量', `count=${exportCount}`)
    if (Math.abs(exportTotal - drillTotal) < 0.001) pass('导出合计与 BI 下钻一致')
    else fail('导出合计与 BI 下钻一致', `${exportTotal} vs ${drillTotal}`)

    const dl = await fetch(`${BASE}${downloadUrl}`)
    if (dl.ok) {
      const buf = Buffer.from(await dl.arrayBuffer())
      const parsed = await parseXlsxAmountTotal(buf)
      if (Math.abs(parsed.total - expectedTotal) < 0.02) pass('Excel 合计行金额一致', String(parsed.total))
      else fail('Excel 合计行金额一致', `parsed=${parsed.total}`)
      if (parsed.dataRows >= createdIds.length) pass('Excel 含全部数据行', `rows=${parsed.dataRows}`)
      else fail('Excel 含全部数据行', `rows=${parsed.dataRows}`)
    } else {
      fail('下载导出文件', String(dl.status))
    }
  }

  if (createdIds.length) {
    const voidRes = await api(token, `/api/expenses/${createdIds[0]}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason: `${TAG}-void` }),
    })
    if (voidRes.res.ok) pass('作废测试支出')
    else fail('作废测试支出', voidRes.text?.slice(0, 80))

    const afterDrill = await api(token, `/api/bi/drilldown?type=expenses&range=custom&startDate=${today}&endDate=${today}&q=${TAG}`)
    const afterTotal = Number(afterDrill.json.data?.summary?.totalAmount || 0)
    const afterExpected = sumAmounts([...amounts.slice(1), 1.11])
    if (Math.abs(afterTotal - afterExpected) < 0.001) {
      pass('作废后默认下钻排除作废记录', String(afterTotal))
    } else {
      fail('作废后默认下钻排除作废记录', `expected=${afterExpected} actual=${afterTotal}`)
    }
  }

  for (const id of createdIds.slice(1)) {
    await api(token, `/api/expenses/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason: `${TAG}-cleanup` }),
    })
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — money/export consistency\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
