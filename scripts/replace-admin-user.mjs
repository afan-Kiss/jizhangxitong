#!/usr/bin/env node
/**
 * 删除 admin，创建/更新指定管理员账号
 * 用法: ADMIN_USERNAME=fanfan ADMIN_PASSWORD=xxx node scripts/replace-admin-user.mjs
 */
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT } from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const username = (process.env.ADMIN_USERNAME || 'fanfan').trim()
const password = process.env.ADMIN_PASSWORD || process.argv[2]

if (!password) {
  console.error('请设置 ADMIN_PASSWORD 或传入密码参数')
  process.exit(1)
}

async function writeSecrets() {
  const secretsDir = path.join(ROOT, 'secrets')
  await fs.mkdir(secretsDir, { recursive: true })
  await fs.writeFile(
    path.join(secretsDir, 'initial-admin-password.txt'),
    [
      '和田玉镯子记账系统 - 管理员账号',
      `更新时间: ${new Date().toLocaleString('zh-CN')}`,
      `用户名: ${username}`,
      `密码: ${password}`,
      '',
    ].join('\n'),
    'utf-8',
  )
}

async function main() {
  console.log(`\n=== 替换管理员 → ${username} ===\n`)
  const dbPath = process.env.DATABASE_URL
    || `file:${path.join(ROOT, 'apps/server/prisma/data/accounting.db').replace(/\\/g, '/')}`
  execSync('npx tsx scripts/replace-admin-user.ts', {
    cwd: path.join(ROOT, 'apps/server'),
    stdio: 'inherit',
    env: {
      ...process.env,
      ADMIN_USERNAME: username,
      ADMIN_PASSWORD: password,
      DATABASE_URL: dbPath,
    },
  })
  await writeSecrets()
  console.log('\n已更新 secrets/initial-admin-password.txt\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
