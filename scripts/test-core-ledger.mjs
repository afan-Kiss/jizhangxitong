#!/usr/bin/env node
/**
 * 财务核心收口验收 — core-ledger 唯一计算 + finance_ledger 对账
 */
import path from 'path'
import { pathToFileURL } from 'url'
import { fileURLToPath } from 'url'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, isLocalServer,
} from './lib/services.mjs'
import {
  syncSaleLedgerRepeated,
  syncExpenseLedgerRepeated,
  aggregateProfitFromLedgerDirect,
  setBraceletInboundCost,
} from './lib/ledger-server.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = SERVER.replace(/\/$/, '')
const TAG = `CL-${Date.now()}`

async function loadCoreLedger() {
  const distPath = path.join(ROOT, 'apps/server/dist/finance/core-ledger.js')
  return import(pathToFileURL(distPath).href)
}

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

async function main() {
  console.log('\n=== test:core-ledger ===\n')
  await ensureServerRunning((m) => console.log(m))

  const {
    calculateProfit,
    calculateEffectiveSales,
    calculateExpenseImpact,
    isConfirmedRefund,
  } = await loadCoreLedger()

  const fin = calculateProfit({
    saleAmount: 1000,
    totalCostSnapshot: 400,
    grossProfit: 600,
    refunds: [{ id: 1, refundAmount: 50, status: 'completed' }],
    expenses: [{ id: 2, expenseType: '客户返款', amount: 30, businessType: 'customer_refund' }],
  })
  const fieldsOk = ['income', 'cost', 'refund', 'compensation', 'netProfit', 'breakdown']
    .every((k) => fin[k] !== undefined)
  if (fieldsOk && fin.income === 1000 && fin.cost === 400 && fin.refund === 50
    && fin.compensation === 30 && fin.netProfit === 520) {
    pass('calculateProfit 统一结构', `net=${fin.netProfit}`)
  } else {
    fail('calculateProfit 统一结构', JSON.stringify(fin))
  }

  if (fin.breakdown.length >= 4) pass('calculateProfit breakdown')
  else fail('calculateProfit breakdown', String(fin.breakdown.length))

  const pendingRefund = calculateProfit({
    saleAmount: 1000,
    totalCostSnapshot: 400,
    grossProfit: 600,
    refunds: [{ id: 3, refundAmount: 100, status: 'pending' }],
    expenses: [],
  })
  if (pendingRefund.refund === 0 && pendingRefund.netProfit === 600) {
    pass('pending/processing 退款不扣利润')
  } else {
    fail('pending/processing 退款不扣利润', JSON.stringify(pendingRefund))
  }

  const cancelledRefund = calculateProfit({
    saleAmount: 1000,
    totalCostSnapshot: 400,
    grossProfit: 600,
    refunds: [{ id: 4, refundAmount: 100, status: 'cancelled' }],
    expenses: [],
  })
  if (cancelledRefund.refund === 0) pass('cancelled 退款不扣利润')
  else fail('cancelled 退款不扣利润')

  for (const [label, exp] of [
    ['客户返款', { expenseType: '客户返款', businessType: 'customer_refund', amount: 10 }],
    ['客户补偿', { expenseType: '客户心理落差补偿', businessType: 'customer_compensation', amount: 10 }],
    ['售后补偿', { expenseType: '售后补偿', businessType: 'after_sale_compensation', amount: 10 }],
    ['平台扣款', { expenseType: '平台扣款', businessType: 'platform_fee', amount: 10, saleId: 1 }],
  ]) {
    const impact = calculateExpenseImpact(exp)
    if (impact.affectsProfit && impact.category === 'compensation') pass(`${label}扣利润`)
    else fail(`${label}扣利润`, JSON.stringify(impact))
  }

  const normalImpact = calculateExpenseImpact({ expenseType: '加工费', businessType: 'normal', amount: 50 })
  if (!normalImpact.affectsProfit && normalImpact.affectsCost) pass('普通支出不扣单品利润、计入成本')
  else fail('普通支出口径', JSON.stringify(normalImpact))

  const customerPayImpact = calculateExpenseImpact({
    expenseType: '客户返款',
    businessType: 'customer_refund',
    amount: 10,
  })
  if (customerPayImpact.affectsProfit && !customerPayImpact.affectsCost) {
    pass('客户返款不计入货品成本')
  } else {
    fail('客户返款不计入货品成本', JSON.stringify(customerPayImpact))
  }

  const eff = calculateEffectiveSales([
    { status: 'sold', afterSaleStatus: null, saleAmount: 100, refunds: [] },
    { status: 'sold', afterSaleStatus: '售后处理中', saleAmount: 200, refunds: [] },
  ])
  if (eff.effectiveOrderCount === 1 && eff.effectiveSaleAmount === 100) pass('calculateEffectiveSales')
  else fail('calculateEffectiveSales', JSON.stringify(eff))

  const token = await login()
  const today = new Date().toISOString().slice(0, 10)

  // dryRun 不写入
  const countBeforeDry = await api(token, '/api/maintenance/rebuild-ledger', {
    method: 'POST',
    body: JSON.stringify({ dryRun: true, force: true }),
  })
  const dryRun2 = await api(token, '/api/maintenance/rebuild-ledger', {
    method: 'POST',
    body: JSON.stringify({ dryRun: true, force: true }),
  })
  if (countBeforeDry.res.ok && countBeforeDry.json.data?.dryRun === true
    && dryRun2.json.data?.entriesAfter === countBeforeDry.json.data?.entriesBefore) {
    pass('rebuildLedger dryRun 不写入', `entries=${countBeforeDry.json.data.entriesBefore}`)
  } else {
    fail('rebuildLedger dryRun 不写入', countBeforeDry.text || dryRun2.text)
  }

  // 真实 rebuild（仅本地测试库；远程生产只跑 dryRun）
  if (isLocalServer(BASE)) {
    const rebuild1 = await api(token, '/api/maintenance/rebuild-ledger', {
      method: 'POST',
      body: JSON.stringify({ force: true }),
    })
    const rebuild2 = await api(token, '/api/maintenance/rebuild-ledger', {
      method: 'POST',
      body: JSON.stringify({ force: true }),
    })
    if (rebuild1.res.ok && rebuild2.res.ok
      && rebuild1.json.data?.entriesAfter === rebuild2.json.data?.entriesAfter
      && rebuild1.json.data?.entriesAfter > 0) {
      pass('rebuildLedger force 后 entriesAfter 稳定', `${rebuild1.json.data.entriesAfter} entries`)
    } else {
      fail('rebuildLedger 稳定性', `${rebuild1.json.data?.entriesAfter} vs ${rebuild2.json.data?.entriesAfter}`)
    }
  } else {
    pass('rebuildLedger force 稳定性', '（远程生产跳过真实 rebuild）')
  }

  const useLocalLedger = isLocalServer(BASE)

  // 同一 sale 多次 sync
  const sales = await api(token, '/api/sales?pageSize=1&status=sold')
  const saleId = sales.json.data?.items?.[0]?.id
  if (useLocalLedger && saleId) {
    const counts = await syncSaleLedgerRepeated(saleId, 3)
    const [c1, c2, c3] = counts
    if (c1 === c2 && c2 === c3 && c1 > 0) {
      pass('同一 sale 多次 sync 不重复分录', `${c1} entries`)
    } else {
      fail('同一 sale 多次 sync 不重复分录', `${c1}/${c2}/${c3}`)
    }

    const detail = await api(token, `/api/sales/${saleId}`)
    const d = detail.json.data
    const calc = calculateProfit({
      saleAmount: d.saleAmount,
      totalCostSnapshot: d.totalCostSnapshot,
      grossProfit: d.grossProfit,
      refunds: d.refunds,
      expenses: d.expenses,
    })
    const agg = await aggregateProfitFromLedgerDirect(saleId)
    const diff = agg ? Math.abs(calc.netProfit - agg.netProfit) : 999
    if (diff < 0.02) pass('aggregateProfitFromLedger 与 calculateProfit 一致', `#${saleId}`)
    else fail('aggregateProfitFromLedger 与 calculateProfit 一致', `${calc.netProfit} vs ${agg?.netProfit}`)

    const diffApi = Math.abs(calc.netProfit - Number(d.finalProfit ?? d.profit ?? 0))
    if (diffApi < 0.02) pass('API 销售利润与 core-ledger 一致')
    else fail('API 销售利润与 core-ledger 一致', `${calc.netProfit} vs ${d.finalProfit}`)
  } else if (saleId) {
    pass('同一 sale 多次 sync', '（远程验收，跳过本地 ledger 直连）')
    pass('aggregateProfitFromLedger', '（远程验收，跳过）')
    const detail = await api(token, `/api/sales/${saleId}`)
    const d = detail.json.data
    const calc = calculateProfit({
      saleAmount: d.saleAmount,
      totalCostSnapshot: d.totalCostSnapshot,
      grossProfit: d.grossProfit,
      refunds: d.refunds,
      expenses: d.expenses,
    })
    const diffApi = Math.abs(calc.netProfit - Number(d.finalProfit ?? d.profit ?? 0))
    if (diffApi < 0.02) pass('API 销售利润与 core-ledger 一致')
    else fail('API 销售利润与 core-ledger 一致', `${calc.netProfit} vs ${d.finalProfit}`)
  } else {
    pass('同一 sale 多次 sync', '（无销售，跳过）')
    pass('aggregateProfitFromLedger', '（跳过）')
    pass('API 销售利润与 core-ledger 一致', '（跳过）')
  }

  // 销售成本快照含绑定支出
  const code = `${TAG}-GOODS`
  const goodsRes = await api(token, '/api/goods', {
    method: 'POST',
    body: JSON.stringify({ code, name: code }),
  })
  const goodsId = goodsRes.json.data?.id
  if (goodsId) {
    if (useLocalLedger) {
      await setBraceletInboundCost(goodsId, 1000)
    } else {
      await api(token, '/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          businessType: 'item_cost',
          expenseType: '货品成本',
          amount: 1000,
          paySource: '微信',
          occurredAt: today,
          braceletId: goodsId,
          braceletCode: code,
          remark: `${TAG}-inbound`,
        }),
      })
    }

    await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: 'normal',
        expenseType: '加工费',
        amount: 200,
        paySource: '微信',
        occurredAt: today,
        braceletCode: code,
        remark: `${TAG}-machining`,
      }),
    })
    await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: 'normal',
        expenseType: '证书鉴定费',
        amount: 50,
        paySource: '微信',
        occurredAt: today,
        braceletCode: code,
        remark: `${TAG}-cert`,
      }),
    })

    const saleCreate = await api(token, '/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        platform: '其他',
        braceletCode: code,
        saleAmount: 3000,
        soldAt: today,
        remark: `${TAG}-sale`,
      }),
    })
    const newSaleId = saleCreate.json.data?.id
    const snapshot = Number(saleCreate.json.data?.totalCostSnapshot ?? 0)

    if (newSaleId && snapshot >= 1250) {
      pass('销售成本快照含绑定支出', `totalCostSnapshot=${snapshot}`)
    } else {
      fail('销售成本快照含绑定支出', `snapshot=${snapshot}, sale=${saleCreate.text}`)
    }

    // 销售后新增支出不应改快照
    await api(token, '/api/expenses', {
      method: 'POST',
      body: JSON.stringify({
        businessType: 'normal',
        expenseType: '抛光费',
        amount: 99,
        paySource: '微信',
        occurredAt: today,
        braceletCode: code,
        remark: `${TAG}-after-sale`,
      }),
    })
    const afterDetail = await api(token, `/api/sales/${newSaleId}`)
    const snapAfter = Number(afterDetail.json.data?.totalCostSnapshot ?? 0)
    if (Math.abs(snapAfter - snapshot) < 0.02) {
      pass('销售后新增支出不改变历史 totalCostSnapshot')
    } else {
      fail('销售后新增支出不改变历史 totalCostSnapshot', `${snapshot} -> ${snapAfter}`)
    }

    // 货品利润 API 与 calculateProfit 一致
    const profitRes = await api(token, `/api/goods/${goodsId}/profit`)
    const saleInfo = profitRes.json.data?.sale
    if (saleInfo && Math.abs(Number(saleInfo.finalProfit) - Number(afterDetail.json.data?.finalProfit ?? 0)) < 0.02) {
      pass('货品利润 API 与销售详情利润一致')
    } else {
      fail('货品利润 API 与销售详情利润一致', JSON.stringify(saleInfo))
    }
  } else {
    fail('销售成本快照测试', goodsRes.text)
  }

  // 同一 expense 多次 sync
  const orphanExp = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      businessType: 'customer_refund',
      expenseType: '客户返款',
      amount: 11.11,
      paySource: '微信',
      occurredAt: today,
      externalOrderNo: `${TAG}-ORPHAN`,
      remark: `${TAG}-orphan`,
    }),
  })
  const expenseId = orphanExp.json.data?.id
  if (expenseId && useLocalLedger) {
    const counts = await syncExpenseLedgerRepeated(expenseId, 3)
    const [e1, e2, e3] = counts
    if (e1 === e2 && e2 === e3 && e1 === 1) {
      pass('同一 expense 多次 sync 不重复分录')
    } else {
      fail('同一 expense 多次 sync 不重复分录', `${e1}/${e2}/${e3}`)
    }
  } else if (expenseId) {
    pass('同一 expense 多次 sync', '（远程验收，跳过本地 ledger 直连）')
  } else {
    fail('同一 expense 多次 sync', orphanExp.text)
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
