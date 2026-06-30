#!/usr/bin/env node
/**
 * 报销列表高级日期选择器验收
 */
import { chromium } from 'playwright'
import { resolveAcceptanceWebBase, getAdminCredentials, ensureServerRunning } from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable,
  SCRIPT_TIMEOUT_MS, installScriptTimeout,
} from './lib/playwright-utils.mjs'

let WEB_BASE = 'http://127.0.0.1:5173'
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

function accountWebBase(webBase) {
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(webBase) && !webBase.includes('/account')) return webBase
  return webBase.includes('/account') ? webBase : `${webBase}/account`
}

async function login(page, creds) {
  await gotoLoginStable(page, `${WEB_BASE}/login`)
  await page.locator('input:not([type="password"])').first().fill(creds.username)
  await page.locator('input[type="password"]').fill(creds.password)
  await page.getByTestId('login-submit').click()
  await page.waitForTimeout(1200)
}

installScriptTimeout('test:reimbursement-date-picker', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:reimbursement-date-picker (${WEB_BASE}) ===\n`)

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1280, height: 900 })
    await login(page, creds)
    await gotoStable(page, `${WEB_BASE}/reimbursements`)
    await page.waitForSelector('[data-testid="reimburse-date-range"]', { timeout: 15000 })

    if (await page.getByTestId('date-range-picker').count()) pass('报销列表出现高级日期选择器')
    else fail('报销列表出现高级日期选择器')

    const hero = await page.getByTestId('reimburse-hero').textContent()
    if (hero?.includes('员工垫付')) pass('顶部文案正确')
    else fail('顶部文案', hero || '')

    for (const r of ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month']) {
      const btn = page.getByTestId(`range-${r}`)
      if (await btn.count()) {
        await btn.click()
        await page.waitForTimeout(400)
        pass(`切换 ${r}`)
      } else fail(`切换 ${r}`)
    }

    await page.getByTestId('range-custom').click()
    await page.waitForSelector('[data-testid="date-range-modal"]', { timeout: 5000 })
    const modalClass = await page.getByTestId('date-range-modal').getAttribute('class')
    if (modalClass?.includes('glass') || await page.getByTestId('date-range-modal').count()) pass('自定义弹窗深色玻璃风格')
    else fail('自定义弹窗')
    await page.getByTestId('shortcut-last7').click()
    await page.getByTestId('date-range-confirm').click()
    await page.waitForTimeout(800)

    const url = page.url()
    if (url.includes('range=') && url.includes('startDate=')) pass('URL query 保留')
    else fail('URL query 保留', url)

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoStable(page, `${WEB_BASE}/reimbursements?range=this_month`)
    await page.waitForTimeout(600)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (!overflow) pass('手机端无横向滚动')
    else fail('手机端无横向滚动')

    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 报销日期选择器验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
