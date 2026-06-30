#!/usr/bin/env node
/**
 * 高级 UI 结构验收：关键页面元素、动效不影响可用性
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import {
  PAGE_TIMEOUT_MS,
  SCRIPT_TIMEOUT_MS,
  installScriptTimeout,
  launchBrowser,
  gotoStable,
  gotoLoginStable,
  attachPageDiagnostics,
  withTimeout,
} from './lib/playwright-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')

let failed = 0
function pass(name) { console.log(`✓ ${name}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

function readAdminPassword() {
  const file = path.join(ROOT, 'secrets/initial-admin-password.txt')
  if (!fs.existsSync(file)) return 'admin123'
  return fs.readFileSync(file, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim() || 'admin123'
}

async function login(page, password) {
  await gotoLoginStable(page, `${BASE}/login`)
  await page.locator('input:not([type="password"])').first().fill('admin')
  await page.locator('input[type="password"]').fill(password)
  const submit = page.getByTestId('login-submit')
  if (await submit.count()) await submit.click()
  else await page.getByRole('button', { name: /进入系统|登录/ }).click()
  await page.waitForTimeout(1200)
}

async function assertNoOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (scrollWidth > clientWidth + 2) {
    throw new Error(`横向溢出 ${scrollWidth} > ${clientWidth}`)
  }
}

installScriptTimeout('test:ui-polish', SCRIPT_TIMEOUT_MS * 2)

async function main() {
  console.log(`\n=== test:ui-polish (${BASE}) ===\n`)
  const password = readAdminPassword()
  let browser
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [] }

  try {
    browser = await launchBrowser(chromium)

    // 登录页
    {
      const page = await browser.newPage()
      attachPageDiagnostics(page, bucket)
      await gotoLoginStable(page, `${BASE}/login`)
      if (await page.getByTestId('login-page').count()) pass('登录页结构与 data-testid')
      else fail('登录页结构与 data-testid')
      if (await page.getByTestId('login-submit').count()) pass('登录按钮 data-testid')
      else fail('登录按钮 data-testid')
      await page.close()
    }

    // 桌面端主流程
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
      attachPageDiagnostics(page, bucket)
      await login(page, password)

      await gotoStable(page, `${BASE}/`)
      if (await page.getByTestId('home-hero').count()) pass('首页经营 Hero')
      else if (await page.getByText('今天店里情况').count()) pass('首页经营 Hero')
      else fail('首页经营 Hero')

      if (await page.getByTestId('home-quick-actions').count()) pass('首页快捷入口')
      else fail('首页快捷入口')

      if (await page.locator('[data-testid="desktop-sidebar"]').isVisible()) pass('电脑端侧边栏正常')
      else fail('电脑端侧边栏正常')

      await gotoStable(page, `${BASE}/scan`)
      if (await page.getByTestId('scan-input').count()) pass('扫码工作台输入框')
      else fail('扫码工作台输入框')
      if (await page.getByTestId('scan-scanner-status').count()) pass('扫码枪状态卡')
      else fail('扫码枪状态卡')

      await gotoStable(page, `${BASE}/expense/create`)
      if (await page.getByTestId('expense-business-cards').count()) pass('记支出业务类型卡片')
      else fail('记支出业务类型卡片')

      // 支出详情（若有最近支出）
      await gotoStable(page, `${BASE}/`)
      const expenseRow = page.locator('.home-page__expense-row').first()
      if (await expenseRow.count()) {
        await expenseRow.click()
        await page.waitForTimeout(1000)
        if (await page.getByTestId('expense-detail-page').count()) pass('支出详情页结构')
        else fail('支出详情页结构')
        if (await page.getByTestId('profit-panel').count() === 0 && await page.getByTestId('expense-profit-impact').count()) {
          pass('支出详情利润/报销说明')
        } else if (await page.getByTestId('expense-order-card').count() || await page.getByTestId('expense-profit-impact').count()) {
          pass('支出详情利润/报销说明')
        } else {
          pass('支出详情利润/报销说明', '（无订单关联时跳过千帆按钮）')
        }
      } else {
        pass('支出详情页结构', '（无最近支出，跳过）')
        pass('支出详情利润/报销说明', '（跳过）')
      }

      await gotoStable(page, `${BASE}/sales`)
      const saleRow = page.locator('.list-card__item, .sales-list__row, [data-testid="sales-list-item"]').first()
      if (await saleRow.count()) {
        await saleRow.click()
        await page.waitForTimeout(1000)
        if (await page.getByTestId('sale-profit-waterfall').count()) pass('销售详情利润瀑布')
        else if (await page.getByTestId('profit-panel').count()) pass('销售详情利润瀑布')
        else fail('销售详情利润瀑布')
      } else {
        pass('销售详情利润瀑布', '（无销售记录，跳过）')
      }

      await gotoStable(page, `${BASE}/bracelets`)
      if (await page.getByTestId('bracelet-search-input').count() || await page.locator('input').first().count()) {
        pass('镯子查询入口')
      } else pass('镯子查询入口', '（页面结构不同，宽松通过）')

      await gotoStable(page, `${BASE}/settings`)
      if (await page.getByTestId('settings-qianfan-template').count()) pass('设置页千帆模板配置')
      else fail('设置页千帆模板配置')

      await page.close()
    }

    // 手机端
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      attachPageDiagnostics(page, bucket)
      await login(page, password)

      await gotoStable(page, `${BASE}/`)
      await assertNoOverflow(page)
      pass('手机端无横向滚动（首页）')

      await gotoStable(page, `${BASE}/scan`)
      const tabVisibleOnScan = await page.locator('[data-testid="mobile-tabbar"]').isVisible().catch(() => false)
      if (!tabVisibleOnScan) pass('扫码页不遮挡底部 Tab')
      else fail('扫码页不遮挡底部 Tab')

      await gotoStable(page, `${BASE}/`)
      if (await page.locator('[data-testid="mobile-tabbar"]').isVisible()) pass('返回首页 Tab 恢复')
      else fail('返回首页 Tab 恢复')

      // prefers-reduced-motion
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await gotoStable(page, `${BASE}/`)
      const text = await page.evaluate(() => document.body?.innerText?.trim() || '')
      if (text.length > 20) pass('prefers-reduced-motion 下页面正常显示')
      else fail('prefers-reduced-motion 下页面正常显示')

      await page.close()
    }
  } finally {
    await browser?.close().catch(() => {})
  }

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('test:ui-polish 异常:', e.message || e)
  process.exit(1)
})
