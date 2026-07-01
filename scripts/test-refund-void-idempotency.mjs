#!/usr/bin/env node
/** 重复退款 / 重复作废幂等验收 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, localDateString,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')
const TAG = `IDEM2-${Date.now()}`
let failed = 0
function pass(n, d = '') { console.log(`✓ ${n}${d ? ` — ${d}` : ''}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:refund-void-idempotency', TIMEOUTS.acceptanceFull)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function testVoidIdempotency(token, today) {
  console.log('\n--- 重复作废 ---')
  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 3.33,
      expenseType: '包装耗材',
      businessType: 'normal',
      paySource: '专属经费',
      occurredAt: today,
      remark: `${TAG}-void`,
    }),
  })
  const expenseId = exp.json.data?.id
  if (!expenseId) {
    fail('创建测试支出', exp.text)
    return
  }

  const void1 = await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: `${TAG}-1` }),
  })
  if (void1.res.ok) pass('第一次作废成功')
  else fail('第一次作废成功', void1.text)

  const void2 = await api(token, `/api/expenses/${expenseId}/void`, {
    method: 'POST',
    body: JSON.stringify({ voidReason: `${TAG}-2` }),
  })
  const void2Msg = void2.json.message || void2.text || ''
  if (!void2.res.ok && /已经作废/.test(void2Msg)) pass('第二次作废失败')
  else fail('第二次作废失败', void2Msg.slice(0, 120))

  const detail = await api(token, `/api/expenses/${expenseId}`)
  if (detail.json.data?.isVoided === true) pass('支出仍保持 isVoided=true')
  else fail('支出仍保持 isVoided=true', JSON.stringify(detail.json.data?.isVoided))

  const logs = await api(token, '/api/operation-logs?pageSize=300')
  const voidLogs = (logs.json.data?.items || []).filter(
    (l) => l.targetType === 'expense' && l.targetId === expenseId && l.action === 'void_expense',
  )
  if (voidLogs.length === 1) pass('operationLog 不追加第二条 void_expense')
  else fail('operationLog 不追加第二条 void_expense', `count=${voidLogs.length}`)
}

async function testRefundIdempotency(token, today) {
  console.log('\n--- 重复退款 ---')
  const code = `${TAG}-G`
  const goods = await api(token, '/api/goods', {
    method: 'POST',
    body: JSON.stringify({ code, name: code }),
  })
  const goodsId = goods.json.data?.id
  if (!goodsId) {
    fail('创建测试货品', goods.text)
    return
  }

  const saleCreate = await api(token, '/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      platform: '其他',
      braceletCode: code,
      saleAmount: 2000,
      soldAt: today,
      remark: `${TAG}-sale`,
    }),
  })
  const saleId = saleCreate.json.data?.id
  if (!saleId) {
    fail('创建测试销售', saleCreate.text)
    return
  }

  const refundAmount = 500
  const refund1 = await api(token, `/api/sales/${saleId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ refundAmount, refundReason: `${TAG}-1` }),
  })
  if (refund1.res.ok) pass('第一次退款成功')
  else fail('第一次退款成功', refund1.text)

  const afterFirst = await api(token, `/api/sales/${saleId}`)
  const profitAfterFirst = Number(afterFirst.json.data?.finalProfit ?? afterFirst.json.data?.profit ?? 0)
  const refundsAfterFirst = afterFirst.json.data?.refunds?.length ?? 0
  if (refundsAfterFirst === 1) pass('refund 表仅一条记录')
  else fail('refund 表仅一条记录', `count=${refundsAfterFirst}`)

  const refund2 = await api(token, `/api/sales/${saleId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ refundAmount: 100, refundReason: `${TAG}-2` }),
  })
  const refund2Msg = refund2.json.message || refund2.text || ''
  if (!refund2.res.ok && /已经退款|已有退款记录/.test(refund2Msg)) {
    pass('第二次退款失败')
  } else {
    fail('第二次退款失败', refund2Msg.slice(0, 120))
  }

  const afterSecond = await api(token, `/api/sales/${saleId}`)
  const profitAfterSecond = Number(afterSecond.json.data?.finalProfit ?? afterSecond.json.data?.profit ?? 0)
  const refundsAfterSecond = afterSecond.json.data?.refunds?.length ?? 0
  if (refundsAfterSecond === 1) pass('refund 表不会追加第二条')
  else fail('refund 表不会追加第二条', `count=${refundsAfterSecond}`)
  if (Math.abs(profitAfterSecond - profitAfterFirst) < 0.02) {
    pass('利润不会重复扣减', `profit=${profitAfterSecond}`)
  } else {
    fail('利润不会重复扣减', `${profitAfterFirst} -> ${profitAfterSecond}`)
  }
}

async function main() {
  console.log('\n=== test:refund-void-idempotency ===\n')
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = localDateString()

  await testVoidIdempotency(token, today)
  await testRefundIdempotency(token, today)

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 退款/作废幂等验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
