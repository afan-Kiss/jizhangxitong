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
