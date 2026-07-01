#!/usr/bin/env node
/** 生产部署保全 shell / restore 脚本静态验收 */
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const GUARD_PY = path.join(ROOT, 'deploy/aliyun/prod_data_guard.py')
const RESTORE_PY = path.join(ROOT, 'deploy/aliyun/restore-prod-db-from-backup.py')

let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

console.log('\n=== test:production-data-guard ===\n')

const guardSource = fs.readFileSync(GUARD_PY, 'utf-8')
const restoreSource = fs.readFileSync(RESTORE_PY, 'utf-8')

if (!/shell_preserve_production_data/.test(guardSource)) {
  fail('prod_data_guard 含 shell_preserve_production_data')
} else {
  pass('prod_data_guard 含 shell_preserve_production_data')
}

const preserveShell = execFileSync(
  process.platform === 'win32' ? 'python' : 'python3',
  ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'deploy/aliyun'))})
from prod_data_guard import shell_preserve_production_data, shell_restore_preserved_data
print(shell_preserve_production_data('/www/wwwroot/jade-accounting'))
print('---SPLIT---')
print(shell_restore_preserved_data('/www/wwwroot/jade-accounting'))
`],
  { encoding: 'utf-8' },
)
const [preservePart, restorePart] = preserveShell.split('---SPLIT---')

if (/\|\|\s*true/.test(preservePart)) fail('preserve shell 不含 || true')
else pass('preserve shell 不含 || true')

if (/\|\|\s*true/.test(restorePart)) fail('restore shell 不含 || true')
else pass('restore shell 不含 || true')

if (/cp -a.*2>\/dev\/null \|\| true/.test(guardSource)) {
  fail('prod_data_guard 源码无 cp 静默失败')
} else {
  pass('prod_data_guard 源码无 cp 静默失败')
}

if (/DEFAULT_BACKUP/.test(restoreSource)) fail('restore 脚本无 DEFAULT_BACKUP')
else pass('restore 脚本无 DEFAULT_BACKUP')

if (/require_destructive_confirmation/.test(restoreSource)) {
  pass('restore 脚本含 require_destructive_confirmation')
} else {
  fail('restore 脚本含 require_destructive_confirmation')
}

if (/restore production accounting\.db from backup/.test(restoreSource)) {
  pass('restore 确认文案正确')
} else {
  fail('restore 确认文案正确')
}

const noArg = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [RESTORE_PY],
  { encoding: 'utf-8' },
)
if (noArg.status !== 0) {
  pass('restore 不传备份路径会拒绝')
} else {
  fail('restore 不传备份路径会拒绝', `exit=${noArg.status}`)
}

const noConfirm = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [RESTORE_PY, '/www/backup/jade-accounting-20260101-000000/apps/server/prisma/data/accounting.db'],
  { encoding: 'utf-8', env: { ...process.env, CONFIRM_DESTROY_PRODUCTION_DATA: '' } },
)
if (noConfirm.status !== 0 && /拒绝|CONFIRM_DESTROY_PRODUCTION_DATA/.test(`${noConfirm.stdout}${noConfirm.stderr}`)) {
  pass('restore 无二次确认会拒绝')
} else {
  fail('restore 无二次确认会拒绝', `exit=${noConfirm.status}`)
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} — 生产数据保护 shell/restore\n`)
process.exit(failed ? 1 : 0)
