/**
 * 在 apps/server 工作目录下执行 core-ledger 数据库操作
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.join(__dirname, '..', '..', 'apps', 'server')
const RUNNER = path.join(SERVER_ROOT, 'scripts', 'ledger-test-runner.mjs')

function runLedgerAction(action, args = {}) {
  const result = spawnSync(
    process.execPath,
    [RUNNER, action, JSON.stringify(args)],
    {
      cwd: SERVER_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: 'file:./data/accounting.db',
      },
      encoding: 'utf-8',
      timeout: 120000,
    },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `ledger action failed: ${action}`)
  }
  const line = result.stdout.trim().split('\n').filter(Boolean).pop()
  return line ? JSON.parse(line) : null
}

export function syncSaleLedgerRepeated(saleId, times = 3) {
  return runLedgerAction('sync-sale-repeated', { saleId, times })
}

export function syncExpenseLedgerRepeated(expenseId, times = 3) {
  return runLedgerAction('sync-expense-repeated', { expenseId, times })
}

export function aggregateProfitFromLedgerDirect(saleId) {
  return runLedgerAction('aggregate-profit', { saleId })
}

export function setBraceletInboundCost(braceletId, inboundCost) {
  return runLedgerAction('set-inbound-cost', { braceletId, inboundCost })
}
