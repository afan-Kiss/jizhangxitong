#!/usr/bin/env node
/**
 * 响应式布局验收：手机 / 平板 / 电脑 viewport
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import {
  PAGE_TIMEOUT_MS,
  SCRIPT_TIMEOUT_MS,
  VIEWPORT_TIMEOUT_MS,
  FAIL_PATTERNS,
  installScriptTimeout,
  launchBrowser,
  gotoStable,
  attachPageDiagnostics,
  dumpDiagnostics,
  withTimeout,
} from './lib/playwright-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')
const reportsDir = path.join(ROOT, 'reports')

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, desktop: false },
  { name: 'tablet', width: 768, height: 1024, desktop: false },
  { name: 'laptop', width: 1366, height: 768, desktop: true },
  { name: 'desktop', width: 1920, height: 1080, desktop: true },
]

function readAdminPassword() {
  const file = path.join(ROOT, 'secrets/initial-admin-password.txt')
  if (!fs.existsSync(file)) return 'admin123'
  return fs.readFileSync(file, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim() || 'admin123'
}

async function login(page, password) {
  await gotoStable(page, `${BASE}/login`)
  const pwd = page.locator('input[type="password"]')
  if (await pwd.count()) {
    await page.locator('input:not([type="password"])').first().fill('admin')
    await pwd.fill(password)
    await page.getByRole('button', { name: /进入系统|登录/ }).click()
    await page.waitForTimeout(1200)
  }
}

async function assertNoOverflow(page) {
  const overflow = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth
    const cw = document.documentElement.clientWidth
    return { sw, cw, ok: sw <= cw + 2 }
  })
  if (!overflow.ok) {
    throw new Error(`横向溢出 scrollWidth=${overflow.sw} clientWidth=${overflow.cw}`)
  }
}

async function runViewport(browser, vp, password) {
  return withTimeout(runViewportInner(browser, vp, password), VIEWPORT_TIMEOUT_MS * 4, `viewport ${vp.name}`)
}

async function runViewportInner(browser, vp, password) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await context.newPage()
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [] }
  attachPageDiagnostics(page, bucket)
  const results = []

  async function check(name, fn) {
    try {
      await withTimeout(fn(), VIEWPORT_TIMEOUT_MS, `${vp.name}/${name}`)
      results.push({ name: `${vp.name}: ${name}`, ok: true })
      console.log(`✓ [${vp.name}] ${name}`)
    } catch (e) {
      const shot = path.join(reportsDir, `responsive-${vp.name}-${name.replace(/\s+/g, '-')}.png`)
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
      results.push({ name: `${vp.name}: ${name}`, ok: false, detail: e.message, shot })
      console.error(`✗ [${vp.name}] ${name} — ${e.message}`)
      dumpDiagnostics({ ...bucket, shot })
    }
  }

  await check('login 不是白屏', async () => {
    await gotoStable(page, `${BASE}/login`)
    const text = await page.evaluate(() => document.body?.innerText?.trim() || '')
    if (!text.includes('和田玉')) throw new Error('登录页内容为空')
    await assertNoOverflow(page)
  })

  await login(page, password)

  await check('首页不是白屏', async () => {
    await gotoStable(page, `${BASE}/`)
    const text = await page.evaluate(() => document.body?.innerText?.trim() || '')
    if (!text.includes('经营总览') && !text.includes('今日支出')) {
      throw new Error('首页内容异常')
    }
    await assertNoOverflow(page)
  })

  const tabBar = page.locator('[data-testid="mobile-tabbar"]')
  const sidebar = page.locator('[data-testid="desktop-sidebar"]')

  if (vp.desktop) {
    await check('不显示底部 TabBar', async () => {
      if (await tabBar.isVisible().catch(() => false)) throw new Error('TabBar 仍可见')
    })
    await check('显示左侧 Sidebar', async () => {
      if (!(await sidebar.isVisible())) throw new Error('Sidebar 不可见')
    })
  } else {
    await check('显示底部 TabBar', async () => {
      await gotoStable(page, `${BASE}/`)
      if (!(await tabBar.isVisible())) throw new Error('TabBar 不可见')
    })
    await check('不显示 Sidebar', async () => {
      if (await sidebar.isVisible().catch(() => false)) throw new Error('Sidebar 不应显示')
    })
  }

  await check('Worker 状态可见', async () => {
    await gotoStable(page, `${BASE}/`)
    const text = await page.evaluate(() => document.body?.innerText || '')
    if (!/本地助手|公司电脑/.test(text)) throw new Error('未见 Worker 状态文案')
  })

  if (vp.desktop) {
    await check('记支出页两栏布局', async () => {
      await gotoStable(page, `${BASE}/expense/create`)
      const layout = await page.locator('[data-testid="expense-create-layout"]').evaluate((el) => {
        const style = getComputedStyle(el)
        return { flexDirection: style.flexDirection }
      })
      if (layout.flexDirection !== 'row') throw new Error(`flexDirection=${layout.flexDirection}`)
    })

    await check('导出页按钮可见', async () => {
      await gotoStable(page, `${BASE}/expense/export`)
      const btn = page.locator('[data-testid="export-btn"]')
      await btn.waitFor({ state: 'visible', timeout: 10000 })
      const box = await btn.boundingBox()
      if (!box || box.y + box.height > vp.height) throw new Error('导出按钮不在可视区域')
    })
  }

  for (const msg of [...bucket.consoleErrors, ...bucket.pageErrors, ...bucket.failedRequests]) {
    if (FAIL_PATTERNS.some((p) => p.test(msg))) {
      results.push({ name: `${vp.name}: 控制台`, ok: false, detail: msg })
      console.error(`✗ [${vp.name}] 控制台 — ${msg}`)
    }
  }

  await context.close()
  return results
}

installScriptTimeout('test:responsive', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  console.log(`\n========== 响应式验收 (${BASE}) ==========`)
  console.log(`单页 ${PAGE_TIMEOUT_MS / 1000}s，单 viewport ${VIEWPORT_TIMEOUT_MS / 1000}s\n`)
  fs.mkdirSync(reportsDir, { recursive: true })
  const password = readAdminPassword()

  let browser
  const all = []

  try {
    browser = await launchBrowser(chromium)
    for (const vp of VIEWPORTS) {
      all.push(...await runViewport(browser, vp, password))
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  const failed = all.filter((r) => !r.ok)
  console.log(`\n=== 结果: ${all.length - failed.length}/${all.length} 通过 ===`)
  if (failed.length) {
    failed.forEach((f) => console.error(`  - ${f.name}: ${f.detail || ''}`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('test:responsive 异常:', e.message || e)
  process.exit(1)
})
