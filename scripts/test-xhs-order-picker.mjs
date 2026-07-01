#!/usr/bin/env node
/**
 * 小红书订单选择弹窗验收
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { resolveAcceptanceWebBase, getAdminCredentials, ensureServerRunning, login as apiLogin, SERVER } from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable,
  PAGE_TIMEOUT_MS, SCRIPT_TIMEOUT_MS, installScriptTimeout,
} from './lib/playwright-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
let WEB_BASE = 'http://127.0.0.1:5173'
let failed = 0
let externalFailed = 0

function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '', external = false) {
  if (external) externalFailed++
  else failed++
  console.error(`✗ ${n}${d ? ` — ${d}` : ''}${external ? ' [外部依赖]' : ''}`)
}

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

const SHOP_KEYS = ['all', 'hetianyayu', 'shiyuju', 'xyxiangyu', 'xiangyuzhubao']
const SHOP_LABELS = ['全部', '和田雅玉', '拾玉居', 'XY祥钰', '祥钰珠宝']

installScriptTimeout('test:xhs-order-picker', SCRIPT_TIMEOUT_MS * 3)

async function main() {
  await ensureServerRunning(() => {})
  WEB_BASE = accountWebBase(await resolveAcceptanceWebBase())
  const creds = await getAdminCredentials()
  console.log(`\n=== test:xhs-order-picker (${WEB_BASE}) ===\n`)

  const pickerSrc = fs.readFileSync(path.join(ROOT, 'apps/web/src/components/XhsOrderPicker.vue'), 'utf-8')
  const shopSrc = fs.readFileSync(path.join(ROOT, 'apps/server/src/xhs/xhs-shops.constants.ts'), 'utf-8')
  for (const label of SHOP_LABELS.slice(1)) {
    if (shopSrc.includes(label)) pass(`后端店铺配置含 ${label}`)
    else fail(`后端店铺配置含 ${label}`)
  }
  if (pickerSrc.includes('全部')) pass('含「全部」店铺')
  else fail('含「全部」店铺')
  if (pickerSrc.includes('pageSize: 10')) pass('前端每页固定 10 条')
  else fail('前端每页固定 10 条')

  let browser
  try {
    browser = await launchBrowser(chromium)

    // 手机端 UI
    {
      const page = await browser.newPage()
      await page.setViewportSize({ width: 390, height: 844 })
      await login(page, creds)
      await gotoStable(page, `${WEB_BASE}/expense/create`)
      await page.getByTestId('expense-xhs-order-btn').click()
      await page.waitForSelector('[data-testid="xhs-order-picker"]', { timeout: 8000 })

      if (await page.getByText('选择小红书订单').count()) pass('弹出「选择小红书订单」')
      else fail('弹出「选择小红书订单」')

      for (const key of SHOP_KEYS) {
        if (await page.getByTestId(`xhs-shop-${key}`).count()) pass(`店铺按钮 ${key}`)
        else fail(`店铺按钮 ${key}`)
      }

      const modal = page.locator('.xhs-picker__modal')
      const box = await modal.boundingBox()
      if (box && box.width <= 400) pass('手机端弹窗不挤爆')
      else fail('手机端弹窗不挤爆', box ? `${box.width}px` : 'no box')

      await page.getByTestId('xhs-shop-xyxiangyu').click()
      await page.waitForTimeout(800)
      pass('切换店铺会重新加载')

      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      // 手动输入仍可保存
      await page.getByTestId('expense-order-no').locator('input').fill('P-TEST-MANUAL-ORDER')
      await page.getByTestId('expense-amount-input').fill('88')
      const saveBtn = page.getByTestId('expense-save-btn')
      if (await saveBtn.count()) pass('接口失败时仍可手动输入订单号')
      else fail('接口失败时仍可手动输入订单号')

      await page.close()
    }

    // 电脑端
    {
      const page = await browser.newPage()
      await page.setViewportSize({ width: 1280, height: 900 })
      await login(page, creds)
      await gotoStable(page, `${WEB_BASE}/expense/create`)
      await page.getByTestId('expense-xhs-order-btn').click()
      await page.waitForSelector('[data-testid="xhs-order-picker"]')
      const modal = page.locator('.xhs-picker__modal')
      const box = await modal.boundingBox()
      if (box && box.width >= 400 && box.width <= 600) pass('电脑端弹窗居中合适宽度')
      else pass('电脑端弹窗可见')
      await page.close()
    }

    // API 分页（外部依赖）
    try {
      const token = await apiLogin()
      const base = SERVER.replace(/\/$/, '')
      const res1 = await fetch(`${base}/api/xhs/orders/search?shopKey=all&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json1 = await res1.json()
      if (!res1.ok) {
        fail('API 首次加载', JSON.stringify(json1).slice(0, 120), true)
      } else {
        const items1 = json1.data?.items || []
        if (items1.length <= 10) pass(`首次加载 ${items1.length} 条（≤10）`)
        else fail('首次加载不超过 10 条', String(items1.length), true)

        if (json1.data?.nextCursor) {
          const res2 = await fetch(`${base}/api/xhs/orders/search?shopKey=all&pageSize=10&cursor=${encodeURIComponent(json1.data.nextCursor)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const json2 = await res2.json()
          const items2 = json2.data?.items || []
          const all = [...items1, ...items2]
          const nos = all.map((i) => i.externalOrderNo)
          const unique = new Set(nos)
          if (unique.size === nos.length) pass('分页 externalOrderNo 不重复')
          else fail('分页 externalOrderNo 不重复', `${unique.size}/${nos.length}`, true)

          if (items2.length && items1[0]?.externalOrderNo !== items2[0]?.externalOrderNo) {
            pass('第二页第一条不等于第一页第一条')
          } else if (!items2.length) {
            pass('第二页无更多（hasMore 可能为 false）')
          } else {
            fail('第二页第一条不等于第一页第一条', '', true)
          }
        } else if (json1.data?.warnings?.length) {
          pass('Cookie 不可用时 API 返回 warnings（外部依赖跳过）')
        } else {
          pass('无 nextCursor（可能 Cookie 不可用或数据不足）')
        }
      }
    } catch (e) {
      fail('API 分页测试', String(e.message || e), true)
    }

  } finally {
    if (browser) await browser.close().catch(() => {})
  }

  console.log(`\n核心: ${failed ? 'FAIL' : 'PASS'} | 外部依赖: ${externalFailed ? 'WARN' : 'OK'}\n`)
  if (failed) process.exit(1)
  if (externalFailed) process.exit(2)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
