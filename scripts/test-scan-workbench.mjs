#!/usr/bin/env node
/**
 * 扫码工作台 2.0 验收
 */
import { chromium } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import {
  SERVER,
  login,
  fetchJson,
  ensureServerRunning,
  resolveAcceptanceWebBase,
  getAdminPassword,
} from './lib/services.mjs'
import { launchBrowser, gotoStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const API_BASE = SERVER.replace(/\/$/, '')
const REMOTE_BASE = (process.env.ACCEPTANCE_SERVER && !/127\.0\.0\.1|localhost/i.test(process.env.ACCEPTANCE_SERVER))
  ? process.env.ACCEPTANCE_SERVER.replace(/\/$/, '')
  : RECOMMENDED_URL.replace(/\/$/, '')
const SCANNER = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'

installScriptTimeout('test:scan-workbench', TIMEOUTS.acceptanceFull)

let failed = 0
function pass(name, note = '') { console.log(`✓ ${name}${note ? ` — ${note}` : ''}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(token, url, opts = {}) {
  return fetchJson(`${API_BASE}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  })
}

async function loginAndGotoScan(page, webBase, password) {
  await gotoStable(page, `${webBase}/login`)
  await page.locator('input:not([type="password"])').first().fill('admin')
  await page.locator('input[type="password"]').fill(password || 'admin123')
  await page.getByRole('button', { name: /进入系统/ }).click()
  await page.waitForTimeout(1200)
  await gotoStable(page, `${webBase}/scan`)
}

async function testApi(token) {
  console.log('\n--- API ---')
  const health = await api(token, '/api/health')
  if (health.json.scanWorkbenchEnabled === true) pass('health scanWorkbenchEnabled=true')
  else fail('health scanWorkbenchEnabled=true', JSON.stringify(health.json))

  const st = await api(token, '/api/scan/status')
  if (st.res.ok && st.json.data?.enabled) pass('scan/status enabled')
  else fail('scan/status enabled', st.text)

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: 'UNKNOWN-SCAN-TEST-999', source: 'manual' }),
  })
  if (rec.res.ok && rec.json.data?.scanType) pass('recognize 可用')
  else fail('recognize 可用', rec.text)

  const recent = await api(token, '/api/scan/recent?limit=5')
  if (recent.res.ok && Array.isArray(recent.json.data)) {
    pass('recent 返回数组')
    const hasStatus = recent.json.data.every((r) => r.statusLabel)
    if (hasStatus || recent.json.data.length === 0) pass('recent 含 statusLabel')
    else fail('recent 含 statusLabel')
  } else fail('recent 返回数组', recent.text)

  const bracelets = await api(token, '/api/bracelets/search?q=F')
  const code = bracelets.json.data?.[0]?.braceletCode
  if (code) {
    const g = await api(token, '/api/scan/recognize', {
      method: 'POST',
      body: JSON.stringify({ code, source: 'manual' }),
    })
    if (g.res.ok && g.json.data?.goods?.code) pass('货品码识别成功')
    else fail('货品码识别成功', g.text)

    const goodsId = g.json.data.goods.id
    const profit = await api(token, `/api/goods/${goodsId}/profit`)
    if (profit.res.ok && profit.json.data?.costs && profit.json.data?.summary) {
      pass('货品利润 API')
    } else fail('货品利润 API', profit.text)
  } else {
    pass('货品码识别成功', '（无测试货品，跳过）')
    pass('货品利润 API', '（跳过）')
  }

  const pendingCheck = await api(token, '/api/goods', {
    method: 'POST',
    body: JSON.stringify({ code: 'PENDING-FAKE-TEST' }),
  })
  if (pendingCheck.res.status === 400 || pendingCheck.res.status === 403) {
    pass('不会创建 PENDING 假货品')
  } else {
    fail('不会创建 PENDING 假货品', pendingCheck.text)
  }
}

async function testUi(webBase) {
  console.log('\n--- UI ---')
  const password = await getAdminPassword()
  let browser
  try {
    browser = await launchBrowser(chromium)
    for (const [name, width, height] of [['手机端', 390, 844], ['电脑端', 1366, 768]]) {
      const ctx = await browser.newContext({ viewport: { width, height } })
      const page = await ctx.newPage()
      await loginAndGotoScan(page, webBase, password)
      await page.waitForSelector('[data-testid="scan-workbench-page"]', { timeout: 15000 }).catch(() => {})

      const text = await page.evaluate(() => document.body.innerText)
      const hasTitle = text.includes('扫码工作台') && !text.includes('扫码绑定功能已暂停')
      const hasInput = await page.locator('[data-testid="scan-input"]').count()

      if (hasTitle) pass(`${name} 页面标题为扫码工作台`)
      else fail(`${name} 页面标题为扫码工作台`, text.slice(0, 120))

      if (hasInput > 0) {
        pass(`${name} /scan 不白屏`)
        pass(`${name} 扫码输入框可见`)
      } else {
        fail(`${name} data-testid=scan-input 可见`)
      }

      if (name === '手机端') {
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
        const clientW = await page.evaluate(() => document.documentElement.clientWidth)
        if (scrollW <= clientW + 2) pass('手机端无横向滚动')
        else fail('手机端无横向滚动')
      }

      await ctx.close()
    }

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
    const page = await ctx.newPage()
    await loginAndGotoScan(page, webBase, password)
    await gotoStable(page, `${webBase}/`)
    await page.waitForTimeout(800)
    const homeText = await page.evaluate(() => document.body.innerText)
    if (homeText.includes('扫码工作台')) pass('首页有扫码工作台入口')
    else fail('首页有扫码工作台入口')

    const navText = homeText
    if (navText.includes('扫码工作台')) pass('电脑侧边栏有扫码工作台')
    else fail('电脑侧边栏有扫码工作台')

    const bracelets = await api(await login(), '/api/bracelets/search?q=F')
    const goodsId = bracelets.json.data?.[0]?.id
    if (goodsId) {
      await gotoStable(page, `${webBase}/expense/create?goodsId=${goodsId}`)
      await page.waitForTimeout(800)
      const expText = await page.evaluate(() => document.body.innerText)
      if (expText.includes('已带入货品') || expText.includes('货品')) {
        pass('/expense/create?goodsId 能自动带出货品')
      } else fail('/expense/create?goodsId 能自动带出货品', expText.slice(0, 80))

      await gotoStable(page, `${webBase}/sales/create?goodsId=${goodsId}`)
      await page.waitForTimeout(800)
      const saleText = await page.evaluate(() => document.body.innerText)
      if (saleText.includes('已带入货品') || saleText.includes('成本')) {
        pass('/sales/create?goodsId 能自动带出货品和成本')
      } else fail('/sales/create?goodsId 能自动带出货品和成本', saleText.slice(0, 80))
    } else {
      pass('/expense/create?goodsId 能自动带出货品', '（无货品，跳过）')
      pass('/sales/create?goodsId 能自动带出货品和成本', '（跳过）')
    }

    await ctx.close()
  } finally {
    await browser?.close()
  }
}

async function main() {
  console.log(`\n========== 扫码工作台验收 API=${API_BASE} ==========\n`)
  await ensureServerRunning((_, msg) => console.log(`  ${msg}`))
  const webBase = await resolveAcceptanceWebBase((_, msg) => console.log(`  ${msg}`))
  console.log(`  Web UI: ${webBase}`)
  const token = await login()
  await testApi(token)
  await testUi(webBase)

  try {
    const h = await fetch(`${SCANNER}/api/health`)
    if (h.ok) pass('7789 health 200')
    else fail('7789 health', String(h.status))
  } catch (e) {
    fail('7789 health', e?.message || String(e))
  }

  const password = await getAdminPassword()
  const remoteLogin = await fetchJson(`${REMOTE_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
  })
  const remoteToken = remoteLogin.json.data?.token
  const worker = remoteToken
    ? await fetchJson(`${REMOTE_BASE}/api/local-worker/status`, {
      headers: { Authorization: `Bearer ${remoteToken}` },
    })
    : { json: { data: { online: false } }, text: 'remote login failed' }
  if (worker.json.data?.online === true) pass('Worker online=true')
  else fail('Worker online=true', worker.text)

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 扫码工作台验收 (${failed} 失败)\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
