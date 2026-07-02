/**
 * 对账测试：直连 DB 注入/清理账本异常数据
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
      env: { ...process.env, DATABASE_URL: 'file:./data/accounting.db' },
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

export function injectOrphanLedger(args) {
  return runLedgerAction('inject-orphan-ledger', args)
}

export function injectDuplicateExpenseLedger(args) {
  return runLedgerAction('inject-duplicate-expense-ledger', args)
}

export function cleanupLedgerByRef(refId) {
  return runLedgerAction('cleanup-ledger-by-ref', { refId })
}

export function cleanupLedgerByIds(ids) {
  return runLedgerAction('cleanup-ledger-by-ids', { ids })
}
