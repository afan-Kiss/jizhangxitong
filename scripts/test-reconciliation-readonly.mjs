#!/usr/bin/env node
/** 生产只读验收：资金对账中心相关接口可读，不写入测试支出 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, localDateString,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = SERVER.replace(/\/$/, '')
let failed = 0
function pass(n, d = '') { console.log(`✓ ${n}${d ? ` — ${d}` : ''}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

installScriptTimeout('test:reconciliation-readonly', TIMEOUTS.acceptanceBasic)

async function main() {
  console.log('\n=== test:reconciliation-readonly ===\n')
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = localDateString()

  const health = await fetchJson(`${BASE}/api/health`)
  if (health.res.ok) pass('health 可读')
  else fail('health 可读', health.text?.slice(0, 120))

  const summary = await fetchJson(
    `${BASE}/api/expenses/summary?period=custom&startDate=${today}&endDate=${today}`,
    { headers: authHeaders(token) },
  )
  if (summary.res.ok && summary.json.data?.totalAmount != null) {
    pass('资金对账 summary 可读', `笔数=${summary.json.data.totalCount}`)
  } else {
    fail('资金对账 summary', summary.text?.slice(0, 120))
  }

  const list = await fetchJson(
    `${BASE}/api/expenses?startDate=${today}&endDate=${today}&pageSize=5`,
    { headers: authHeaders(token) },
  )
  if (list.res.ok && Array.isArray(list.json.data?.items)) pass('支出列表可读')
  else fail('支出列表可读', list.text?.slice(0, 120))

  const exportHead = await fetch(
    `${BASE}/api/finance/export?format=xlsx&startDate=${today}&endDate=${today}`,
    { headers: authHeaders(token), method: 'GET' },
  )
  if (exportHead.ok || exportHead.status === 200) pass('对账 Excel 导出接口可读')
  else fail('对账 Excel 导出接口', String(exportHead.status))

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — 只读对账验收\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
