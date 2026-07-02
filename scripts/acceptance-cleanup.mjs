/**
 * 清理 test_auto_check 验收测试数据
 */
import { isAcceptanceTestExpense } from '@jade-account/shared'
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, writeMarkdownReport,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

const report = {
  sections: [
    ['清理结果', 'cleanup'],
    ['跳过的数据', 'skipped'],
    ['复查结果', 'verify'],
    ['失败原因', 'errors'],
  ],
  data: { cleanup: [], skipped: [], verify: [], errors: [] },
}

function log(section, msg, ok = true) {
  report.data[section].push(`${ok ? '✓' : '✗'} ${msg}`)
  console.log(`[${section}] ${ok ? '✓' : '✗'} ${msg}`)
}

async function main() {
  installScriptTimeout('acceptance:cleanup', TIMEOUTS.acceptanceCleanup)
  console.log('\n========== 验收测试数据清理 ==========\n')

  await ensureServerRunning((s, m, ok) => log('cleanup', m, ok !== false))

  let token
  try {
    token = await login()
  } catch (e) {
    log('errors', e.message, false)
    process.exit(1)
  }

  const summaryBefore = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const expenseBefore = summaryBefore.json.data?.totalAmount || 0
  log('cleanup', `清理前今日支出总额: ${expenseBefore}`)

  let clientVoided = 0
  for (let page = 1; page <= 50; page += 1) {
    const list = await fetchJson(`${SERVER}/api/expenses?page=${page}&pageSize=100`, {
      headers: authHeaders(token),
    })
    const items = list.json.data?.items || []
    if (!items.length) break
    for (const expense of items) {
      if (expense.isVoided || !isAcceptanceTestExpense(expense)) continue
      const voidRes = await fetchJson(`${SERVER}/api/expenses/${expense.id}/void`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ voidReason: 'acceptance test cleanup' }),
      })
      if (voidRes.res.ok) {
        clientVoided += 1
        log('cleanup', `客户端作废测试支出 #${expense.id}`)
      } else {
        log('errors', `作废支出 #${expense.id} 失败: ${voidRes.text}`, false)
      }
    }
    if (items.length < 100) break
  }
  if (clientVoided === 0) log('cleanup', '客户端扫描：无活跃测试支出')

  const cleanup = await fetchJson(`${SERVER}/api/maintenance/cleanup-test-data`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ force: true }),
  })

  if (!cleanup.res.ok) {
    log('errors', `清理 API 失败: ${cleanup.json.message || cleanup.text}`, false)
    process.exit(1)
  }

  const data = cleanup.json.data
  log('cleanup', `作废支出: ${data.expensesVoided.join(', ') || '无'}`)
  log('cleanup', `退款销售: ${data.salesRefunded.join(', ') || '无'}`)
  log('cleanup', `删除文件元数据: ${data.filesDeleted.join(', ') || '无'}`)
  log('cleanup', `删除本地文件: ${data.localFilesDeleted.length} 个`)
  log('cleanup', `删除账本分录: ${(data.ledgerEntriesDeleted || []).join(', ') || '无'}`)

  for (const s of data.expensesSkipped || []) log('skipped', `支出 id=${s.id}: ${s.reason}`)
  for (const s of data.salesSkipped || []) log('skipped', `销售 id=${s.id}: ${s.reason}`)
  for (const s of data.filesSkipped || []) log('skipped', `文件 id=${s.id}: ${s.reason}`)
  for (const f of data.localFilesFailed || []) log('errors', `本地文件 ${f.path}: ${f.reason}`, false)

  const summaryAfter = await fetchJson(`${SERVER}/api/expenses/summary?period=today`, { headers: authHeaders(token) })
  const expenseAfter = summaryAfter.json.data?.totalAmount || 0
  log('verify', `清理后今日支出总额: ${expenseAfter}`, expenseAfter <= expenseBefore)

  const testExpenses = await fetchJson(
    `${SERVER}/api/expenses?pageSize=100`,
    { headers: authHeaders(token) },
  )
  const hasTest = testExpenses.json.data?.items?.some(
    (e) => !e.isVoided && isAcceptanceTestExpense(e),
  )
  log('verify', `活跃支出中无测试数据: ${!hasTest}`, !hasTest)

  const reportPath = await writeMarkdownReport(report, 'cleanup')
  console.log(`\n报告已写入: ${reportPath}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
