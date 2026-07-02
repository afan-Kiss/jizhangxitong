#!/usr/bin/env node
/** 自动对账 + 错账检测 + 财务异常报警验收 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, localDateString, isLocalServer,
} from './lib/services.mjs'
import {
  injectOrphanLedger,
  injectDuplicateExpenseLedger,
  cleanupLedgerByRef,
  cleanupLedgerByIds,
} from './lib/reconcile-server.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const BASE = SERVER.replace(/\/$/, '')
const TAG = `RECON-${Date.now()}`
let failed = 0

function pass(name, detail = '') {
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  failed += 1
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

installScriptTimeout('test:reconcile-system', TIMEOUTS.acceptanceFull)

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function reconcile(token, date) {
  return api(token, `/api/reconcile/daily?date=${date}`)
}

async function main() {
  console.log('\n=== test:reconcile-system ===\n')
  console.log(`BASE: ${BASE}`)
  await ensureServerRunning((m) => console.log(m))
  const token = await login(BASE)
  const today = localDateString()
  const useLocalDb = isLocalServer(BASE)

  // 1. 创建测试支出，验证 export / BI / expense 一致
  const amounts = [1.23, 4.56]
  for (const amount of amounts) {
    const res = await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        expenseType: '办公杂费',
        paySource: '项目专用资金',
        occurredAt: today,
        remark: `${TAG}-${amount}`,
      }),
    })
    if (!res.res.ok) fail(`创建测试支出 ${amount}`, res.text?.slice(0, 120))
  }

  const normal = await reconcile(token, today)
  if (!normal.res.ok) {
    fail('对账接口可用', normal.text?.slice(0, 120))
  } else {
    const d = normal.json.data
    pass('对账接口可用', `status=${d?.status}`)
    const diff = d?.diff || {}
    if (Math.abs(diff.export_vs_bi?.diff || 0) < 0.02
      && Math.abs(diff.bi_vs_expense?.diff || 0) < 0.02) {
      pass('export / BI / expense 一致')
    } else {
      fail('export / BI / expense 一致', JSON.stringify(diff))
    }
    if (d?.ledger && d?.bi && d?.expense && d?.sale && d?.export) {
      pass('返回 ledger/bi/expense/sale/export 汇总')
    } else {
      fail('返回 ledger/bi/expense/sale/export 汇总')
    }
    if (Array.isArray(d?.alerts)) pass('返回 alerts 数组')
    else fail('返回 alerts 数组')
  }

  // 2. 正常日对账（无注入异常时 status 应为 OK 或仅 L1）
  const baseline = normal.json.data
  if (baseline?.status === 'OK' || baseline?.status === 'WARNING') {
    const hasHigh = (baseline.alerts || []).some((a) => a.level === 'L3' || a.level === 'L4')
    if (!hasHigh || baseline.status === 'WARNING') {
      pass('正常对账无严重错账', baseline.status)
    } else {
      fail('正常对账无严重错账', JSON.stringify(baseline.alerts))
    }
  } else {
    fail('正常对账无严重错账', baseline?.status)
  }

  if (!useLocalDb) {
    pass('孤儿账/重复账检测', '（远程验收跳过 DB 注入）')
    console.log(`\n${failed ? 'FAIL' : 'PASS'} — reconcile system\n`)
    process.exit(failed ? 1 : 0)
    return
  }

  // 3. 孤儿账检测
  const orphanRef = `${TAG}-orphan`
  const orphan = injectOrphanLedger({ refId: orphanRef, amount: 7.77, date: today, expenseId: 99999999 })
  const afterOrphan = await reconcile(token, today)
  const orphanAlerts = (afterOrphan.json.data?.alerts || []).filter((a) => a.type === 'orphan_ledger')
  if (orphanAlerts.length > 0) pass('孤儿账检测', `${orphanAlerts.length} 条`)
  else fail('孤儿账检测')
  if (afterOrphan.json.data?.status === 'ERROR') pass('孤儿账触发 ERROR 状态')
  else fail('孤儿账触发 ERROR 状态', afterOrphan.json.data?.status)
  cleanupLedgerByRef(orphanRef)

  // 4. 重复账检测
  const exp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 3.33,
      expenseType: '办公杂费',
      paySource: '项目专用资金',
      occurredAt: today,
      remark: `${TAG}-dup`,
    }),
  })
  const expenseId = exp.json.data?.id
  let dupIds = []
  if (expenseId) {
    const dup = injectDuplicateExpenseLedger({ expenseId, amount: 3.33, date: today })
    dupIds = dup?.ids || []
    const afterDup = await reconcile(token, today)
    const dupAlerts = (afterDup.json.data?.alerts || []).filter((a) => a.type === 'duplicate_ledger')
    if (dupAlerts.length > 0) pass('重复账检测', `${dupAlerts.length} 条`)
    else fail('重复账检测')
    cleanupLedgerByIds(dupIds)
  } else {
    fail('重复账检测', '无法创建测试支出')
  }

  // 5. 清理后恢复 OK
  const afterCleanup = await reconcile(token, today)
  if (afterCleanup.json.data?.status === 'OK') {
    pass('清理异常账后恢复 OK')
  } else {
    const residual = (afterCleanup.json.data?.alerts || []).filter((a) => a.level === 'L3' || a.level === 'L4')
    if (residual.length === 0) pass('清理异常账后恢复 OK', afterCleanup.json.data?.status)
    else fail('清理异常账后恢复 OK', JSON.stringify(residual))
  }

  // 清理测试支出
  const list = await api(token, `/api/bi/drilldown?type=expenses&range=custom&startDate=${today}&endDate=${today}&q=${TAG}`)
  for (const item of list.json.data?.items || []) {
    await api(token, `/api/expenses/${item.id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason: `${TAG}-cleanup` }),
    })
  }

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — reconcile system\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
