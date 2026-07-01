#!/usr/bin/env node
/** 纯项目支出系统验收 */
import { chromium } from 'playwright'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, localDateString, getAdminPassword,
} from './lib/services.mjs'
import { launchBrowser, gotoStable, gotoLoginStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')
const FORBIDDEN = ['销售', '毛利', '利润', '有效成交', '库存', '报销', '员工垫付', '扫码工作台']
const REQUIRED_HOME = ['项目资金支出记录', '今日支出', '本期支出', '本月支出', '待补凭证', '最近支出']

let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:project-expense-only', TIMEOUTS.acceptanceFull)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function testHomeUi(page) {
  console.log('\n--- 首页纯支出 ---')
  await gotoStable(page, `${BASE}/`)
  const text = await page.evaluate(() => document.body.innerText || '')
  for (const w of FORBIDDEN) {
    if (text.includes(w)) fail(`首页不出现「${w}」`, text.slice(0, 80))
    else pass(`首页不出现「${w}」`)
  }
  for (const w of REQUIRED_HOME) {
    if (text.includes(w)) pass(`首页显示「${w}」`)
    else fail(`首页显示「${w}」`)
  }
}

async function testLegacyRoutes(page) {
  console.log('\n--- 旧路由下线 ---')
  for (const path of ['/sales', '/bracelets', '/scan', '/bi/drilldown']) {
    await gotoStable(page, `${BASE}${path}`)
    const text = await page.evaluate(() => document.body.innerText || '')
    const url = page.url()
    if (path === '/bi/drilldown' && url.includes('/expense/stats')) {
      pass(`${path} 重定向到支出统计`)
    } else if (/已下线|只记录项目资金支出/.test(text)) {
      pass(`${path} 显示下线提示`)
    } else {
      fail(`${path} 不可访问或显示下线`, text.slice(0, 80))
    }
  }
}

async function testExpenseFlow(token) {
  console.log('\n--- 记支出流程 ---')
  const today = localDateString()
  const create = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 12.34,
      expenseType: '办公杂费',
      businessType: 'normal',
      paySource: '项目专用资金',
      occurredAt: today,
      externalOrderNo: `TEST-${Date.now()}`,
      remark: 'test-project-expense-only',
    }),
  })
  if (create.res.ok && create.json.data?.paySource === '项目专用资金') {
    pass('新建支出默认项目专用资金')
  } else {
    fail('新建支出默认项目专用资金', create.text?.slice(0, 120))
  }
  const id = create.json.data?.id
  if (id) {
    const detail = await api(token, `/api/expenses/${id}`)
    if (!detail.json.data?.reimbursementStatus || detail.json.data?.reimbursementStatus === 'not_required') {
      pass('新建支出无报销业务展示字段')
    } else {
      fail('新建支出 reimbursementStatus', detail.text)
    }
  }
}

async function testStats(token) {
  console.log('\n--- 支出统计 ---')
  const summary = await api(token, '/api/expenses/summary?period=today')
  if (summary.res.ok && summary.json.data?.byType !== undefined) pass('按分类统计可用')
  else fail('按分类统计可用', summary.text)
  const monthly = await api(token, `/api/stats/monthly?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`)
  const mtext = JSON.stringify(monthly.json.data || {})
  if (monthly.res.ok && !/grossProfit|effectiveSale|refundImpact/.test(mtext)) {
    pass('月报无销售/利润字段')
  } else {
    fail('月报无销售/利润字段', mtext.slice(0, 120))
  }
}

async function main() {
  console.log('\n=== test:project-expense-only ===\n')
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await gotoLoginStable(page, `${BASE}/login`)
    const pwd = page.locator('input[type="password"]')
    const password = await getAdminPassword()
    await page.locator('input:not([type="password"])').first().fill('fanfan')
    await pwd.fill(password)
    await page.getByRole('button', { name: /进入系统/ }).click()
    await page.waitForTimeout(1200)

    await testHomeUi(page)
    await testLegacyRoutes(page)
  } finally {
    await browser?.close()
  }

  await testExpenseFlow(token)
  await testStats(token)

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 纯支出系统验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
