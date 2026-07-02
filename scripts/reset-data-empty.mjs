#!/usr/bin/env node
/**
 * 备份数据库并清空业务数据，保留全部用户与系统配置
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT } from './lib/services.mjs'
import { assertSafeDatabaseUrl } from './lib/prod-db-guard.mjs'

assertSafeDatabaseUrl(process.env.DATABASE_URL)

execSync('npx tsx scripts/reset-data-empty.ts', {
  cwd: path.join(ROOT, 'apps/server'),
  stdio: 'inherit',
  env: { ...process.env },
})
