#!/usr/bin/env node
/** 登录体验验收（远程 API，不输出密码明文） */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SERVER = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')

async function login(username, password) {
  const r = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return { status: r.status, json: await r.json() }
}

const pwdFile = path.join(ROOT, 'secrets/initial-admin-password.txt')
const goodPwd = fs.readFileSync(pwdFile, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim()

console.log(`\n=== 登录验收 (${SERVER}) ===\n`)

const bad = await login('admin', 'admin123')
console.log(`admin/admin123: ${bad.json.success ? 'FAIL 仍可登录' : 'OK 已拒绝'}`)

if (goodPwd) {
  const ok = await login('admin', goodPwd)
  console.log(`admin/当前密码: ${ok.json.success ? 'OK 登录成功' : 'FAIL ' + ok.json.message}`)
}

process.exit(bad.json.success ? 1 : 0)
