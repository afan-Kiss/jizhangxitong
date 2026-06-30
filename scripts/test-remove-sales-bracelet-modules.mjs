#!/usr/bin/env node
/**
 * 销售/镯子模块已停用验收
 */
import { chromium } from 'playwright'
import { resolveAcceptanceWebBase, getAdminCredentials, ensureServerRunning } from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable,
  PAGE_TIMEOUT_MS, SCRIPT_TIMEOUT_MS, installScriptTimeout,
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
  const submit = page.getByTestId('login-submit')
  if (await submit.count()) await submit.click()
  else await page.getByRole('button', { name: /进入系统|登录/ }).click()
  await page.waitForTimeout(1200)
}

installScriptTimeout('test:remove-sales-bracelet-modules', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:remove-sales-bracelet-modules (${WEB_BASE}) ===\n`)

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1400, height: 900 })
    await login(page, creds)
    await gotoStable(page, `${WEB_BASE}/`)

    const sidebarText = await page.getByTestId('desktop-sidebar').textContent().catch(() => '')
    if (!sidebarText.includes('销售')) pass('电脑侧边栏没有「销售」')
    else fail('电脑侧边栏没有「销售」')
    if (!sidebarText.includes('镯子')) pass('电脑侧边栏没有「镯子」')
    else fail('电脑侧边栏没有「镯子」')

    if (!(await page.getByText('销售登记').count())) pass('首页没有「销售登记」')
    else fail('首页没有「销售登记」')
    if (!(await page.getByText('查镯子').count())) pass('首页没有「镯子查询」')
    else fail('首页没有「镯子查询」')

    if (await page.getByTestId('home-expense-btn').count()) pass('记支出入口仍存在')
    else fail('记支出入口仍存在')
    if (await page.getByTestId('home-scan-btn').count()) pass('扫码工作台入口仍存在')
    else fail('扫码工作台入口仍存在')

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoStable(page, `${WEB_BASE}/`)
    const tabText = await page.locator('.van-tabbar, .mobile-tabbar').textContent().catch(() => '')
    if (!tabText?.includes('销售')) pass('手机 Tab 没有「销售」')
    else fail('手机 Tab 没有「销售」')
    if (!tabText?.includes('镯子')) pass('手机 Tab 没有「镯子」')
    else fail('手机 Tab 没有「镯子」')

    await gotoStable(page, `${WEB_BASE}/sales`)
    await page.waitForTimeout(600)
    if (await page.getByTestId('module-disabled-page').count()) pass('/sales 显示停用页')
    else if (page.url().includes('/sales') && !(await page.locator('#app').textContent())?.includes('白屏')) pass('/sales 不白屏')
    else fail('/sales 访问', page.url())

    await gotoStable(page, `${WEB_BASE}/bracelets`)
    await page.waitForTimeout(600)
    if (await page.getByTestId('module-disabled-page').count()) pass('/bracelets 显示停用页')
    else fail('/bracelets 显示停用页', page.url())

    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 销售/镯子模块移除验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
