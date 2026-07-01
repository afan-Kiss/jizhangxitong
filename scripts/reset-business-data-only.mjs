#!/usr/bin/env node
/**
 * 清除业务数据，保留全部用户（本地或配合远程脚本使用）
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT } from './lib/services.mjs'
import { assertSafeDatabaseUrl } from './lib/prod-db-guard.mjs'

assertSafeDatabaseUrl(process.env.DATABASE_URL)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

execSync('npx tsx scripts/reset-business-data-only.ts', {
  cwd: path.join(ROOT, 'apps/server'),
  stdio: 'inherit',
  env: { ...process.env },
})
