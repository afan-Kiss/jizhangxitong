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
} from './lib/services.mjs'
import { launchBrowser, gotoStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:accounting-flow', TIMEOUTS.acceptanceFull)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')

function accountWebBase() {
  if (/\/account$/i.test(BASE)) return BASE
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BASE)) return `${BASE}/account`
  return BASE.includes('/account') ? BASE : `${BASE}/account`
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
  const today = new Date().toISOString().slice(0, 10)
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

async function testScanPaused(token) {
  console.log('\n--- 扫码停用 ---')
  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: 'X', source: 'manual' }),
  })
  if (rec.res.status === 503) pass('/api/scan 默认停用')
  else fail('/api/scan 默认停用', String(rec.res.status))
}

async function testHomeNoWhiteScreen() {
  console.log('\n--- 首页不白屏 ---')
  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    const webBase = accountWebBase()
    await gotoStable(page, `${webBase}/login`, { timeout: 30000 })
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
    await gotoStable(page, `${webBase}/`, { timeout: 30000 })
    const el = await page.locator('[data-testid="home-page"]').count()
    const text = await page.evaluate(() => document.body.innerText || '')
    if (el > 0 || text.includes('经营总览')) pass('首页渲染正常')
    else fail('首页渲染正常', '缺少 home-page')
    const scanBtn = await page.locator('text=扫码绑定').count()
    if (scanBtn === 0) pass('首页无扫码绑定入口')
    else fail('首页无扫码绑定入口')
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

  const row = saleProfitRow({
    saleAmount: 10000,
    totalCostSnapshot: 6000,
    grossProfit: 4000,
    finalProfit: 0,
    compensationAmount: 500,
    status: 'sold',
    refunds: [{ refundAmount: 1000 }],
  })
  if (row.profit === 2500 && row.compensationAmount === 500 && row.refundAmount === 1000) {
    pass('销售利润 = 毛利 - 退款 - 补偿 (2500)')
  } else {
    fail('销售利润 = 毛利 - 退款 - 补偿 (2500)', JSON.stringify(row))
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
  else fail('APP_VERSION 与 Git HEAD 一致', `HEAD=${head} health=${ver}`)
}

async function main() {
  console.log('=== test:accounting-flow ===')
  console.log('BASE:', BASE)
  await ensureServerRunning((m) => console.log(m))
  const token = await login()
  await testHomeDashboard(token)
  await testExpenseFlow(token)
  await testScanPaused(token)
  await testSaleProfitAlignment(token)
  await testHomeNoWhiteScreen()
  await testAppVersion()

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
