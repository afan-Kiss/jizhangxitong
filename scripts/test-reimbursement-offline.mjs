#!/usr/bin/env node
/** 报销功能下线验收 */
import { chromium } from 'playwright'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
  resolveAcceptanceWebBase, getAdminCredentials,
} from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable, installScriptTimeout, SCRIPT_TIMEOUT_MS,
} from './lib/playwright-utils.mjs'

let WEB_BASE = 'http://localhost:5173'
let failed = 0
function pass(n, d = '') { console.log(`✓ ${n}${d ? ` — ${d}` : ''}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:reimbursement-offline', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = (await resolveAcceptanceWebBase()).replace(/127\.0\.0\.1/g, 'localhost')
  const token = await login(SERVER.replace(/\/$/, ''))
  const api = SERVER.replace(/\/$/, '')
  const creds = await getAdminCredentials()

  console.log(`\n=== test:reimbursement-offline (${WEB_BASE}) ===\n`)

  for (const path of [
    '/api/expenses/reimbursements/summary',
    '/api/expenses/pending-reimbursements',
    '/api/expenses/export/reimbursement-excel/preview',
    '/api/expenses/export/reimbursement-excel',
  ]) {
    const method = path.includes('preview') || path.includes('reimbursement-excel') && !path.includes('summary') && !path.includes('pending')
      ? 'POST'
      : 'GET'
    const res = await fetchJson(`${api}${path}`, {
      method: path.includes('excel') ? 'POST' : method,
      headers: authHeaders(token),
      body: path.includes('excel') ? JSON.stringify({}) : undefined,
    })
    if (res.res.status === 410) pass(`API 410 ${path}`)
    else fail(`API 410 ${path}`, `${res.res.status} ${res.text?.slice(0, 80)}`)
  }

  const patch = await fetchJson(`${api}/api/expenses/1/reimbursement-status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ status: 'reimbursed' }),
  })
  if (patch.res.status === 410) pass('PATCH reimbursement-status 410')
  else fail('PATCH reimbursement-status 410', String(patch.res.status))

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await gotoLoginStable(page, `${WEB_BASE}/login`)
    await page.locator('input:not([type="password"])').first().fill(creds.username)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(1000)

    await gotoStable(page, `${WEB_BASE}/`)
    const homeText = await page.locator('[data-testid="home-page"]').innerText()
    if (!/报销|未报销|导出报销/.test(homeText)) pass('首页无报销文案')
    else fail('首页无报销文案', homeText.slice(0, 120))

    for (const path of ['/reimbursements', '/expense/export']) {
      await gotoStable(page, `${WEB_BASE}${path}`)
      const msg = await page.getByTestId('module-disabled-message').textContent().catch(() => '')
      if (msg?.includes('专属经费')) pass(`${path} 显示下线提示`)
      else fail(`${path} 显示下线提示`, msg || 'no message')
    }

    if (await page.locator('.desktop-sidebar__link', { hasText: '导出 Excel' }).count() === 0) {
      pass('侧边栏无导出 Excel')
    } else {
      fail('侧边栏无导出 Excel')
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 报销下线验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
