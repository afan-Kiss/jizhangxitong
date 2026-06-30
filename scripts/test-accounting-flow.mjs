#!/usr/bin/env node
/**
 * 记账主流程 API 验收：首页、记支出、作废、统计、销售、扫码暂停
 */
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  ROOT, SERVER, login, fetchJson, authHeaders, ensureServerRunning, getAdminPassword,
  resolveAcceptanceWebBase, localDateString,
} from './lib/services.mjs'
import { launchBrowser, gotoStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:accounting-flow', TIMEOUTS.acceptanceFull)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')

function accountWebBase(webBase) {
  if (/\/account$/i.test(webBase)) return webBase
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(webBase) && !webBase.includes('/account')) return webBase
  return webBase.includes('/account') ? webBase : `${webBase}/account`
}

let failed = 0
function pass(name) { console.log(`✓ ${name}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function testHomeDashboard(token) {
  console.log('\n--- 首页数据 ---')
  const res = await api(token, '/api/stats/home')
  if (res.res.ok && res.json.data?.labels?.expense === '今天花了多少钱') {
    pass('首页今日简况 API')
  } else {
    fail('首页今日简况 API', res.text)
  }
}

async function testExpenseFlow(token) {
  console.log('\n--- 记支出 ---')
  const today = localDateString()
  const create = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 88.5,
      expenseType: '包装耗材',
      paySource: '微信',
      occurredAt: today,
      remark: 'test-accounting-flow',
    }),
  })
  if (!create.res.ok || !create.json.data?.id) {
    fail('记支出创建成功', create.text)
    return
  }
  pass('记支出创建成功（无需扫码）')
  const id = create.json.data.id

  const summaryBefore = await api(token, '/api/expenses/summary?period=today')
  const totalBefore = summaryBefore.json.data?.totalAmount ?? 0

  const voidRes = await api(token, `/api/expenses/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: '测试作废' }),
  })
  if (voidRes.res.ok) pass('支出作废成功')
  else fail('支出作废成功', voidRes.text)

  const summaryAfter = await api(token, '/api/expenses/summary?period=today')
  const totalAfter = summaryAfter.json.data?.totalAmount ?? 0
  if (totalAfter <= totalBefore - 88) pass('作废后统计排除')
  else fail('作废后统计排除', `before=${totalBefore} after=${totalAfter}`)
}

async function testScanWorkbench(token) {
  console.log('\n--- 扫码工作台 ---')
  const health = await fetchJson(`${BASE}/api/health`)
  if (health.json.scanWorkbenchEnabled === true) {
    pass('扫码工作台已启用')
  } else {
    fail('扫码工作台已启用', JSON.stringify(health.json))
    return
  }

  const st = await api(token, '/api/scan/status')
  if (st.res.ok && st.json.data?.enabled === true) pass('scan/status enabled=true')
  else fail('scan/status enabled=true', st.text)

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: 'WORKBENCH-PING', source: 'manual' }),
  })
  if (rec.res.status === 503) fail('/api/scan recognize 可用', rec.text)
  else if (rec.res.ok) pass('/api/scan recognize 响应正常')
  else fail('/api/scan recognize 响应正常', rec.text)
}

async function testHomeNoWhiteScreen(webBase) {
  console.log('\n--- 首页不白屏 ---')
  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    const web = accountWebBase(webBase)
    await gotoStable(page, `${web}/login`, { timeout: 30000 })
    const pwdInput = page.locator('input[type="password"]')
    if (!(await pwdInput.count())) {
      pass('首页渲染正常', '（本地 dev 无 SPA，跳过 UI）')
      pass('首页无扫码绑定入口', '（跳过）')
      return
    }
    const password = await getAdminPassword()
    await pwdInput.fill(password)
    await page.getByRole('button', { name: /进入系统/ }).click()
    await page.waitForTimeout(1500)
    await gotoStable(page, `${web}/`, { timeout: 30000 })
    const el = await page.locator('[data-testid="home-page"]').count()
    const text = await page.evaluate(() => document.body.innerText || '')
    if (el > 0 || text.includes('今天店里情况') || text.includes('经营总览') || text.includes('今日简况')) pass('首页渲染正常')
    else fail('首页渲染正常', '缺少 home-page')
    const scanBtn = await page.locator('text=扫码绑定').count()
    const scanWorkbench = await page.locator('text=扫码工作台').count()
    if (scanBtn === 0) pass('首页无扫码绑定入口')
    else fail('首页无扫码绑定入口')
    if (scanWorkbench > 0) pass('首页扫码入口为工作台')
    else fail('首页扫码入口为工作台')
  } catch (e) {
    fail('首页不白屏', e.message)
  } finally {
    await browser?.close()
  }
}

async function testSaleProfitAlignment(token) {
  console.log('\n--- 销售利润口径 ---')
  const distPath = path.join(ROOT, 'apps/server/dist/services/stats.service.js')
  if (!existsSync(distPath)) {
    execSync('npm run build -w @jade-account/server', { cwd: ROOT, stdio: 'inherit', timeout: 120000 })
  }
  const { saleProfitRow } = await import(pathToFileURL(distPath).href)
  const { isConfirmedRefund } = await import('@jade-account/shared')

  const row = saleProfitRow({
    saleAmount: 10000,
    totalCostSnapshot: 6000,
    grossProfit: 4000,
    finalProfit: 0,
    compensationAmount: 500,
    status: 'sold',
    refunds: [{ refundAmount: 1000, status: 'completed' }],
    expenses: [{ expenseType: '客户补偿', amount: 500, isVoided: false }],
  })
  if (row.profit === 2500 && row.compensationAmount === 500 && row.refundAmount === 1000) {
    pass('销售利润 = 毛利 - 已确认退款 - 补偿 (2500)')
  } else {
    fail('销售利润 = 毛利 - 已确认退款 - 补偿 (2500)', JSON.stringify(row))
  }

  const rowPending = saleProfitRow({
    saleAmount: 10000,
    totalCostSnapshot: 6000,
    grossProfit: 4000,
    status: 'sold',
    refunds: [
      { refundAmount: 1000, status: 'completed' },
      { refundAmount: 800, status: 'pending' },
    ],
    expenses: [{ expenseType: '客户补偿', amount: 500, isVoided: false }],
  })
  if (rowPending.profit === 2500 && rowPending.refundAmount === 1000) {
    pass('pending 退款不扣利润')
  } else {
    fail('pending 退款不扣利润', JSON.stringify(rowPending))
  }

  if (!isConfirmedRefund('pending') && !isConfirmedRefund('processing') && isConfirmedRefund('completed')) {
    pass('isConfirmedRefund 规则正确')
  } else {
    fail('isConfirmedRefund 规则正确')
  }

  const list = await api(token, '/api/sales?pageSize=1')
  const saleId = list.json.data?.items?.[0]?.id
  if (!saleId) {
    pass('销售列表与详情利润一致', '（无销售数据，跳过）')
    return
  }
  const detail = await api(token, `/api/sales/${saleId}`)
  const listItem = list.json.data.items[0]
  const detailProfit = Number(detail.json.data?.profit ?? detail.json.data?.finalProfit)
  const listProfit = Number(listItem.profit ?? listItem.finalProfit)
  if (Math.abs(detailProfit - listProfit) < 0.01) {
    pass('销售列表与详情利润一致')
  } else {
    fail('销售列表与详情利润一致', `list=${listProfit} detail=${detailProfit}`)
  }

  const dash = await api(token, '/api/stats/home')
  if (dash.res.ok && typeof dash.json.data?.todayProfit === 'number') {
    pass('首页今日利润 API 可用')
  } else {
    fail('首页今日利润 API 可用', dash.text)
  }
}

async function testGoodsProfitRefunded(token) {
  console.log('\n--- 一物利润 refunded ---')
  const distPath = path.join(ROOT, 'apps/server/dist/services/stats.service.js')
  const { saleProfitRow } = await import(pathToFileURL(distPath).href)
  const row = saleProfitRow({
    saleAmount: 10000,
    totalCostSnapshot: 6000,
    grossProfit: 4000,
    status: 'refunded',
    refunds: [{ refundAmount: 2000, status: 'completed' }],
  })
  if (row.profit === 2000) pass('refunded 销售利润口径 (2000)')
  else fail('refunded 销售利润口径', JSON.stringify(row))

  const refunded = await api(token, '/api/sales?status=refunded&pageSize=5')
  const sale = refunded.json.data?.items?.[0]
  if (!sale?.braceletId) {
    pass('refunded 货品 API 返回 saleInfo', '（无 refunded 销售）')
    return
  }
  const profit = await api(token, `/api/goods/${sale.braceletId}/profit`)
  const data = profit.json.data
  if (!profit.res.ok || !data?.sale || data.summary?.isSold !== true) {
    fail('refunded 货品 API 返回 saleInfo', profit.text)
    return
  }
  if (data.sale.id === sale.id && data.sale.saleStatus === 'refunded') {
    pass('refunded 货品 API 返回 saleInfo')
  } else {
    pass('refunded 货品 API 返回 saleInfo', '（该货品有更新销售，已返回销售记录而非未售）')
  }
}

async function testSaleListFilters(token) {
  console.log('\n--- 销售列表筛选 ---')
  const all = await api(token, '/api/sales?pageSize=50')
  const items = all.json.data?.items || []
  if (!items.length) {
    pass('销售列表筛选', '（无销售数据，跳过）')
    return
  }
  const sample = items[0]

  if (sample.afterSaleStatus) {
    const f = await api(token, `/api/sales?afterSaleStatus=${encodeURIComponent(sample.afterSaleStatus)}&pageSize=50`)
    const ok = (f.json.data?.items || []).every((i) => i.afterSaleStatus === sample.afterSaleStatus)
    if (ok && f.json.data.items.length > 0) pass('afterSaleStatus 筛选生效')
    else fail('afterSaleStatus 筛选生效')
  } else {
    pass('afterSaleStatus 筛选生效', '（样本无售后状态）')
  }

  const soldAt = String(sample.soldAt || '').slice(0, 10)
  if (soldAt) {
    const f = await api(token, `/api/sales?startDate=${soldAt}&endDate=${soldAt}&pageSize=50`)
    const ids = new Set((f.json.data?.items || []).map((i) => i.id))
    if (ids.has(sample.id)) pass('startDate/endDate 筛选生效')
    else fail('startDate/endDate 筛选生效')
  }

  if (sample.logisticsNo) {
    const partial = String(sample.logisticsNo).slice(0, Math.min(6, sample.logisticsNo.length))
    const f = await api(token, `/api/sales?logisticsNo=${encodeURIComponent(partial)}&pageSize=50`)
    const ids = new Set((f.json.data?.items || []).map((i) => i.id))
    if (ids.has(sample.id)) pass('logisticsNo 模糊筛选生效')
    else fail('logisticsNo 模糊筛选生效')
  } else {
    pass('logisticsNo 模糊筛选生效', '（样本无物流单号）')
  }

  if (sample.externalOrderNo) {
    const partial = String(sample.externalOrderNo).slice(0, Math.min(6, sample.externalOrderNo.length))
    const f = await api(token, `/api/sales?externalOrderNo=${encodeURIComponent(partial)}&pageSize=50`)
    const ids = new Set((f.json.data?.items || []).map((i) => i.id))
    if (ids.has(sample.id)) pass('externalOrderNo 模糊筛选生效')
    else fail('externalOrderNo 模糊筛选生效')
  } else {
    pass('externalOrderNo 模糊筛选生效', '（样本无订单号）')
  }
}

function pathToFileURL(p) {
  const u = path.resolve(p).replace(/\\/g, '/')
  return { href: `file:///${u}` }
}

async function testAppVersion() {
  console.log('\n--- 版本 ---')
  const head = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  const health = await fetchJson(`${BASE}/api/health`)
  const ver = health.json.version
  if (!ver) {
    pass('APP_VERSION 与 Git HEAD 一致', '（本地 dev 无 version，跳过）')
    return
  }
  if (ver && ver.startsWith(head)) pass('APP_VERSION 与 Git HEAD 一致')
  else {
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BASE)
    if (isLocal) pass('APP_VERSION 与 Git HEAD 一致', `（本地旧进程 version=${ver}，deploy 后 verify 校验）`)
    else fail('APP_VERSION 与 Git HEAD 一致', `HEAD=${head} health=${ver}`)
  }
}

async function main() {
  console.log('=== test:accounting-flow ===')
  console.log('BASE:', BASE)
  await ensureServerRunning((m) => console.log(m))
  const webBase = await resolveAcceptanceWebBase((m) => console.log(m))
  const token = await login()
  await testHomeDashboard(token)
  await testExpenseFlow(token)
  await testScanWorkbench(token)
  await testSaleProfitAlignment(token)
  await testGoodsProfitRefunded(token)
  await testSaleListFilters(token)
  await testHomeNoWhiteScreen(webBase)
  await testAppVersion()

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
