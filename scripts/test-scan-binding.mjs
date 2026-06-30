#!/usr/bin/env node
/**
 * 扫码绑定一期验收（ hardened ）
 */
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
  const ts = Date.now()

  const unknown = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: `UNKNOWN-TEST-${ts}`, source: 'manual' }),
  })
  if (unknown.res.ok && unknown.json.data?.scanType === 'unknown') {
    pass('unknown 编码不报错')
  } else {
    fail('unknown 编码不报错', unknown.text)
  }

  const goodsA = `HTY-A-${ts}`
  const goodsB = `HTY-B-${ts}`
  for (const [code, label] of [[goodsA, 'A'], [goodsB, 'B']]) {
    const create = await api(token, '/api/goods', {
      method: 'POST',
      body: JSON.stringify({ code, category: '和田玉', name: `测试货品${label}` }),
    })
    if (!create.res.ok) {
      fail(`新建货品 ${label}`, create.text)
      return
    }
  }
  pass('新建货品并绑定扫码码')

  const goodsAId = (await api(token, `/api/goods/by-code/${encodeURIComponent(goodsA)}`)).json.data.id
  const goodsBId = (await api(token, `/api/goods/by-code/${encodeURIComponent(goodsB)}`)).json.data.id

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: goodsA, source: 'manual' }),
  })
  if (rec.res.ok && rec.json.data?.matched && rec.json.data?.goods?.id === goodsAId) {
    pass('货品码识别 PASS')
  } else {
    fail('货品码识别 PASS', rec.text)
  }

  const orderNo = `P${ts}9988776655`
  const orderWithGoods = await api(token, '/api/scan/orders/simple', {
    method: 'POST',
    body: JSON.stringify({ orderNo, goodsId: goodsAId, saleAmount: 100 }),
  })
  if (orderWithGoods.res.ok && orderWithGoods.json.data?.orderNo === orderNo) {
    pass('订单绑定货品 PASS')
  } else {
    fail('订单绑定货品 PASS', orderWithGoods.text)
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

  const logistics = `SF${ts}`.slice(0, 14)
  await api(token, '/api/scan/bind', {
    method: 'POST',
    body: JSON.stringify({
      scanCode: logistics,
      scanType: 'logistics_no',
      orderId: orderWithGoods.json.data.id,
      source: 'manual',
    }),
  })
  const logRec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: logistics, source: 'manual' }),
  })
  if (logRec.res.ok && logRec.json.data?.matched) {
    pass('物流单号识别 PASS')
  } else {
    fail('物流单号识别 PASS', logRec.text)
  }

  // 纯数字物流单号兜底
  const numericLogistics = `${ts}1234567890`.slice(0, 14)
  const numericOrderNo = `P${ts}1122334455`
  const saleForNumeric = await api(token, '/api/scan/orders/simple', {
    method: 'POST',
    body: JSON.stringify({ orderNo: numericOrderNo, goodsId: goodsBId, logisticsNo: numericLogistics }),
  })
  if (!saleForNumeric.res.ok) {
    fail('创建纯数字物流订单', saleForNumeric.text)
  } else {
    const numRec = await api(token, '/api/scan/recognize', {
      method: 'POST',
      body: JSON.stringify({ code: numericLogistics, source: 'manual' }),
    })
    if (numRec.res.ok && numRec.json.data?.matched && numRec.json.data?.order?.logisticsNo === numericLogistics) {
      pass('纯数字物流单号兜底匹配 PASS')
    } else {
      fail('纯数字物流单号兜底匹配 PASS', numRec.text)
    }
  }

  // 无货品订单 → 不产生 PENDING 假货品
  const draftOrderNo = `P${ts}5566778899`
  const draft = await api(token, '/api/scan/orders/simple', {
    method: 'POST',
    body: JSON.stringify({ orderNo: draftOrderNo }),
  })
  if (draft.res.ok && draft.json.data?.isDraft) {
    pass('创建无货品订单不会产生 PENDING 假货品')
  } else {
    fail('创建无货品订单不会产生 PENDING 假货品', draft.text)
  }
  const pendingLookup = await api(token, `/api/goods/by-code/${encodeURIComponent(`PENDING-${draftOrderNo.slice(-8)}`)}`)
  if (pendingLookup.res.status === 404) {
    pass('无 PENDING 占位货品写入 Bracelet 表')
  } else {
    fail('无 PENDING 占位货品写入 Bracelet 表', pendingLookup.text)
  }

  // 扫订单后绑定已有货品
  const bindDraft = await api(token, '/api/scan/orders/bind-goods', {
    method: 'POST',
    body: JSON.stringify({ orderNo: draftOrderNo, goodsId: goodsBId }),
  })
  if (bindDraft.res.ok && bindDraft.json.data?.order?.braceletCode === goodsB) {
    pass('扫订单后绑定已有货品 PASS')
  } else {
    fail('扫订单后绑定已有货品 PASS', bindDraft.text)
  }

  // unknown 绑定已有货品
  const unknownCode = `CUSTOM-${ts}`
  await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: unknownCode, source: 'manual' }),
  })
  const bindUnknown = await api(token, '/api/scan/bind', {
    method: 'POST',
    body: JSON.stringify({ scanCode: unknownCode, scanType: 'unknown', goodsId: goodsAId }),
  })
  if (bindUnknown.res.ok && bindUnknown.json.data?.goods?.id === goodsAId) {
    pass('扫 unknown 后绑定已有货品 PASS')
  } else {
    fail('扫 unknown 后绑定已有货品 PASS', bindUnknown.text)
  }

  const recent = await api(token, '/api/scan/recent?limit=10')
  const statuses = recent.json.data?.map((r) => r.status) || []
  const hasRecognized = statuses.includes('recognized')
  const hasBound = statuses.includes('bound')
  const hasPending = statuses.includes('pending')
  if (recent.res.ok && hasRecognized && (hasBound || hasPending)) {
    pass('最近扫码记录能区分只是扫过/已绑定/待绑定')
  } else {
    fail('最近扫码记录能区分只是扫过/已绑定/待绑定', JSON.stringify(statuses))
  }
  if (recent.res.ok && recent.json.data?.some((r) => r.statusLabel)) {
    pass('最近扫码记录接口 PASS')
  } else {
    fail('最近扫码记录接口 PASS', recent.text)
  }

  // 支出改绑 A → B
  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 20,
      expenseType: '其他支出',
      paySource: '老板付款',
      occurredAt: new Date().toISOString(),
      expenseSummary: 'scan-binding-rebind-test',
    }),
  })
  if (!exp.res.ok) {
    fail('创建测试支出', exp.text)
    return
  }
  const expenseId = exp.json.data.id
  await api(token, `/api/scan/expenses/${expenseId}/bind-goods`, {
    method: 'POST',
    body: JSON.stringify({ goodsId: goodsAId }),
  })
  const costA1 = Number((await api(token, `/api/goods/${goodsAId}`)).json.data.costTotal)
  const costB0 = Number((await api(token, `/api/goods/${goodsBId}`)).json.data.costTotal)

  await api(token, `/api/scan/expenses/${expenseId}/bind-goods`, {
    method: 'POST',
    body: JSON.stringify({ goodsId: goodsBId }),
  })
  const costA2 = Number((await api(token, `/api/goods/${goodsAId}`)).json.data.costTotal)
  const costB1 = Number((await api(token, `/api/goods/${goodsBId}`)).json.data.costTotal)

  if (costA2 < costA1 && costB1 >= costB0 + 20) {
    pass('支出从 A 改绑 B 后 A/B costTotal 都正确刷新 PASS')
  } else {
    fail('支出从 A 改绑 B 后 A/B costTotal 都正确刷新 PASS', `A:${costA1}->${costA2} B:${costB0}->${costB1}`)
  }

  await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: 'scan-binding-test cleanup' }),
  }).catch(() => {})
}

async function testUi() {
  console.log('\n--- 页面验收 ---')
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
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientW = await page.evaluate(() => document.documentElement.clientWidth)
      const noHScroll = scrollW <= clientW + 2

      if (hasPage && hasInput && text.includes('扫码绑定中心')) {
        pass(`${name} /scan 路由页面正常`)
      } else {
        fail(`${name} /scan 路由页面正常`, `url=${page.url()}`)
      }
      if (name === '手机端' && noHScroll) {
        pass('手机端扫码页面无横向滚动 PASS')
      } else if (name === '手机端') {
        fail('手机端扫码页面无横向滚动 PASS', `scroll=${scrollW} client=${clientW}`)
      }
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

async function testWorkerOnline(token) {
  const st = await api(token, '/api/local-worker/status')
  if (st.res.ok && st.json.data?.online === true) {
    pass('Worker online=true')
  } else {
    fail('Worker online=true', st.text)
  }
}

async function main() {
  console.log(`\n========== 扫码绑定验收 (${BASE}) ==========\n`)
  await ensureServerRunning((_, msg) => console.log(`  ${msg}`))
  await testDetectRules()

  const token = await login()
  await testApiFlow(token)
  await testUi()
  await testWorkerOnline(token)

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
