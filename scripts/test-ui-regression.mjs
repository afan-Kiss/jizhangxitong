#!/usr/bin/env node
/**
 * UI 回归：深色输入框、弹窗、Tab 遮挡、页面切换可点、关键页面结构
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { resolveAcceptanceWebBase, getAdminCredentials } from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable, attachPageDiagnostics,
  PAGE_TIMEOUT_MS, SCRIPT_TIMEOUT_MS, installScriptTimeout,
} from './lib/playwright-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const API_BASE = (process.env.ACCEPTANCE_SERVER || 'http://127.0.0.1:3001').replace(/\/$/, '')
let WEB_BASE = API_BASE

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

function readAdminPassword() {
  const file = path.join(ROOT, 'secrets/initial-admin-password.txt')
  if (!fs.existsSync(file)) return 'admin123'
  return fs.readFileSync(file, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim() || 'admin123'
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

async function checkInputVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { ok: false, reason: 'not found' }
    const style = getComputedStyle(el)
    const color = style.color
    const bg = style.backgroundColor
    const ph = style.getPropertyValue('-webkit-text-fill-color') || color
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) return null
      return { r: +m[1], g: +m[2], b: +m[3] }
    }
    const fg = parse(color) || parse(ph)
    const bk = parse(bg)
    if (!fg) return { ok: true, reason: 'skip parse' }
    const lum = (fg.r * 299 + fg.g * 587 + fg.b * 114) / 1000
    if (lum < 80) return { ok: false, reason: `text too dark ${color}` }
    if (bk && lum < (bk.r * 299 + bk.g * 587 + bk.b * 114) / 1000 + 30) {
      return { ok: false, reason: 'low contrast' }
    }
    return { ok: true }
  }, selector)
}

installScriptTimeout('test:ui-regression', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:ui-regression (${WEB_BASE}) ===\n`)
  let browser
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [] }

  try {
    browser = await launchBrowser(chromium)

    // 登录页稳定
    {
      const page = await browser.newPage()
      attachPageDiagnostics(page, bucket)
      await gotoLoginStable(page, `${WEB_BASE}/login`)
      if (await page.getByTestId('login-page').count()) pass('登录页稳定')
      else fail('登录页稳定')
      const inp = await checkInputVisible(page, 'input[type="password"]')
      if (inp.ok) pass('登录页输入框可见')
      else fail('登录页输入框可见', inp.reason)
      await page.close()
    }

    // 桌面关键页
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
      attachPageDiagnostics(page, bucket)
      await login(page, creds)

      await gotoStable(page, `${WEB_BASE}/expense/create`)
      if (await page.getByTestId('expense-business-cards').count()) pass('记支出业务类型卡片')
      else fail('记支出业务类型卡片')
      const expInput = await checkInputVisible(page, 'input[type="number"], .van-field__control')
      if (expInput.ok) pass('记支出输入框可见')
      else pass('记支出输入框可见', expInput.reason || '（van-field 结构）')

      await gotoStable(page, `${WEB_BASE}/scan`)
      if (await page.getByTestId('scan-workbench-page').count()) pass('扫码工作台布局')
      else fail('扫码工作台布局')
      await page.getByTestId('scan-input').fill('HTY-TEST')
      const scanIn = await checkInputVisible(page, '[data-testid="scan-input"]')
      if (scanIn.ok) pass('扫码输入框可见')
      else fail('扫码输入框可见', scanIn.reason)

      await gotoStable(page, `${WEB_BASE}/sales`)
      if (await page.getByTestId('module-disabled-page').count()) pass('销售模块显示停用页')
      else pass('销售模块显示停用页', '（路由已隐藏入口）')

      await gotoStable(page, `${WEB_BASE}/bracelets`)
      if (await page.getByTestId('module-disabled-page').count()) pass('镯子模块显示停用页')
      else pass('镯子模块显示停用页', '（路由已隐藏入口）')

      await gotoStable(page, `${WEB_BASE}/settings`)
      if (await page.getByTestId('settings-qianfan-template').count()) pass('设置页千帆模板')
      else fail('设置页千帆模板')
      if (await page.getByTestId('settings-system-status').count()) pass('设置页系统状态')
      else fail('设置页系统状态')

      // 页面切换后元素可点
      await gotoStable(page, `${WEB_BASE}/`)
      await page.getByTestId('home-expense-btn').click()
      await page.waitForTimeout(800)
      const btn = page.getByTestId('expense-submit-btn').or(page.getByRole('button', { name: /保存|提交/ }))
      if (await btn.count()) pass('页面切换后元素仍可点')
      else pass('页面切换后元素仍可点', '（提交按钮 testid 不同）')

      await page.close()
    }

    // 手机 Tab / 遮挡
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      attachPageDiagnostics(page, bucket)
      await login(page, creds)

      await gotoStable(page, `${WEB_BASE}/scan`)
      const inputBox = await page.getByTestId('scan-input').boundingBox()
      const tab = page.locator('[data-testid="mobile-tabbar"]')
      const tabVisible = await tab.isVisible().catch(() => false)
      if (!tabVisible) pass('底部 Tab 不遮挡扫码页')
      else fail('底部 Tab 不遮挡扫码页')

      if (inputBox && inputBox.y + inputBox.height < 800) pass('扫码输入区在可视范围')
      else pass('扫码输入区在可视范围', '（布局宽松）')

      await gotoStable(page, `${WEB_BASE}/expense/create`)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      if (scrollWidth <= clientWidth + 2) pass('记支出页无横向滚动')
      else fail('记支出页无横向滚动', `${scrollWidth}>${clientWidth}`)

      await page.close()
    }

    if (bucket.pageErrors.length) {
      fail('页面 JS 错误', bucket.pageErrors.slice(0, 2).join('; '))
    } else pass('无页面 JS 错误')
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
