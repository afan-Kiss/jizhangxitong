#!/usr/bin/env node
/**
 * 真实浏览器白屏检测（Playwright + 手机 viewport）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, devices } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')
const reportsDir = path.join(ROOT, 'reports')

const FAIL_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /MIME type.*text\/html/i,
  /Loading chunk .* failed/i,
  /initSession is not a function/i,
  /Cannot read properties of undefined/i,
  /Importing a module script failed/i,
]

function readAdminPassword() {
  const file = path.join(ROOT, 'secrets/initial-admin-password.txt')
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim() || ''
}

async function launchBrowser() {
  const opts = { headless: true }
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ ...opts, channel })
    } catch { /* try next */ }
  }
  return chromium.launch(opts)
}

async function checkPage(page, label, url, checks = {}) {
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText || 'failed'}`)
  })

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)

  const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '')
  const appHtml = await page.evaluate(() => document.getElementById('app')?.innerHTML?.trim() || '')
  const appText = await page.evaluate(() => document.getElementById('app')?.innerText?.trim() || '')

  const issues = []
  if (!bodyText) issues.push('body.innerText 为空')
  if (!appHtml) issues.push('#app 内容为空')
  if (checks.expectText) {
    const found = checks.expectText.some((t) => bodyText.includes(t) || appText.includes(t))
    if (!found) issues.push(`未见预期文案: ${checks.expectText.join(' / ')}`)
  }

  for (const msg of [...consoleErrors, ...pageErrors, ...failedRequests]) {
    if (FAIL_PATTERNS.some((p) => p.test(msg))) issues.push(msg)
  }

  for (const req of failedRequests) {
    if (/\.js|\.css|assets\//i.test(req)) issues.push(`资源失败: ${req}`)
  }

  if (response && response.status() >= 400) issues.push(`HTTP ${response.status()}`)

  const shot = path.join(reportsDir, `white-screen-${label}.png`)
  if (issues.length) {
    fs.mkdirSync(reportsDir, { recursive: true })
    await page.screenshot({ path: shot, fullPage: true })
  }

  return { issues, bodyText: bodyText.slice(0, 200), consoleErrors, pageErrors, failedRequests, shot }
}

async function main() {
  console.log(`\n========== 白屏浏览器验收 (${BASE}) ==========\n`)
  fs.mkdirSync(reportsDir, { recursive: true })

  const browser = await launchBrowser()
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' })
  const page = await context.newPage()

  let failed = 0

  const home = await checkPage(page, 'home', `${BASE}/`, {
    expectText: ['和田玉', '经营总览', '登录', '进入系统'],
  })
  console.log('[home]', home.issues.length ? 'FAIL' : 'OK', home.bodyText.slice(0, 80))
  if (home.issues.length) {
    failed++
    for (const i of home.issues) console.log('  -', i)
    if (home.consoleErrors.length) console.log('  console:', home.consoleErrors.slice(0, 5))
    console.log('  screenshot:', home.shot)
  }

  const login = await checkPage(page, 'login', `${BASE}/login`, {
    expectText: ['和田玉', '用户名', '密码', '进入系统'],
  })
  console.log('[login]', login.issues.length ? 'FAIL' : 'OK', login.bodyText.slice(0, 120))
  if (login.issues.length) {
    failed++
    for (const i of login.issues) console.log('  -', i)
    console.log('  screenshot:', login.shot)
  }

  // 登录页交互
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const pwdDefault = await page.inputValue('input[type="password"]')
  if (pwdDefault) {
    failed++
    console.log('FAIL 密码框默认非空')
  } else {
    console.log('OK 密码框默认为空')
  }

  await page.getByRole('button', { name: /进入系统/ }).click()
  await page.waitForTimeout(800)
  const emptyTip = await page.evaluate(() =>
    [...document.querySelectorAll('.van-toast')].map((el) => el.textContent?.trim()).filter(Boolean),
  )
  if (!emptyTip.some((t) => t.includes('请输入用户名和密码'))) {
    failed++
    console.log('FAIL 空密码无提示', emptyTip)
  } else {
    console.log('OK 空密码提示正确')
  }

  await page.fill('input[type="password"]', 'wrong-password')
  await page.getByRole('button', { name: /进入系统/ }).click()
  await page.waitForTimeout(1200)
  const badTip = await page.evaluate(() =>
    [...document.querySelectorAll('.van-toast')].map((el) => el.textContent?.trim()).filter(Boolean),
  )
  if (!badTip.some((t) => t.includes('用户名或密码错误'))) {
    failed++
    console.log('FAIL 错误密码无提示', badTip)
  } else {
    console.log('OK 错误密码提示正确')
  }

  const adminPwd = readAdminPassword()
  if (adminPwd) {
    await page.fill('input[type="password"]', adminPwd)
    await page.getByRole('button', { name: /进入系统/ }).click()
    await page.waitForURL(/\/account\/?$/, { timeout: 15000 }).catch(() => null)
    await page.waitForTimeout(1500)
    const afterLogin = await page.evaluate(() => document.body.innerText)
    if (!afterLogin.includes('经营总览')) {
      failed++
      console.log('FAIL 登录后未见首页')
    } else {
      console.log('OK 登录成功进入首页')
    }
    const tabVisible = await page.locator('nav.luxury-tabbar').isVisible().catch(() => false)
    console.log(tabVisible ? 'OK 底部导航显示' : 'FAIL 底部导航未显示')
    if (!tabVisible) failed++

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const reloadText = await page.evaluate(() => document.body.innerText)
    if (!reloadText.includes('经营总览')) {
      failed++
      console.log('FAIL 刷新首页白屏')
    } else {
      console.log('OK 刷新首页正常')
    }
  }

  await browser.close()
  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 白屏浏览器验收${failed ? '未' : ''}通过\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
