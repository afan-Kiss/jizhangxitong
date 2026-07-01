#!/usr/bin/env node
/** 项目专用资金记支出验收 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = SERVER.replace(/\/$/, '')
const TAG = `FUND-${Date.now()}`
let failed = 0
function pass(n, d = '') { console.log(`✓ ${n}${d ? ` — ${d}` : ''}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:fund-expense', TIMEOUTS.acceptanceBasic)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function main() {
  console.log('\n=== test:fund-expense ===\n')
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = new Date().toISOString().slice(0, 10)

  const created = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 3.21,
      expenseType: '办公杂费',
      businessType: 'normal',
      occurredAt: today,
      remark: `${TAG}-default-pay`,
    }),
  })
  const exp = created.json.data
  if (created.res.ok && exp?.paySource === '项目专用资金') pass('新建支出默认项目专用资金')
  else fail('新建支出默认项目专用资金', created.text?.slice(0, 120))

  if (exp?.reimbursementStatus === 'not_required') pass('新建支出 reimbursementStatus=not_required')
  else fail('新建支出 reimbursementStatus', exp?.reimbursementStatus)

  const staffPay = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 1,
      expenseType: '办公杂费',
      paySource: '员工垫付',
      occurredAt: today,
      remark: `${TAG}-reject-staff`,
    }),
  })
  if (!staffPay.res.ok && /项目专用资金|员工垫付/.test(staffPay.json.message || staffPay.text || '')) {
    pass('拒绝员工垫付记支出')
  } else {
    fail('拒绝员工垫付记支出', staffPay.text?.slice(0, 120))
  }

  const summary = await api(token, `/api/expenses/summary?period=custom&startDate=${today}&endDate=${today}`)
  if (summary.res.ok && summary.json.data?.totalAmount != null) pass('支出统计接口可用')
  else fail('支出统计接口', summary.text?.slice(0, 120))

  if (exp?.id) {
    await api(token, `/api/expenses/${exp.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason: `${TAG} cleanup` }),
    })
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 项目专用资金记支出\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
