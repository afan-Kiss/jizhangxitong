/**
 * npm run trial:cleanup
 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, writeMarkdownReport,
} from './lib/services.mjs'

const report = { sections: [['清理', 'cleanup']], data: { cleanup: [] } }

async function main() {
  console.log('\n========== 试用数据清理 ==========\n')
  await ensureServerRunning((s, m, ok) => console.log(m))

  const token = await login()
  const preview = await fetchJson(`${SERVER}/api/trial/preview`, { headers: authHeaders(token) })
  const p = preview.json.data
  console.log(`清理前: ${p.expenseCount} 笔支出 ¥${p.expenseAmount}，${p.saleCount} 笔销售 ¥${p.saleAmount}`)

  const summaryBefore = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const pendingBefore = summaryBefore.json.data?.pendingAmount || 0

  const res = await fetchJson(`${SERVER}/api/trial/cleanup`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  if (!res.res.ok) {
    console.error('清理失败:', res.json.message)
    process.exit(1)
  }

  const data = res.json.data
  console.log(`已作废支出: ${data.expensesVoided?.join(', ') || '无'}`)
  console.log(`已退款销售: ${data.salesRefunded?.join(', ') || '无'}`)
  console.log(`清理后今日金额: ${data.summaryAfter?.todayAmount}，未报销: ${data.summaryAfter?.pendingAmount}`)
  console.log(`（清理前未报销: ${pendingBefore}）`)

  report.data.cleanup.push(`支出作废 ${data.expensesVoided?.length || 0} 笔`)
  report.data.cleanup.push(`销售退款 ${data.salesRefunded?.length || 0} 笔`)
  await writeMarkdownReport(report, 'trial-cleanup')
  console.log('\n完成\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
