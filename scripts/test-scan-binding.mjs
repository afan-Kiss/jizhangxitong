#!/usr/bin/env node
/**
 * 扫码绑定暂停页验收（功能已停用，仅验证不白屏与跳转）
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { login, SERVER, fetchJson, ensureServerRunning, getAdminPassword } from './lib/services.mjs'
import { launchBrowser, gotoStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout as scriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = (process.env.ACCEPTANCE_SERVER || SERVER || RECOMMENDED_URL).replace(/\/$/, '')

function accountWebBase() {
  if (/\/account$/i.test(BASE)) return BASE
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BASE)) return `${BASE}/account`
  return BASE.includes('/account') ? BASE : `${BASE}/account`
}

scriptTimeout('test:scan-binding', TIMEOUTS.acceptanceFull)

let failed = 0
function pass(name) { console.log(`✓ ${name}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  })
}

async function testApiPaused(token) {
  console.log('\n--- API 暂停状态 ---')

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: 'TEST-001', source: 'manual' }),
  })
  if (rec.res.status === 503 && rec.json.message?.includes('扫码绑定功能已暂停')) {
    pass('recognize 返回暂停提示')
  } else {
    fail('recognize 返回暂停提示', rec.text)
  }

  const bind = await api(token, '/api/scan/bind', {
    method: 'POST',
    body: JSON.stringify({ scanCode: 'TEST-001' }),
  })
  if (bind.res.status === 503 && bind.json.message?.includes('扫码绑定功能已暂停')) {
    pass('bind 返回暂停提示')
  } else {
    fail('bind 返回暂停提示', bind.text)
  }

  const recent = await api(token, '/api/scan/recent?limit=5')
  if (recent.res.ok && Array.isArray(recent.json.data) && recent.json.data.length === 0) {
    pass('recent 返回空数组')
  } else {
    fail('recent 返回空数组', recent.text)
  }
}

async function testPausePage() {
  console.log('\n--- 暂停页 ---')
  const password = await getAdminPassword()

  let browser
  try {
    browser = await launchBrowser(chromium)
    for (const [name, width, height] of [['手机端', 390, 844], ['电脑端', 1366, 768]]) {
      const ctx = await browser.newContext({ viewport: { width, height } })
      const page = await ctx.newPage()
      await gotoStable(page, `${accountWebBase()}/login`)
      await page.locator('input:not([type="password"])').first().fill('admin')
      await page.locator('input[type="password"]').fill(password || 'admin123')
      await page.getByRole('button', { name: /进入系统/ }).click()
      await page.waitForURL(/\/account\/?$|\/account\/home|\/account\/(?!login)/, { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(800)
      await gotoStable(page, `${accountWebBase()}/scan`)
      await page.waitForSelector('[data-testid="scan-binding-page"]', { timeout: 15000 }).catch(() => {})

      const text = await page.evaluate(() => document.body.innerText)
      const hasPaused = text.includes('扫码绑定功能已暂停')
      const hasInput = await page.locator('[data-testid="scan-input"]').count()
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientW = await page.evaluate(() => document.documentElement.clientWidth)

      if (hasPaused && hasInput === 0) {
        pass(`${name} /account/scan 显示暂停页`)
      } else {
        fail(`${name} /account/scan 显示暂停页`, `paused=${hasPaused} input=${hasInput}`)
      }

      if (name === '手机端' && scrollW <= clientW + 2) {
        pass('手机端扫码页面无横向滚动')
      } else if (name === '手机端') {
        fail('手机端扫码页面无横向滚动', `scroll=${scrollW}`)
      }

      for (const [testid, label] of [
        ['scan-paused-expense-btn', '去记支出'],
        ['scan-paused-sale-btn', '去销售登记'],
        ['scan-paused-bracelet-btn', '去镯子查询'],
      ]) {
        const btn = page.locator(`[data-testid="${testid}"]`)
        if (await btn.isVisible()) pass(`${name} ${label} 按钮可见`)
        else fail(`${name} ${label} 按钮可见`)
      }

      await ctx.close()
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

async function main() {
  console.log(`\n========== 扫码绑定暂停验收 (${BASE}) ==========\n`)
  await ensureServerRunning((_, msg) => console.log(`  ${msg}`))

  const token = await login()
  await testApiPaused(token)
  await testPausePage()

  try {
    const scanner = await fetch(`${process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'}/api/health`)
    if (scanner.ok) pass('扫码枪 7789 health 200')
    else fail('扫码枪 7789 health', String(scanner.status))
  } catch (e) {
    fail('扫码枪 7789 health', e?.message || String(e))
  }

  const worker = await api(token, '/api/local-worker/status')
  if (worker.res.ok && worker.json.data?.online === true) {
    pass('Worker online=true')
  } else {
    fail('Worker online=true', worker.text)
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 扫码绑定暂停验收${failed ? '未' : ''}通过 (${failed} 失败)\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
