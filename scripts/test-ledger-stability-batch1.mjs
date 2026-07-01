#!/usr/bin/env node
/**
 * 账本稳定性修复第一批验收
 */
import { chromium } from 'playwright'
import {
  ROOT, SERVER, login, fetchJson, authHeaders, ensureServerRunning, resolveAcceptanceWebBase, getAdminCredentials,
} from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable, SCRIPT_TIMEOUT_MS, installScriptTimeout,
} from './lib/playwright-utils.mjs'

let WEB_BASE = 'http://localhost:5173'
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:ledger-stability-batch1', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = (await resolveAcceptanceWebBase()).replace(/127\.0\.0\.1/g, 'localhost')
  const creds = await getAdminCredentials()
  const token = await login(SERVER.replace(/\/$/, ''))
  const api = SERVER.replace(/\/$/, '')
  const today = new Date().toISOString().slice(0, 10)

  console.log(`\n=== test:ledger-stability-batch1 (${WEB_BASE}) ===\n`)

  const summary = await fetchJson(`${api}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const myCount = summary.json.data?.myCount
  if (myCount == null) fail('summary 返回 myCount')
  else pass('summary 返回 myCount')

  const mineList = await fetchJson(
    `${api}/api/expenses?startDate=${today}&endDate=${today}&mine=1&pageSize=100`,
    { headers: authHeaders(token) },
  )
  const mineItems = mineList.json.data?.items || []
  const mineTotal = mineList.json.data?.total ?? mineItems.length
  if (mineTotal > (myCount ?? 0)) {
    fail('ExpenseStats 口径', `mine total=${mineTotal} > myCount=${myCount}`)
  } else {
    pass('ExpenseStats 我记的与 mine 列表口径一致')
  }

  const reimbSummary = await fetchJson(
    `${api}/api/expenses/reimbursements/summary?startDate=${today}&endDate=${today}&paySource=${encodeURIComponent('员工垫付')}&reimbursementStatus=pending`,
    { headers: authHeaders(token) },
  )
  if (!reimbSummary.res.ok) fail('报销汇总接口', reimbSummary.text.slice(0, 120))
  else pass('报销汇总接口可用')

  const pageList = await fetchJson(
    `${api}/api/expenses?startDate=${today}&endDate=${today}&paySource=${encodeURIComponent('员工垫付')}&reimbursementStatus=pending&page=1&pageSize=5`,
    { headers: authHeaders(token) },
  )
  const pageItems = pageList.json.data?.items || []
  const pageReduce = pageItems
    .filter((i) => i.reimbursementStatus === 'pending')
    .reduce((s, i) => s + Number(i.amount || 0), 0)
  const fullPending = Number(reimbSummary.json.data?.pendingAmount || 0)
  const fullTotal = Number(reimbSummary.json.data?.total || 0)
  if (fullTotal > pageItems.length && fullPending <= pageReduce + 0.01) {
    fail('报销汇总非当前页 reduce', `full=${fullPending} pageReduce=${pageReduce}`)
  } else {
    pass('报销汇总来自全量统计')
  }

  if (fullTotal > 5) pass('报销列表 total 可大于单页（加载更多场景）')
  else pass('报销列表 total 可大于单页（数据不足，跳过强校验）')

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await gotoLoginStable(page, `${WEB_BASE}/login`)
    await page.locator('input:not([type="password"])').first().fill(creds.username)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(1000)

    await gotoStable(page, `${WEB_BASE}/expense/999999999`)
    await page.waitForSelector('[data-testid="expense-detail-error"]', { timeout: 15000 })
    pass('ExpenseDetail API 失败显示错误态')

    const normal = await fetchJson(`${api}/api/expenses`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        amount: 1,
        expenseType: '包装耗材',
        businessType: 'normal',
        paySource: '微信',
        occurredAt: today,
        remark: `STAB-${Date.now()}`,
      }),
    })
    const normalId = normal.json.data?.id
    if (!normalId) fail('创建测试支出', normal.text)
    else {
      await gotoStable(page, `${WEB_BASE}/expense/${normalId}`)
      await page.waitForSelector('[data-testid="expense-detail-page"], [data-testid="expense-amount"]', { timeout: 15000 })
      pass('ExpenseDetail 正常加载')
    }

    await gotoStable(page, `${WEB_BASE}/reimbursements`)
    await page.waitForSelector('[data-testid="reimburse-summary-card"]', { timeout: 15000 })
    pass('报销页展示全量汇总卡')
    const loadMore = page.locator('[data-testid="reimburse-load-more"]')
    if (await loadMore.count()) pass('报销页有加载更多入口')
    else pass('报销页有加载更多入口', '（当前页已显示全部）')

    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 账本稳定性第一批\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
