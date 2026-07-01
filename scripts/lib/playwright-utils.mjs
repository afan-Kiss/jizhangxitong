#!/usr/bin/env node
/**
 * Playwright 测试公共：超时、浏览器生命周期
 */
import { installScriptTimeout as installTimeout, DEFAULT_SCRIPT_TIMEOUT_MS } from './script-timeout.mjs'

export const PAGE_TIMEOUT_MS = Number(process.env.PW_PAGE_TIMEOUT_MS || 30000)
export const SCRIPT_TIMEOUT_MS = Number(process.env.PW_SCRIPT_TIMEOUT_MS || DEFAULT_SCRIPT_TIMEOUT_MS)
export const VIEWPORT_TIMEOUT_MS = Number(process.env.PW_VIEWPORT_TIMEOUT_MS || 30000)

export function installScriptTimeout(label, ms = SCRIPT_TIMEOUT_MS) {
  return installTimeout(label, ms)
}

export const FAIL_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /MIME type.*text\/html/i,
  /Loading chunk .* failed/i,
  /initSession is not a function/i,
  /Cannot read properties of undefined/i,
  /Importing a module script failed/i,
]

export async function launchBrowser(chromium, ms = 45000) {
  const opts = { headless: true, timeout: ms }
  return withTimeout((async () => {
    for (const channel of ['msedge', 'chrome']) {
      try {
        return await chromium.launch({ ...opts, channel })
      } catch { /* next */ }
    }
    return chromium.launch(opts)
  })(), ms, '启动浏览器')
}

export async function gotoStable(page, url, label = url) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: PAGE_TIMEOUT_MS,
  })
  await page.waitForSelector('#app', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(400)
  return response
}

/** 等待登录页关键元素就绪（轮询，区分晚渲染与真白屏） */
export async function waitForLoginPage(page, timeoutMs = PAGE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastState = { textLen: 0, hasInputs: false, hasBrand: false }

  while (Date.now() < deadline) {
    await page.waitForSelector('#app', { timeout: Math.min(5000, deadline - Date.now()) }).catch(() => {})

    lastState = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="login-page"]') || document.querySelector('.login-page')
      const user = document.querySelector('[data-testid="login-page"] input:not([type="password"])')
        || document.querySelector('.login-page input:not([type="password"])')
        || document.querySelector('input:not([type="password"])')
      const pwd = document.querySelector('[data-testid="login-page"] input[type="password"]')
        || document.querySelector('.login-page input[type="password"]')
        || document.querySelector('input[type="password"]')
      const submit = document.querySelector('[data-testid="login-submit"]')
        || Array.from(document.querySelectorAll('button')).find((b) => /进入系统|登录/.test(b.textContent || ''))
      const text = (root || document.body)?.textContent?.trim() || ''
      const hasBrand = /和田玉|用户名|密码|进入系统|项目资金支出记录/.test(text)
      const vis = (el) => {
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }
      return {
        textLen: text.length,
        hasBrand,
        hasInputs: vis(user) && vis(pwd) && !!submit,
        hasTestId: !!document.querySelector('[data-testid="login-page"]'),
      }
    })

    if (lastState.hasBrand && lastState.hasInputs) return lastState

    await page.waitForTimeout(250)
  }

  throw new Error(
    `登录页关键元素未就绪（brand=${lastState.hasBrand} inputs=${lastState.hasInputs} textLen=${lastState.textLen}）`,
  )
}

/** 打开登录页并等待就绪；mobile 可 refresh 一次 */
export async function gotoLoginStable(page, url, { retryOnBlank = false } = {}) {
  const attempt = async () => {
    await gotoStable(page, url)
    await waitForLoginPage(page, PAGE_TIMEOUT_MS)
  }
  try {
    await attempt()
  } catch (firstErr) {
    if (!retryOnBlank) throw firstErr
    await page.reload({ waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
    await page.waitForSelector('#app', { timeout: 10000 }).catch(() => {})
    await waitForLoginPage(page, PAGE_TIMEOUT_MS)
  }
}

export function attachPageDiagnostics(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => bucket.pageErrors.push(String(err)))
  page.on('requestfailed', (req) => {
    bucket.failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText || 'failed'}`)
  })
}

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)`)), ms)
    }),
  ])
}

export function dumpDiagnostics({ consoleErrors, pageErrors, failedRequests, shot }) {
  if (consoleErrors?.length) console.log('  consoleErrors:', consoleErrors.slice(0, 8))
  if (pageErrors?.length) console.log('  pageErrors:', pageErrors.slice(0, 8))
  if (failedRequests?.length) console.log('  failedRequests:', failedRequests.slice(0, 8))
  if (shot) console.log('  screenshot:', shot)
}
