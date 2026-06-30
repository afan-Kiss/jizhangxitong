#!/usr/bin/env node
/**
 * 扫码绑定一期验收
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  detectScanCodeType,
  normalizeScanInput,
} from '@jade-account/shared'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { login, SERVER, fetchJson, ensureServerRunning, getAdminPassword } from './lib/services.mjs'
import {
  launchBrowser,
  gotoStable,
} from './lib/playwright-utils.mjs'
import { installScriptTimeout as scriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = (process.env.ACCEPTANCE_SERVER || SERVER || RECOMMENDED_URL).replace(/\/$/, '')

/** 前端页面基址（生产在 /account/ 子路径） */
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

function assertDetect(input, expectedType, expectedCode) {
  const r = detectScanCodeType(input)
  if (r.scanType !== expectedType || r.normalizedCode !== expectedCode) {
    fail(`识别 ${JSON.stringify(input)}`, `got ${r.scanType}/${r.normalizedCode}, want ${expectedType}/${expectedCode}`)
    return
  }
  pass(`识别 ${expectedType}: ${expectedCode || '(empty)'}`)
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

async function testDetectRules() {
  console.log('\n--- 扫码识别规则 ---')
  assertDetect('P798012984411219551', 'order_no', 'P798012984411219551')
  assertDetect('SF5117802909776', 'logistics_no', 'SF5117802909776')
  assertDetect('HTY-2026-0001', 'goods_code', 'HTY-2026-0001')
  assertDetect('780290', 'unknown', '780290')
  assertDetect('', 'unknown', '')
  assertDetect('  SF5117802909776  ', 'logistics_no', 'SF5117802909776')
  assertDetect(normalizeScanInput('  p798012984411219551  '), 'order_no', 'P798012984411219551')
}

async function testApiFlow(token) {
  console.log('\n--- API 流程 ---')

  const unknown = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: 'UNKNOWN-TEST-001', source: 'manual' }),
  })
  if (unknown.res.ok && unknown.json.data?.scanType === 'unknown') {
    pass('unknown 编码不报错')
  } else {
    fail('unknown 编码不报错', unknown.text)
  }

  const goodsCode = `HTY-TEST-${Date.now()}`
  const create = await api(token, '/api/goods', {
    method: 'POST',
    body: JSON.stringify({ code: goodsCode, category: '和田玉', name: '测试货品' }),
  })
  if (!create.res.ok) {
    fail('新建货品并绑定扫码码', create.text)
    return
  }
  pass('新建货品并绑定扫码码')
  const goodsId = create.json.data.id

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: goodsCode, source: 'manual' }),
  })
  if (rec.res.ok && rec.json.data?.matched && rec.json.data?.goods?.id === goodsId) {
    pass('货品码识别 PASS')
  } else {
    fail('货品码识别 PASS', rec.text)
  }

  const orderNo = `P${Date.now()}9988776655`
  const order = await api(token, '/api/scan/orders/simple', {
    method: 'POST',
    body: JSON.stringify({ orderNo, goodsId, saleAmount: 100 }),
  })
  if (order.res.ok && order.json.data?.orderNo === orderNo) {
    pass('订单绑定货品 PASS')
  } else {
    fail('订单绑定货品 PASS', order.text)
  }

  const orderRec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: orderNo, source: 'manual' }),
  })
  if (orderRec.res.ok && orderRec.json.data?.scanType === 'order_no') {
    pass('订单号识别 PASS')
  } else {
    fail('订单号识别 PASS', orderRec.text)
  }

  const logistics = `SF${Date.now()}`.slice(0, 14)
  await api(token, '/api/scan/bind', {
    method: 'POST',
    body: JSON.stringify({
      scanCode: logistics,
      scanType: 'logistics_no',
      orderId: order.json.data.id,
      source: 'manual',
    }),
  })
  const logRec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: logistics, source: 'manual' }),
  })
  if (logRec.res.ok && logRec.json.data?.scanType === 'logistics_no') {
    pass('物流单号识别 PASS')
  } else {
    fail('物流单号识别 PASS', logRec.text)
  }

  const recent = await api(token, '/api/scan/recent?limit=5')
  if (recent.res.ok && Array.isArray(recent.json.data) && recent.json.data.length > 0) {
    pass('最近扫码记录接口 PASS')
  } else {
    fail('最近扫码记录接口 PASS', recent.text)
  }

  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 12.34,
      expenseType: '其他支出',
      paySource: '老板付款',
      occurredAt: new Date().toISOString(),
      expenseSummary: 'scan-binding-test',
    }),
  })
  if (!exp.res.ok) {
    fail('创建测试支出', exp.text)
    return
  }
  const expenseId = exp.json.data.id
  const bindExp = await api(token, `/api/scan/expenses/${expenseId}/bind-goods`, {
    method: 'POST',
    body: JSON.stringify({ goodsId }),
  })
  if (!bindExp.res.ok) {
    fail('支出绑定货品', bindExp.text)
    return
  }
  const cost = await api(token, `/api/goods/${goodsId}`)
  if (cost.res.ok && Number(cost.json.data.costTotal) >= 12.34) {
    pass('支出绑定货品后 cost_total 更新 PASS')
  } else {
    fail('支出绑定货品后 cost_total 更新 PASS', cost.text)
  }

  await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: 'scan-binding-test cleanup' }),
  }).catch(() => {})
}

async function testUi() {
  console.log('\n--- 页面白屏 ---')
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
      const hasPage = await page.locator('[data-testid="scan-binding-page"]').isVisible()
      const hasInput = await page.locator('[data-testid="scan-input"]').isVisible()
      const text = await page.evaluate(() => document.body.innerText)
      if (hasPage && hasInput && text.includes('扫码绑定中心')) {
        pass(`${name}扫码绑定页面无白屏 PASS`)
      } else {
        fail(`${name}扫码绑定页面无白屏 PASS`, `url=${page.url()} hasPage=${hasPage}`)
      }
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

async function main() {
  console.log(`\n========== 扫码绑定验收 (${BASE}) ==========\n`)
  await ensureServerRunning((_, msg) => console.log(`  ${msg}`))
  await testDetectRules()

  const token = await login()
  await testApiFlow(token)
  await testUi()

  try {
    const scanner = await fetch(`${process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'}/api/health`)
    if (scanner.ok) pass('扫码枪 7789 health 200')
    else fail('扫码枪 7789 health', String(scanner.status))
  } catch (e) {
    fail('扫码枪 7789 health', e?.message || String(e))
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 扫码绑定验收${failed ? '未' : ''}通过 (${failed} 失败)\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
