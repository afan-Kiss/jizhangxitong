#!/usr/bin/env node
/** 生产库 reset 脚本保护验收 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { assertSafeDatabaseUrl } from './lib/prod-db-guard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

console.log('\n=== test:prod-db-guard ===\n')

const cases = [
  { url: 'file:/www/wwwroot/jade-accounting/apps/server/prisma/data/accounting.db', shouldReject: true },
  { url: 'file:./data/accounting.db', env: {}, shouldReject: false },
  { url: 'file:./data/accounting.db', env: { NODE_ENV: 'production' }, shouldReject: true },
  { url: 'postgresql://user@8.137.126.18/db', shouldReject: true },
]

for (const c of cases) {
  const prev = { ...process.env }
  Object.assign(process.env, c.env || {})
  try {
    assertSafeDatabaseUrl(c.url)
    if (c.shouldReject) fail(`应拒绝 ${c.url}`)
    else pass(`允许 ${c.url}`)
  } catch (err) {
    if (c.shouldReject) pass(`拒绝 ${c.url}`)
    else fail(`不应拒绝 ${c.url}`, err.message)
  } finally {
    process.env = prev
  }
}

try {
  execSync('node scripts/reset-data-keep-fanfan.mjs', {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: 'file:/www/wwwroot/jade-accounting/apps/server/prisma/data/accounting.db',
    },
    stdio: 'pipe',
  })
  fail('reset-data-keep-fanfan 应拒绝生产库')
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`
  if (/拒绝清理|生产库/.test(out)) pass('reset-data-keep-fanfan 拒绝生产库')
  else fail('reset-data-keep-fanfan 拒绝生产库', out.slice(0, 200))
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} — 生产库保护\n`)
process.exit(failed ? 1 : 0)
