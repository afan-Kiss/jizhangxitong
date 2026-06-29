#!/usr/bin/env node
/**
 * 轮换 admin 密码：写入 secrets/，控制台与报告不输出明文
 */
import crypto from 'crypto'
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchJson, loadDeployEnv } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PASSWORD_FILE = path.join(ROOT, 'secrets/initial-admin-password.txt')
const ROTATE_PY = path.join(ROOT, 'deploy/aliyun/rotate-admin-remote.py')

function generatePassword(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length]
  return out
}

async function main() {
  loadDeployEnv()
  const password = generatePassword(16)
  await fs.mkdir(path.join(ROOT, 'secrets'), { recursive: true })
  await fs.writeFile(
    PASSWORD_FILE,
    [
      '和田玉镯子记账系统 - 管理员密码',
      `更新时间: ${new Date().toLocaleString('zh-CN')}`,
      '用户名: admin',
      `密码: ${password}`,
      '',
      '此文件仅保存在本地，不会上传到 Git。',
    ].join('\n'),
    'utf-8',
  )

  // 本地数据库（若存在）
  try {
    execSync(`npx tsx apps/server/scripts/set-admin-password.ts`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, ADMIN_PASSWORD: password },
    })
  } catch { /* 本地库可选 */ }

  // 远程生产库
  loadDeployEnv()
  if (process.env.SSH_PASS) {
    execSync(`python "${ROTATE_PY}"`, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, ADMIN_PASSWORD: password },
    })
  }

  const server = (process.env.ACCEPTANCE_SERVER || 'http://8.137.126.18/account').replace(/\/$/, '')
  const loginOk = await fetchJson(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
  })
  const oldFail = await fetchJson(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })

  console.log('\n========== admin 密码已轮换 ==========')
  console.log('新密码已写入: secrets/initial-admin-password.txt')
  console.log('控制台不显示明文密码')
  console.log(`远程登录验证: ${loginOk.res.ok ? '成功 ✓' : '失败 ✗'}`)
  console.log(`admin123 已失效: ${!oldFail.res.ok ? '是 ✓' : '否 ✗'}`)

  if (!loginOk.res.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
