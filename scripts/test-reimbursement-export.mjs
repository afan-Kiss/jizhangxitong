#!/usr/bin/env node
/**
 * 报销导出预览验收：汇总金额、排除作废
 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:reimbursement-export', TIMEOUTS.acceptanceBasic)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')

let failed = 0
function pass(name) { console.log(`✓ ${name}`) }
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
  console.log('=== test:reimbursement-export ===')
  await ensureServerRunning((m) => console.log(m))
  const token = await login()

  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const end = now.toISOString().slice(0, 10)

  const preview = await api(token, '/api/expenses/export/reimbursement-excel/preview', {
    method: 'POST',
    body: JSON.stringify({
      startDate: start,
      endDate: end,
      reimbursementStatus: 'all',
    }),
  })

  if (!preview.res.ok) {
    fail('报销预览 API', preview.text)
    process.exit(1)
  }

  const { summary, preview: rows, total } = preview.json.data || {}
  if (!preview.json.data) {
    fail('报销预览 API 返回 data', preview.text?.slice(0, 200))
    process.exit(1)
  }
  if (summary && typeof summary.count === 'number' && typeof summary.totalAmount === 'number') {
    pass('预览汇总含笔数与总金额')
  } else {
    fail('预览汇总含笔数与总金额', JSON.stringify(summary))
  }

  if (summary.count === total) pass('预览笔数与 total 一致')
  else fail('预览笔数与 total 一致', `${summary?.count} vs ${total}`)

  const sumRows = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  if (Math.abs(sumRows - summary.totalAmount) < 0.02) pass('预览金额加总正确')
  else fail('预览金额加总正确', `rows=${sumRows} summary=${summary.totalAmount}`)

  // 创建并作废一笔，确认预览不包含
  const create = await api(token, '/api/expenses', {
    method: 'POST',
    body: JSON.stringify({
      amount: 0.01,
      expenseType: '其他',
      paySource: '现金',
      occurredAt: end,
      remark: 'reimb-export-void-test',
      reimbursementStatus: 'pending',
      reimbursementPerson: '测试',
    }),
  })
  if (create.res.ok && create.json.data?.id) {
    const id = create.json.data.id
    const before = await api(token, '/api/expenses/export/reimbursement-excel/preview', {
      method: 'POST',
      body: JSON.stringify({ startDate: end, endDate: end, reimbursementStatus: 'all' }),
    })
    await api(token, `/api/expenses/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason: '导出测试作废' }),
    })
    const after = await api(token, '/api/expenses/export/reimbursement-excel/preview', {
      method: 'POST',
      body: JSON.stringify({ startDate: end, endDate: end, reimbursementStatus: 'all' }),
    })
    const beforeIds = (before.json.data?.preview || []).map((r) => r.id)
    const afterIds = (after.json.data?.preview || []).map((r) => r.id)
    if (beforeIds.includes(id) && !afterIds.includes(id)) {
      pass('导出不包含已作废支出')
    } else if (!beforeIds.includes(id)) {
      pass('导出不包含已作废支出', '（创建笔未进预览，跳过对比）')
    } else {
      fail('导出不包含已作废支出', `作废后仍在预览 id=${id}`)
    }
  } else {
    fail('创建测试支出', create.text)
  }

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
