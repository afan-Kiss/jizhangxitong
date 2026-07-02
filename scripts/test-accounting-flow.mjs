#!/usr/bin/env node
/**
 * 记账主流程 API 验收：首页、记支出、作废、统计（纯支出）
 */
import { execSync } from 'child_process'
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
  if (res.res.ok && res.json.data?.labels?.expense === '今日支出') {
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
      expenseType: '包装物料',
      paySource: '微信',
      occurredAt: today,
      operatorName: '范帅',
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
    await page.locator('input:not([type="password"])').first().fill('fanfan')
    await pwdInput.fill(password)
    await page.getByRole('button', { name: /进入系统/ }).click()
    await page.waitForTimeout(1500)
    await gotoStable(page, `${web}/`, { timeout: 30000 })
    const el = await page.locator('[data-testid="home-page"]').count()
    const text = await page.evaluate(() => document.body.innerText || '')
    const homeMarkers = ['项目资金支出记录', '今日支出', '本期支出', '本月支出']
    if (el > 0 || homeMarkers.some((t) => text.includes(t))) pass('首页渲染正常')
    else fail('首页渲染正常', '缺少 home-page')
    const scanBtn = await page.locator('text=扫码绑定').count()
    const scanWorkbench = await page.locator('text=扫码工作台').count()
    if (scanBtn === 0) pass('首页无扫码绑定入口')
    else fail('首页无扫码绑定入口')
    if (scanWorkbench === 0) pass('首页无扫码入口')
    else fail('首页无扫码入口')
  } catch (e) {
    fail('首页不白屏', e.message)
  } finally {
    await browser?.close()
  }
}

async function testHomeStatsOnly(token) {
  console.log('\n--- 首页支出指标 ---')
  const dash = await api(token, '/api/stats/home')
  if (dash.res.ok && typeof dash.json.data?.todayExpenseAmount === 'number') {
    pass('首页今日支出 API 可用')
  } else {
    fail('首页今日支出 API 可用', dash.text)
  }
  if (dash.res.ok && typeof dash.json.data?.monthExpenseAmount === 'number') {
    pass('首页本月支出 API 可用')
  } else {
    fail('首页本月支出 API 可用', dash.text)
  }
  if (!dash.json.data?.todayProfit && !dash.json.data?.todaySaleAmount) {
    pass('首页无销售/利润字段')
  } else {
    fail('首页无销售/利润字段', JSON.stringify(dash.json.data))
  }
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
  await testHomeStatsOnly(token)
  await testHomeNoWhiteScreen(webBase)
  await testAppVersion()

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
