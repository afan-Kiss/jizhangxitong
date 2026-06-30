#!/usr/bin/env node
/**
 * 财务核心收口验收 — core-ledger 唯一计算 + finance_ledger 对账
 */
import path from 'path'
import { pathToFileURL } from 'url'
import { fileURLToPath } from 'url'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = SERVER.replace(/\/$/, '')

installScriptTimeout('test:core-ledger', TIMEOUTS.acceptanceBasic)

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

async function loadCoreLedger() {
  const distPath = path.join(ROOT, 'apps/server/dist/finance/core-ledger.js')
  return import(pathToFileURL(distPath).href)
}

async function main() {
  console.log('\n=== test:core-ledger ===\n')
  await ensureServerRunning((m) => console.log(m))

  const { calculateProfit, calculateEffectiveSales, calculateExpenseImpact } = await loadCoreLedger()

  const fin = calculateProfit({
    saleAmount: 1000,
    totalCostSnapshot: 400,
    grossProfit: 600,
    refunds: [{ id: 1, refundAmount: 50, status: 'completed' }],
    expenses: [{ id: 2, expenseType: '客户返款', amount: 30, businessType: 'customer_refund' }],
  })
  if (fin.income === 1000 && fin.cost === 400 && fin.refund === 50 && fin.compensation === 30 && fin.netProfit === 520) {
    pass('calculateProfit 统一结构', `net=${fin.netProfit}`)
  } else {
    fail('calculateProfit 统一结构', JSON.stringify(fin))
  }

  if (fin.breakdown.length >= 4) pass('calculateProfit breakdown')
  else fail('calculateProfit breakdown', String(fin.breakdown.length))

  const eff = calculateEffectiveSales([
    { status: 'sold', afterSaleStatus: null, saleAmount: 100, refunds: [] },
    { status: 'sold', afterSaleStatus: '售后处理中', saleAmount: 200, refunds: [] },
  ])
  if (eff.effectiveOrderCount === 1 && eff.effectiveSaleAmount === 100) pass('calculateEffectiveSales')
  else fail('calculateEffectiveSales', JSON.stringify(eff))

  const impact = calculateExpenseImpact({
    expenseType: '客户返款',
    businessType: 'customer_refund',
    amount: 10,
  })
  if (impact.affectsProfit && impact.category === 'compensation') pass('calculateExpenseImpact 客户返款')
  else fail('calculateExpenseImpact', JSON.stringify(impact))

  const token = await login()
  const rebuild = await api(token, '/api/maintenance/rebuild-ledger', { method: 'POST' })
  if (rebuild.res.ok && rebuild.json.data?.entries >= 0) {
    pass('rebuildLedger API', `${rebuild.json.data.entries} entries`)
  } else {
    fail('rebuildLedger API', rebuild.text)
  }

  const sales = await api(token, '/api/sales?pageSize=1&status=sold')
  const saleId = sales.json.data?.items?.[0]?.id
  if (saleId) {
    const detail = await api(token, `/api/sales/${saleId}`)
    const d = detail.json.data
    const row = calculateProfit({
      saleAmount: d.saleAmount,
      totalCostSnapshot: d.totalCostSnapshot,
      grossProfit: d.grossProfit,
      refunds: d.refunds,
      expenses: d.expenses,
    })
    const diff = Math.abs(row.netProfit - Number(d.finalProfit ?? d.profit ?? 0))
    if (diff < 0.02) pass('API 销售利润与 core-ledger 一致', `#${saleId}`)
    else fail('API 销售利润与 core-ledger 一致', `${row.netProfit} vs ${d.finalProfit}`)
  } else {
    pass('API 销售利润与 core-ledger 一致', '（无销售，跳过）')
  }

  const worker = await api(token, '/api/local-worker/status')
  if (typeof worker.json.data?.online === 'boolean' && typeof worker.json.data?.socketOpen === 'boolean') {
    pass('Worker 状态含 socketOpen')
    if (worker.json.data.online === worker.json.data.socketOpen) {
      pass('Worker online 与 socketOpen 一致')
    } else {
      fail('Worker online 与 socketOpen 一致', JSON.stringify(worker.json.data))
    }
  } else {
    fail('Worker 状态含 socketOpen', worker.text)
  }

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
