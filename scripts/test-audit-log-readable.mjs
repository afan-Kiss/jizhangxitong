#!/usr/bin/env node
/**
 * 操作日志大白话验收
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  ROOT, SERVER, login, fetchJson, authHeaders, ensureServerRunning, resolveAcceptanceWebBase, getAdminCredentials,
} from './lib/services.mjs'
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

installScriptTimeout('test:audit-log-readable', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  const token = await login(SERVER.replace(/\/$/, ''))
  const today = new Date().toISOString().slice(0, 10)
  const tag = `AUDIT-${Date.now()}`

  console.log(`\n=== test:audit-log-readable (${WEB_BASE}) ===\n`)

  const normal = await fetchJson(`${SERVER.replace(/\/$/, '')}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 88,
      expenseType: '包装耗材',
      businessType: 'normal',
      paySource: '微信',
      occurredAt: today,
      remark: tag,
    }),
  })
  const normalId = normal.json.data?.id
  if (!normalId) fail('创建普通支出', normal.text)
  else pass('创建普通支出')

  const comp = await fetchJson(`${SERVER.replace(/\/$/, '')}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 100,
      expenseType: '客户心理落差补偿',
      businessType: 'customer_compensation',
      paySource: '微信',
      occurredAt: today,
      externalOrderNo: `${tag}-ORDER`,
      remark: tag,
    }),
  })
  const compId = comp.json.data?.id
  if (!compId) fail('创建客户补偿', comp.text)
  else pass('创建客户补偿')

  await fetchJson(`${SERVER.replace(/\/$/, '')}/api/expenses/${normalId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ amount: 100 }),
  })

  const auditSrc = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/server/src/services/audit.service.ts'),
    'utf-8',
  )
  if (auditSrc.includes('上传了') && auditSrc.includes('张凭证图片')) pass('上传凭证日志格式已定义')
  else fail('上传凭证日志格式')

  const detail = await fetchJson(`${SERVER.replace(/\/$/, '')}/api/expenses/${normalId}`, {
    headers: authHeaders(token),
  })
  const logs = detail.json.data?.operationLogs || []
  const texts = logs.map((l) => l.formattedMessage || l.summary || '').join('\n')

  if (texts.includes('添加了一笔') && texts.includes('88')) pass('普通支出日志含金额')
  else fail('普通支出日志', texts.slice(0, 200))

  const compDetail = await fetchJson(`${SERVER.replace(/\/$/, '')}/api/expenses/${compId}`, {
    headers: authHeaders(token),
  })
  const compLogs = (compDetail.json.data?.operationLogs || []).map((l) => l.formattedMessage || l.summary).join('\n')
  if (compLogs.includes('客户补偿') || compLogs.includes('补偿')) pass('客户补偿日志大白话')
  else fail('客户补偿日志', compLogs.slice(0, 200))

  if (texts.includes('把金额从') && texts.includes('改成')) pass('修改金额差异摘要')
  else fail('修改金额差异摘要', texts.slice(0, 200))

  if (!texts.includes('create_expense') && !texts.includes('update_expense')) pass('不显示英文 action code')
  else fail('不显示英文 action code', texts)

  let browser
  try {
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoLoginStable(page, `${WEB_BASE}/login`)
    await page.locator('input:not([type="password"])').first().fill(creds.username)
    await page.locator('input[type="password"]').fill(creds.password)
    await page.getByTestId('login-submit').click()
    await page.waitForTimeout(1000)
    await gotoStable(page, `${WEB_BASE}/expense/${normalId}`)
    await page.waitForSelector('[data-testid="expense-operation-logs"]', { timeout: 15000 })
    const logText = await page.getByTestId('expense-operation-logs').textContent()
    if (logText && !logText.includes('create_expense')) pass('详情页展示 formattedMessage')
    else fail('详情页展示 formattedMessage')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (!overflow) pass('手机端日志卡片不挤爆')
    else fail('手机端日志卡片不挤爆')
    await page.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 操作日志大白话验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
