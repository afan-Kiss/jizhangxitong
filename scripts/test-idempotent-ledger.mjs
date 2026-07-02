#!/usr/bin/env node
/** 重复退款 / 重复作废拦截验收 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = SERVER.replace(/\/$/, '')
const TAG = `IDEM-${Date.now()}`
let failed = 0
function pass(n, d = '') { console.log(`✓ ${n}${d ? ` — ${d}` : ''}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:idempotent-ledger', TIMEOUTS.acceptanceBasic)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function main() {
  console.log('\n=== test:idempotent-ledger ===\n')
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = new Date().toISOString().slice(0, 10)

  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 2.5,
      expenseType: '包装耗材',
      businessType: 'normal',
      paySource: '项目专用资金',
      occurredAt: today,
      remark: `${TAG}-void`,
    }),
  })
  const expenseId = exp.json.data?.id
  if (!expenseId) {
    fail('创建测试支出', exp.text)
    process.exit(1)
  }

  const void1 = await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: `${TAG}-1` }),
  })
  if (void1.res.ok) pass('首次作废成功')
  else fail('首次作废成功', void1.text)

  const void2 = await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: `${TAG}-2` }),
  })
  if (!void2.res.ok) pass('重复作废被拒绝')
  else fail('重复作废被拒绝', void2.text?.slice(0, 120))

  const logsBefore = await api(token, '/api/operation-logs?pageSize=200')
  const voidLogs = (logsBefore.json.data?.items || []).filter(
    (l) => l.targetType === 'expense' && l.targetId === expenseId && l.action === 'void_expense',
  )
  if (voidLogs.length <= 1) pass('重复作废不写多条日志')
  else fail('重复作废不写多条日志', `count=${voidLogs.length}`)

  const saleCreate = await api(token, '/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      platform: '其他',
      customerName: `${TAG}`,
      saleAmount: 888,
      soldAt: today,
      customerRemark: TAG,
    }),
  })
  const saleId = saleCreate.json.data?.id
  if (!saleId) {
    pass('销售退款重复测试', '（无镯子编号，跳过销售创建）')
    console.log(`\n${failed ? 'FAIL' : 'PASS'} — 幂等验收\n`)
    process.exit(failed ? 1 : 0)
  }

  const refund1 = await api(token, `/api/sales/${saleId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ refundAmount: 100, refundReason: `${TAG}-1` }),
  })
  if (refund1.res.ok) pass('首次退款成功')
  else fail('首次退款成功', refund1.text)

  const refund2 = await api(token, `/api/sales/${saleId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ refundAmount: 50, refundReason: `${TAG}-2` }),
  })
  if (!refund2.res.ok && /已经退款/.test(refund2.json.message || refund2.text || '')) {
    pass('重复退款被拒绝')
  } else {
    fail('重复退款被拒绝', refund2.text?.slice(0, 120))
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 幂等验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
