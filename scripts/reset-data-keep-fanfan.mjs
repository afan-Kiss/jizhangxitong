#!/usr/bin/env node
/**
 * 清除测试数据和业务数据，只保留 fanfan 管理员和基础配置
 */
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT } from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const password = process.env.FANFAN_PASSWORD || 'fanfan123456'

async function writeSecrets() {
  const secretsDir = path.join(ROOT, 'secrets')
  await fs.mkdir(secretsDir, { recursive: true })
  await fs.writeFile(
    path.join(secretsDir, 'initial-admin-password.txt'),
    [
      '和田玉镯子记账系统 - 管理员账号',
      `更新时间: ${new Date().toLocaleString('zh-CN')}`,
      '用户名: fanfan',
      `密码: ${password}`,
      '',
    ].join('\n'),
    'utf-8',
  )
}

async function main() {
  const dbPath = process.env.DATABASE_URL || 'file:./data/accounting.db'
  execSync('npx tsx scripts/reset-data-keep-fanfan.ts', {
    cwd: path.join(ROOT, 'apps/server'),
    stdio: 'inherit',
    env: {
      ...process.env,
      FANFAN_PASSWORD: password,
      DATABASE_URL: dbPath,
    },
  })
  await writeSecrets()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
