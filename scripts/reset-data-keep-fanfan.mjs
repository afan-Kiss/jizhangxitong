#!/usr/bin/env node
/**
 * 清除测试数据和业务数据，只保留 fanfan 管理员和基础配置
 * 注意：不会修改 fanfan 已有密码，也不会覆盖 secrets 文件
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT } from './lib/services.mjs'
import { assertSafeDatabaseUrl } from './lib/prod-db-guard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const dbPath = process.env.DATABASE_URL || 'file:./data/accounting.db'
  assertSafeDatabaseUrl(dbPath)
  execSync('npx tsx scripts/reset-data-keep-fanfan.ts', {
    cwd: path.join(ROOT, 'apps/server'),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: dbPath,
    },
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
