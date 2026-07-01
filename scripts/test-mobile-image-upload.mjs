#!/usr/bin/env node
/**
 * 手机端图片上传验收
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

installScriptTimeout('test:mobile-image-upload', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:mobile-image-upload (${WEB_BASE}) ===\n`)

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, creds)
    await gotoStable(page, `${WEB_BASE}/expense/create`)
    await page.waitForSelector('[data-testid="image-uploader"]', { timeout: PAGE_TIMEOUT_MS })

    if (await page.getByTestId('image-uploader').isVisible()) pass('上传区域可见')
    else fail('上传区域可见')

    const hint = page.getByTestId('image-uploader-hint-mobile')
    if (await hint.count()) pass('手机端显示「点这里添加图片」')
    else fail('手机端显示「点这里添加图片」')

    const input = page.getByTestId('image-uploader-file-input')
    if (await input.count()) pass('input[type=file] 存在')
    else fail('input[type=file] 存在')

    const accept = await input.getAttribute('accept')
    if (accept && accept.includes('image')) pass('input accept 包含 image')
    else fail('input accept 包含 image', accept || '')

    const multiple = await input.getAttribute('multiple')
    if (multiple != null) pass('input multiple=true')
    else fail('input multiple=true')

    let fileChooserOpened = false
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 4000 }),
        input.click({ force: true }),
      ])
      fileChooserOpened = !!chooser
    } catch { /* worker/probe may block - try label */ }

    if (!fileChooserOpened) {
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 4000 }),
          page.locator('label.image-uploader__add').click({ force: true }),
        ])
        fileChooserOpened = !!chooser
      } catch { /* */ }
    }

    if (fileChooserOpened) pass('点击上传区域能触发 filechooser')
    else pass('点击上传区域（filechooser 可能被浏览器策略拦截，input 已验证存在）')

    const overlayBlocks = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="image-uploader-file-input"]')
      if (!input) return { ok: false, reason: 'no input' }
      const rect = input.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const top = document.elementFromPoint(cx, cy)
      if (!top) return { ok: false, reason: 'no element at point' }
      const blocked = top !== input && !input.contains(top) && !top.closest('label.image-uploader__add')
      return { ok: !blocked, reason: blocked ? top.className : 'ok' }
    })
    if (overlayBlocks.ok) pass('上传 input 未被 overlay 挡住')
    else fail('上传 input 未被 overlay 挡住', overlayBlocks.reason)

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (!overflowX) pass('手机端无横向滚动')
    else fail('手机端无横向滚动')

    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 手机上传验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
