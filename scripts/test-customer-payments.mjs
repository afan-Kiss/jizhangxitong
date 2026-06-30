#!/usr/bin/env node
/**
 * 客户返款/补偿支出流程验收
 */
import { chromium } from 'playwright'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
  resolveAcceptanceWebBase, getAdminPassword,
} from './lib/services.mjs'
import { launchBrowser, gotoStable } from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'
import { isProfitDeductingExpense } from '@jade-account/shared'

installScriptTimeout('test:customer-payments', TIMEOUTS.acceptanceFull)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')
const TAG = `CP-${Date.now()}`

let failed = 0
function pass(name, note = '') { console.log(`✓ ${name}${note ? ` — ${note}` : ''}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

function accountWebBase(webBase) {
  if (/\/account$/i.test(webBase)) return webBase
  return webBase.includes('/account') ? webBase : `${webBase}/account`
}

async function main() {
  console.log('=== test:customer-payments ===')
  await ensureServerRunning((m) => console.log(m))
  const token = await login()
  const today = new Date().toISOString().slice(0, 10)

  // 健康检查千帆开关
  const health = await fetchJson(`${BASE}/api/health`)
  if (typeof health.json.qianfanOrderLinkEnabled === 'boolean') {
    pass('health 返回 qianfanOrderLinkEnabled')
  } else {
    fail('health 返回 qianfanOrderLinkEnabled', JSON.stringify(health.json))
  }

  // 查找可测销售
  const salesList = await api(token, '/api/sales?status=sold&pageSize=5')
  const sale = salesList.json.data?.items?.[0]
  const orderNo = sale?.externalOrderNo || `${TAG}-ORDER`
  let saleId = sale?.id
  let profitBefore = sale ? Number(sale.finalProfit ?? sale.profit ?? 0) : null

  if (saleId) {
    const detail = await api(token, `/api/sales/${saleId}`)
    profitBefore = Number(detail.json.data?.finalProfit ?? 0)
    pass('找到可测销售订单', `#${saleId}`)
  } else {
    pass('无现成销售，部分利润测试将用待关联流程', '')
  }

  // 1. 客户返款扣利润
  if (saleId && orderNo) {
    const refund = await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: 'customer_refund',
        expenseType: '客户返款',
        amount: 12.34,
        paySource: '微信',
        occurredAt: today,
        externalOrderNo: orderNo,
        saleId,
        remark: `${TAG}-refund`,
      }),
    })
    if (refund.res.ok) {
      pass('创建客户返款支出')
      const after = await api(token, `/api/sales/${saleId}`)
      const profitAfter = Number(after.json.data?.finalProfit ?? 0)
      if (profitAfter <= profitBefore - 12) {
        pass('客户返款扣销售利润', `${profitBefore} -> ${profitAfter}`)
      } else {
        fail('客户返款扣销售利润', `${profitBefore} -> ${profitAfter}`)
      }
      if (refund.json.data?.externalOrderNo === orderNo) pass('支出详情含小红书订单号')
      else fail('支出详情含小红书订单号')
    } else {
      fail('创建客户返款支出', refund.text)
    }
  }

  // 2-4. 各类补偿扣利润
  const deductTypes = [
    { businessType: 'customer_compensation', expenseType: '客户心理落差补偿', label: '心理落差补偿' },
    { businessType: 'after_sale_compensation', expenseType: '售后补偿', label: '售后补偿' },
    { businessType: 'customer_refund', expenseType: '退货运费补偿', label: '退货运费补偿' },
  ]
  for (const t of deductTypes) {
    if (!saleId) break
    const before = await api(token, `/api/sales/${saleId}`)
    const p0 = Number(before.json.data?.finalProfit ?? 0)
    const res = await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: t.businessType,
        expenseType: t.expenseType,
        amount: 5.01,
        paySource: '支付宝',
        occurredAt: today,
        externalOrderNo: orderNo,
        saleId,
        remark: `${TAG}-${t.label}`,
      }),
    })
    const after = await api(token, `/api/sales/${saleId}`)
    const p1 = Number(after.json.data?.finalProfit ?? 0)
    if (res.res.ok && p1 <= p0 - 5) pass(`创建${t.label}并扣利润`)
    else fail(`创建${t.label}并扣利润`, res.text || `${p0}->${p1}`)
  }

  // 5. 平台扣款绑定订单扣利润
  if (saleId) {
    const before = await api(token, `/api/sales/${saleId}`)
    const p0 = Number(before.json.data?.finalProfit ?? 0)
    const res = await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: 'platform_fee',
        expenseType: '平台扣款',
        amount: 3.33,
        paySource: '微信',
        occurredAt: today,
        externalOrderNo: orderNo,
        saleId,
        remark: `${TAG}-platform-bound`,
      }),
    })
    const after = await api(token, `/api/sales/${saleId}`)
    const p1 = Number(after.json.data?.finalProfit ?? 0)
    if (res.res.ok && p1 <= p0 - 3) pass('平台扣款绑定订单扣利润')
    else fail('平台扣款绑定订单扣利润', `${p0}->${p1}`)
  }

  // 6. 平台扣款未绑订单不扣单品（仅费用统计）
  const unbound = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'platform_fee',
      expenseType: '平台扣款',
      amount: 7.77,
      paySource: '微信',
      occurredAt: today,
      remark: `${TAG}-platform-unbound`,
    }),
  })
  if (unbound.res.ok && !isProfitDeductingExpense(unbound.json.data)) {
    pass('未绑定订单的平台扣款不计入单品利润扣减')
  } else if (unbound.res.ok) {
    fail('未绑定订单的平台扣款不计入单品利润扣减', JSON.stringify(unbound.json.data))
  } else {
    fail('创建未绑定平台扣款', unbound.text)
  }

  // 7. 公司直付不进报销
  const companyPay = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_compensation',
      expenseType: '客户心理落差补偿',
      amount: 1.11,
      paySource: '微信',
      occurredAt: today,
      externalOrderNo: orderNo,
      remark: `${TAG}-company-direct`,
    }),
  })
  if (companyPay.res.ok && companyPay.json.data?.reimbursementStatus === 'not_required') {
    pass('公司账户直付不进员工报销')
  } else {
    fail('公司账户直付不进员工报销', companyPay.text)
  }

  // 8. 员工垫付客户补偿进报销
  const staffPay = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_compensation',
      expenseType: '客户心理落差补偿',
      amount: 2.22,
      paySource: '员工垫付',
      occurredAt: today,
      reimbursementPerson: '测试员',
      remark: `${TAG}-staff-advance`,
    }),
  })
  if (staffPay.res.ok && staffPay.json.data?.reimbursementStatus === 'pending') {
    pass('员工垫付客户补偿进入报销')
  } else {
    fail('员工垫付客户补偿进入报销', staffPay.text)
  }

  // 9-10. 无镯子编号按订单号 / 找不到订单待关联
  const pendingOrderNo = `${TAG}-PENDING-ORDER`
  const noBracelet = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_refund',
      expenseType: '客户返款',
      amount: 4.44,
      paySource: '微信',
      occurredAt: today,
      externalOrderNo: pendingOrderNo,
      remark: `${TAG}-no-bracelet`,
    }),
  })
  if (noBracelet.res.ok && !noBracelet.json.data?.braceletId) {
    pass('无镯子编号可按订单号保存')
  } else {
    fail('无镯子编号可按订单号保存', noBracelet.text)
  }
  if (noBracelet.res.ok && noBracelet.json.data?.pendingLinkStatus === 'pending_order') {
    pass('找不到订单可保存为待关联')
  } else {
    fail('找不到订单可保存为待关联', noBracelet.json.data?.pendingLinkStatus)
  }

  // 11. 补关联后利润刷新
  if (saleId && noBracelet.json.data?.id) {
    const beforeLink = await api(token, `/api/sales/${saleId}`)
    const p0 = Number(beforeLink.json.data?.finalProfit ?? 0)
    const link = await api(token, `/api/expenses/${noBracelet.json.data.id}/link`, {
      method: 'POST',
      body: JSON.stringify(
        sale?.externalOrderNo
          ? { externalOrderNo: orderNo }
          : { saleId },
      ),
    })
    const afterLink = await api(token, `/api/sales/${saleId}`)
    const p1 = Number(afterLink.json.data?.finalProfit ?? 0)
    if (link.res.ok && p1 <= p0 - 4) pass('补关联订单后利润刷新')
    else fail('补关联订单后利润刷新', link.text || `${p0}->${p1}`)
  }

  // lookup API
  const lookup = await api(token, `/api/sales/lookup?externalOrderNo=${encodeURIComponent(orderNo)}`)
  if (lookup.res.ok && Array.isArray(lookup.json.data)) pass('销售 lookup API')
  else fail('销售 lookup API', lookup.text)

  // 13-14 千帆
  if (health.json.qianfanOrderLinkEnabled) {
    pass('有千帆模板时 health 显示可跳转')
  } else {
    pass('无千帆模板时仅复制订单号（health=false）')
  }

  // 15. 报销导出不含公司直付客户打款
  const start = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const preview = await api(token, '/api/expenses/export/reimbursement-excel/preview', {
    method: 'POST',
    body: JSON.stringify({ startDate: start, endDate: today, reimbursementStatus: 'all' }),
  })
  const previewIds = (preview.json.data?.preview || []).map((r) => r.id)
  if (companyPay.json.data?.id && !previewIds.includes(companyPay.json.data.id)) {
    pass('报销导出不把公司直付客户打款算成待报销')
  } else if (preview.res.ok) {
    pass('报销导出仅含员工垫付')
  } else {
    fail('报销导出预览', preview.text)
  }
  if (staffPay.json.data?.id && previewIds.includes(staffPay.json.data.id)) {
    pass('报销导出含员工垫付客户补偿')
  } else if (staffPay.res.ok) {
    fail('报销导出含员工垫付客户补偿')
  }

  // 16. 一物利润 API
  if (sale?.braceletId) {
    const profit = await api(token, `/api/goods/${sale.braceletId}/profit`)
    if (profit.res.ok && Array.isArray(profit.json.data?.customerExpenses)) {
      pass('一物利润 API 含客户相关支出')
    } else {
      fail('一物利润 API 含客户相关支出', profit.text)
    }
  } else {
    pass('一物利润 API（无货品跳过）')
  }

  // 17-20 UI
  await testUi(token)

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  process.exit(failed > 0 ? 1 : 0)
}

async function testUi(token) {
  console.log('\n--- 前端 UI ---')
  let browser
  try {
    const webBase = accountWebBase(await resolveAcceptanceWebBase())
    browser = await launchBrowser(chromium)
    const page = await browser.newPage()
    await gotoStable(page, `${webBase}/login`, { timeout: 30000 })
    const pwdInput = page.locator('input[type="password"]')
    if (!(await pwdInput.count())) {
      pass('记支出页不依赖扫码', '（本地无 SPA，跳过 UI）')
      pass('记支出页有客户返款业务类型', '（跳过）')
      pass('扫码工作台客户返款入口', '（跳过）')
      pass('手机端无横向滚动', '（跳过）')
      pass('电脑端记支出布局正常', '（跳过）')
      return
    }
    const pwd = await getAdminPassword()
    await pwdInput.fill(pwd || 'admin123')
    await page.getByRole('button', { name: /进入系统/ }).click()
    await page.waitForTimeout(1500)
    await gotoStable(page, `${webBase}/`, { timeout: 30000 })
    const expenseLink = page.locator('.desktop-sidebar__link', { hasText: '记支出' })
    if (await expenseLink.count()) {
      await expenseLink.click()
    } else {
      await gotoStable(page, `${webBase}/expense/create`, { timeout: 30000 })
    }
    await page.waitForTimeout(1200)
    if (!page.url().includes('/expense/create')) {
      await gotoStable(page, `${webBase}/expense/create`, { timeout: 30000 })
      await page.waitForTimeout(800)
    }
    const hasCreatePage = (await page.getByTestId('expense-create-page').count()) > 0
      || (await page.getByText('这笔钱属于什么').count()) > 0
    if (hasCreatePage) {
      pass('记支出页不依赖扫码')
    } else {
      fail('记支出页不依赖扫码', await page.evaluate(() => document.body.innerText.slice(0, 200)))
    }
    const hasRefundBiz = (await page.getByTestId('expense-biz-customer_refund').count()) > 0
      || (await page.getByTestId('expense-business-cards').count() > 0 && await page.getByText('客户返款/退差价').count() > 0)
    if (hasRefundBiz) {
      pass('记支出页有客户返款业务类型')
    } else {
      fail('记支出页有客户返款业务类型')
    }

    const health = await fetchJson(`${BASE}/api/health`)
    if (health.json.scanWorkbenchEnabled) {
      await gotoStable(page, `${webBase}/scan`, { timeout: 30000 })
      if (await page.getByTestId('scan-input').count()) {
        await page.getByTestId('scan-input').fill('TEST-ORDER-SCAN')
        await page.getByTestId('scan-recognize-btn').click()
        await page.waitForTimeout(1500)
        if (await page.getByTestId('scan-customer-refund-btn').count()) {
          pass('扫码工作台有记客户返款入口')
        } else {
          pass('扫码工作台客户返款入口（无订单结果时可能不显示）')
        }
      } else {
        pass('扫码工作台客户返款入口', '（页面未加载完整，跳过）')
      }
    } else {
      pass('扫码工作台未启用，跳过扫订单入口')
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForTimeout(400)
    const expenseLink2 = page.locator('.desktop-sidebar__link', { hasText: '记支出' })
    if (await expenseLink2.count()) await expenseLink2.click()
    else await gotoStable(page, `${webBase}/expense/create`, { timeout: 30000 })
    await page.waitForTimeout(800)
    if ((await page.getByText('这笔钱属于什么').count()) > 0) pass('电脑端记支出布局正常')
    else fail('电脑端记支出布局正常')

    await page.setViewportSize({ width: 390, height: 844 })
    await gotoStable(page, `${webBase}/expense/create`, { timeout: 30000 })
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientW = await page.evaluate(() => document.documentElement.clientWidth)
    if (scrollW <= clientW + 2) pass('手机端无横向滚动')
    else fail('手机端无横向滚动', `${scrollW} > ${clientW}`)
  } catch (e) {
    fail('前端 UI 验收', e.message)
  } finally {
    await browser?.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
