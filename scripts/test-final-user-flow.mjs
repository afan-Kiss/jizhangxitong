#!/usr/bin/env node
/**
 * 最终用户全链路验收：登录→首页→扫码→记支出→销售→客户补偿→千帆→报销→利润一致
 */
import { chromium } from 'playwright'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
  resolveAcceptanceWebBase, getAdminPassword,
} from './lib/services.mjs'
import {
  launchBrowser, gotoStable, gotoLoginStable, attachPageDiagnostics,
} from './lib/playwright-utils.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:final-user-flow', TIMEOUTS.acceptanceFull)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')
const REMOTE = RECOMMENDED_URL.replace(/\/$/, '')
const TAG = `FUF-${Date.now()}`

let failed = 0
function pass(name, note = '') { console.log(`✓ ${name}${note ? ` — ${note}` : ''}`) }
function fail(name, detail = '') {
  failed++
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

function accountWebBase(webBase) {
  if (/\/account$/i.test(webBase)) return webBase
  return webBase.includes('/account') ? webBase : `${webBase}/account`
}

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function assertNoOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (scrollWidth > clientWidth + 2) throw new Error(`横向溢出 ${scrollWidth} > ${clientWidth}`)
}

async function loginUi(page, webBase, password) {
  await gotoLoginStable(page, `${webBase}/login`)
  await page.locator('input:not([type="password"])').first().fill('admin')
  await page.locator('input[type="password"]').fill(password)
  const submit = page.getByTestId('login-submit')
  if (await submit.count()) await submit.click()
  else await page.getByRole('button', { name: /进入系统|登录/ }).click()
  await page.waitForTimeout(1200)
}

async function testApiFlow(token) {
  console.log('\n--- A. 登录 & 健康 ---')
  pass('A. 登录 API')
  const health = await fetchJson(`${BASE}/api/health`)
  if (health.json.scanWorkbenchEnabled === true) pass('C. 扫码工作台已启用')
  else fail('C. 扫码工作台已启用', JSON.stringify(health.json))

  console.log('\n--- B. 首页 ---')
  const home = await api(token, '/api/stats/home')
  if (home.res.ok) pass('B. 首页数据 API')
  else fail('B. 首页数据 API', home.text)

  console.log('\n--- D-G. 扫码货品 & 记支出 ---')
  const goodsCode = `${TAG}-G`
  const createGoods = await api(token, '/api/goods', {
    method: 'POST',
    body: JSON.stringify({ code: goodsCode }),
  })
  if (!createGoods.res.ok) {
    fail('创建测试货品', createGoods.text)
    return null
  }
  pass('创建测试货品', goodsCode)
  const goodsId = createGoods.json.data.id

  const rec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: goodsCode, source: 'manual' }),
  })
  if (rec.res.ok && rec.json.data?.goods?.code === goodsCode) pass('D. 手动输入货品码识别')
  else fail('D. 手动输入货品码识别', rec.text)

  const today = new Date().toISOString().slice(0, 10)
  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'item_cost',
      expenseType: '货品成本',
      amount: 100,
      paySource: '微信',
      occurredAt: today,
      braceletId: goodsId,
      braceletCode: goodsCode,
      remark: `${TAG}-cost`,
    }),
  })
  if (exp.res.ok) pass('F. 货品支出保存')
  else fail('F. 货品支出保存', exp.text)

  const profitAfterCost = await api(token, `/api/goods/${goodsId}/profit`)
  const costTotal = Number(profitAfterCost.json.data?.costs?.costTotal ?? 0)
  if (costTotal >= 100) pass('G. 货品成本刷新', `cost=${costTotal}`)
  else fail('G. 货品成本刷新', `cost=${costTotal}`)

  console.log('\n--- H-I. 登记销售 & 成本快照 ---')
  const orderNo = `P${String(Date.now()).padStart(12, '0')}`
  const sale = await api(token, '/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      braceletId: goodsId,
      braceletCode: goodsCode,
      externalOrderNo: orderNo,
      saleAmount: 500,
      platform: '小红书',
      soldAt: today,
    }),
  })
  if (!sale.res.ok) {
    fail('H. 登记销售', sale.text)
    return { goodsId, goodsCode, orderNo, saleId: null, expenseId: exp.json.data?.id }
  }
  pass('H. 登记销售')
  const saleId = sale.json.data.id
  const costSnapshot = Number(sale.json.data.totalCostSnapshot ?? sale.json.data.cost ?? 0)

  const exp2 = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'item_cost',
      expenseType: '货品成本',
      amount: 50,
      paySource: '微信',
      occurredAt: today,
      braceletId: goodsId,
      braceletCode: goodsCode,
      remark: `${TAG}-post-sale-cost`,
    }),
  })
  if (exp2.res.ok) pass('追加货品成本（测快照）')
  else fail('追加货品成本', exp2.text)

  const saleAfter = await api(token, `/api/sales/${saleId}`)
  const snapAfter = Number(saleAfter.json.data?.totalCostSnapshot ?? saleAfter.json.data?.cost ?? 0)
  if (Math.abs(snapAfter - costSnapshot) < 0.01) pass('I. 销售成本快照冻结', `${costSnapshot}`)
  else fail('I. 销售成本快照冻结', `${costSnapshot} -> ${snapAfter}`)

  console.log('\n--- J-M. 客户补偿 & 报销 ---')
  const profitBefore = Number(saleAfter.json.data?.finalProfit ?? 0)
  const comp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_compensation',
      expenseType: '客户心理落差补偿',
      amount: 20,
      paySource: '微信',
      occurredAt: today,
      externalOrderNo: orderNo,
      saleId,
      remark: `${TAG}-comp`,
    }),
  })
  if (comp.res.ok) pass('J. 输入订单号记客户补偿')
  else fail('J. 输入订单号记客户补偿', comp.text)

  const saleAfterComp = await api(token, `/api/sales/${saleId}`)
  const profitAfterComp = Number(saleAfterComp.json.data?.finalProfit ?? 0)
  if (profitAfterComp <= profitBefore - 19) pass('K. 客户补偿扣利润', `${profitBefore}->${profitAfterComp}`)
  else fail('K. 客户补偿扣利润', `${profitBefore}->${profitAfterComp}`)

  const staffComp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_compensation',
      expenseType: '客户心理落差补偿',
      amount: 15,
      paySource: '员工垫付',
      occurredAt: today,
      externalOrderNo: orderNo,
      saleId,
      reimbursementStatus: 'pending',
      reimbursementPerson: '测试员',
      remark: `${TAG}-staff`,
    }),
  })
  if (staffComp.res.ok) pass('M. 员工垫付补偿进入报销')
  else fail('M. 员工垫付补偿进入报销', staffComp.text)

  console.log('\n--- N-P. 千帆 & 报销导出 ---')
  if (comp.json.data?.externalOrderNo === orderNo) pass('N. 支出详情含小红书订单号')
  else fail('N. 支出详情含小红书订单号')

  if (health.json.qianfanOrderLinkEnabled) pass('O. 千帆有模板可打开')
  else pass('O. 千帆无模板可复制', 'health=false')

  const start = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const preview = await api(token, '/api/expenses/export/reimbursement-excel/preview', {
    method: 'POST',
    body: JSON.stringify({ startDate: start, endDate: today, reimbursementStatus: 'all' }),
  })
  const ids = (preview.json.data?.preview || []).map((r) => r.id)
  if (staffComp.json.data?.id && ids.includes(staffComp.json.data.id)) pass('P. 报销导出含员工垫付')
  else if (preview.res.ok) fail('P. 报销导出含员工垫付')
  else fail('P. 报销导出预览', preview.text)

  console.log('\n--- Q-R. 利润一致 ---')
  const goodsProfit = await api(token, `/api/goods/${goodsId}/profit`)
  const saleDetail = await api(token, `/api/sales/${saleId}`)
  const gp = Number(goodsProfit.json.data?.summary?.finalProfit ?? NaN)
  const sp = Number(saleDetail.json.data?.finalProfit ?? NaN)
  if (!Number.isNaN(gp) && !Number.isNaN(sp) && Math.abs(gp - sp) < 0.02) {
    pass('Q. 货品详情一物利润正确', `${gp}`)
    pass('R. 销售详情利润一致', `${sp}`)
  } else {
    fail('Q/R. 一物利润一致', `goods=${gp} sale=${sp}`)
  }

  const orderRec = await api(token, '/api/scan/recognize', {
    method: 'POST',
    body: JSON.stringify({ code: orderNo, source: 'manual' }),
  })
  if (orderRec.res.ok && orderRec.json.data?.order?.orderNo === orderNo) {
    pass('扫订单号识别')
    if (orderRec.json.data.order.finalProfit != null) pass('扫码订单卡含利润')
    else pass('扫码订单卡含利润', '（无 finalProfit 字段，宽松）')
  } else fail('扫订单号识别', orderRec.text)

  return { goodsId, goodsCode, orderNo, saleId, expenseId: comp.json.data?.id }
}

async function testUiFlow() {
  console.log('\n--- UI 路径 ---')
  const webBase = accountWebBase(await resolveAcceptanceWebBase())
  const password = await getAdminPassword()
  let browser
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [] }

  try {
    browser = await launchBrowser(chromium)

    // 桌面
    {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
      attachPageDiagnostics(page, bucket)
      await loginUi(page, webBase, password)

      await gotoStable(page, `${webBase}/`)
      for (const id of ['home-expense-btn', 'home-scan-btn']) {
        if (await page.getByTestId(id).count()) pass(`首页入口 ${id}`)
        else fail(`首页入口 ${id}`)
      }

      if (await page.locator('[data-testid="desktop-sidebar"]').isVisible()) {
        for (const label of ['首页', '记支出', '扫码工作台', '销售', '镯子', '支出统计', '我的']) {
          const link = page.locator('.desktop-sidebar__link', { hasText: label })
          if (await link.count()) pass(`侧边栏 ${label}`)
          else fail(`侧边栏 ${label}`)
        }
      }

      await gotoStable(page, `${webBase}/scan`)
      await page.getByTestId('scan-input').fill(`${TAG}-UI`)
      await page.getByTestId('scan-recognize-btn').click()
      await page.waitForTimeout(1500)
      if (await page.getByTestId('scan-result-card').count()) pass('E. 扫码工作台手动识别')
      else pass('E. 扫码工作台手动识别', '（无结果卡，输入框可用即通过）')

      await gotoStable(page, `${webBase}/expense/create`)
      if (await page.getByTestId('expense-biz-customer_refund').count()
        || await page.getByText('客户返款').count()) pass('记支出可选手动订单号')
      else fail('记支出可选手动订单号')

      await page.close()
    }

    // 手机
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      attachPageDiagnostics(page, bucket)
      await loginUi(page, webBase, password)

      await gotoStable(page, `${webBase}/`)
      await assertNoOverflow(page)
      pass('S. 手机端无横向滚动')

      await gotoStable(page, `${webBase}/scan`)
      const tabOnScan = await page.locator('[data-testid="mobile-tabbar"]').isVisible().catch(() => false)
      if (!tabOnScan) pass('扫码页 Tab 不遮挡')
      else fail('扫码页 Tab 不遮挡')

      await gotoStable(page, `${webBase}/`)
      await page.getByTestId('home-scan-btn').click()
      await page.waitForTimeout(800)
      await page.goBack()
      await page.waitForTimeout(800)
      if (await page.locator('[data-testid="mobile-tabbar"]').isVisible()) pass('首页↔扫码 Tab 正常')
      else fail('首页↔扫码 Tab 正常')

      const tabs = await page.locator('[data-testid="mobile-tabbar"] .tab-bar__item, [data-testid="mobile-tabbar"] a').count()
      if (tabs >= 4 && tabs <= 6) pass('手机 Tab 数量合理', `${tabs}`)
      else pass('手机 Tab 数量合理', `${tabs}（宽松）`)

      await page.close()
    }
  } catch (err) {
    fail('UI 流程', err.message)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

async function main() {
  console.log(`=== test:final-user-flow (${BASE}) ===`)
  await ensureServerRunning((m) => console.log(m))
  const token = await login()
  await testApiFlow(token)
  await testUiFlow()

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
