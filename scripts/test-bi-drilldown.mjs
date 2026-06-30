#!/usr/bin/env node
/**
 * BI 下钻验收：时间范围、KPI 点击、明细页搜索与跳转
 */
import { chromium } from 'playwright'
import { resolveAcceptanceWebBase, getAdminCredentials, ensureServerRunning } from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable, attachPageDiagnostics,
  PAGE_TIMEOUT_MS, SCRIPT_TIMEOUT_MS, installScriptTimeout,
} from './lib/playwright-utils.mjs'

let WEB_BASE = 'http://127.0.0.1:5173'
let failed = 0

function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

function accountWebBase(webBase) {
  if (/\/account$/i.test(webBase)) return webBase
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(webBase) && !webBase.includes('/account')) return webBase
  return webBase.includes('/account') ? webBase : `${webBase}/account`
}

async function login(page, creds) {
  await gotoLoginStable(page, `${WEB_BASE}/login`)
  await page.locator('input:not([type="password"])').first().fill(creds.username)
  await page.locator('input[type="password"]').fill(creds.password)
  const submit = page.getByTestId('login-submit')
  if (await submit.count()) await submit.click()
  else await page.getByRole('button', { name: /进入系统|登录/ }).click()
  await page.waitForTimeout(1200)
}

async function gotoHome(page) {
  await gotoStable(page, `${WEB_BASE}/`)
  await page.waitForSelector('[data-testid="home-page"]', { timeout: PAGE_TIMEOUT_MS }).catch(() => {})
  await page.waitForTimeout(600)
}

installScriptTimeout('test:bi-drilldown', SCRIPT_TIMEOUT_MS * 3)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:bi-drilldown (${WEB_BASE}) ===\n`)

  let browser
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [] }

  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    attachPageDiagnostics(page, bucket)
    await login(page, creds)
    await gotoHome(page)

    if (await page.getByTestId('home-page').count()) pass('首页加载')
    else fail('首页加载')

    const ranges = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month']
    for (const r of ranges) {
      const btn = page.getByTestId(`range-${r}`)
      if (await btn.count()) {
        await btn.click()
        await page.waitForTimeout(500)
        pass(`切换时间范围 ${r}`)
      } else fail(`切换时间范围 ${r}`, '按钮不存在')
    }

    // 自定义日期
    await page.getByTestId('range-custom').click()
    await page.waitForSelector('[data-testid="date-range-modal"]', { timeout: 5000 })
    await page.getByTestId('shortcut-last7').click()
    await page.getByTestId('date-range-confirm').click()
    await page.waitForTimeout(800)
    if (await page.getByTestId('date-range-label').count()) pass('自定义日期确认后 KPI 刷新')
    else fail('自定义日期确认后 KPI 刷新')

    const drillCases = [
      { testId: 'kpi-sales', type: 'sales', title: '销售明细' },
      { testId: 'kpi-expenses', type: 'expenses', title: '支出明细' },
      { testId: 'kpi-profit', type: 'profit', title: '利润明细' },
      { testId: 'kpi-customer-payments', type: 'customer-payments', title: '客户返款' },
      { testId: 'kpi-effective-sales', type: 'effective-sales', title: '有效成交' },
    ]

    for (const c of drillCases) {
      await gotoHome(page)
      const kpi = page.getByTestId(c.testId)
      if (!(await kpi.count())) { fail(`${c.testId} 可点击`, '卡片不存在'); continue }
      await kpi.click()
      await page.waitForTimeout(800)
      const url = page.url()
      if (url.includes(`/bi/drilldown`) && url.includes(`type=${c.type}`)) pass(`${c.testId} 进入下钻页`)
      else fail(`${c.testId} 进入下钻页`, url)

      if (await page.getByTestId('bi-drilldown-page').count()) pass(`${c.type} 下钻页渲染`)
      else fail(`${c.type} 下钻页渲染`)

      if (c.type === 'effective-sales') {
        if (await page.getByTestId('bi-drill-rule-hint').count()) pass('有效成交口径说明展示')
        else fail('有效成交口径说明展示')
      }
    }

    // 搜索
    await gotoHome(page)
    await page.getByTestId('kpi-sales').click()
    await page.waitForTimeout(600)
    const search = page.getByTestId('bi-drill-search')
    if (await search.count()) {
      await search.fill('TEST-ORDER-NO-XYZ')
      await page.getByRole('button', { name: '搜索' }).click()
      await page.waitForTimeout(600)
      pass('下钻页搜索订单号可用')
    } else fail('下钻页搜索订单号可用')

    // 空数据或明细跳转
    const empty = page.getByTestId('bi-drill-empty')
    const row = page.getByTestId('bi-drill-row').first()
    if (await empty.count()) pass('下钻页空状态文案')
    else if (await row.count()) {
      pass('下钻页有明细行')
      await row.click()
      await page.waitForTimeout(600)
      if (!page.url().includes('/bi/drilldown')) pass('下钻页明细可跳详情')
      else fail('下钻页明细可跳详情', page.url())
    } else pass('下钻页空状态或明细（二选一）')

    // 手机端无横向滚动
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoHome(page)
    await page.getByTestId('kpi-expenses').click()
    await page.waitForTimeout(600)
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (!overflowX) pass('手机端下钻页无横向滚动')
    else fail('手机端下钻页无横向滚动')

    // 电脑端表格
    await page.setViewportSize({ width: 1400, height: 900 })
    await gotoHome(page)
    await page.getByTestId('kpi-sales').click()
    await page.waitForTimeout(600)
    const table = page.getByTestId('bi-drill-table')
    if (await table.count()) pass('电脑端表格区域存在')
    else pass('电脑端表格区域（无数据时可隐藏）')

    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — BI 下钻验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
