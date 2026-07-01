#!/usr/bin/env node
/**
 * 管理员互相禁用 / 自禁用 安全验收
 */
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, getAdminCredentials,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:admin-disable-safety', TIMEOUTS.acceptanceBasic)

const BASE = (process.env.ACCEPTANCE_SERVER || SERVER).replace(/\/$/, '')
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

async function api(token, url, opts = {}) {
  return fetchJson(`${BASE}${url}`, {
    ...opts,
    headers: { ...authHeaders(token), ...(opts.headers || {}) },
  })
}

async function registerUser(username, displayName) {
  const password = 'test123456'
  return fetchJson(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, confirmPassword: password, displayName }),
  })
}

async function main() {
  console.log('=== test:admin-disable-safety ===')
  console.log('server:', BASE)
  await ensureServerRunning((m) => console.log(m))

  const adminToken = await login(BASE)
  const adminCreds = await getAdminCredentials()
  const suffix = Date.now().toString().slice(-6)

  const suffixA = `adm_a_${suffix}`
  const suffixB = `adm_b_${suffix}`

  for (const [u, name] of [[suffixA, '管理员A'], [suffixB, '管理员B']]) {
    const reg = await registerUser(u, name)
    if (!reg.res.ok) { fail(`注册 ${u}`, reg.text); process.exit(1) }
    const users = await api(adminToken, '/api/users')
    const target = users.json.data?.find((x) => x.username === u)
    await api(adminToken, `/api/users/${target.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ roleName: '管理员' }),
    })
  }

  const usersRes = await api(adminToken, '/api/users')
  const adminA = usersRes.json.data?.find((u) => u.username === suffixA)
  const adminB = usersRes.json.data?.find((u) => u.username === suffixB)
  const fanfan = usersRes.json.data?.find((u) => u.username === adminCreds.username)

  if (!adminA || !adminB) { fail('创建两名测试管理员'); process.exit(1) }
  pass('创建两名测试管理员')

  const tokenA = (await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: suffixA, password: 'test123456' }),
  })).json.data?.token
  const tokenB = (await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: suffixB, password: 'test123456' }),
  })).json.data?.token

  // 1. fanfan 不能被禁用
  const blockFanfan = await api(adminToken, `/api/users/${fanfan.id}/disable`, { method: 'POST' })
  if (blockFanfan.res.status === 400) pass('fanfan 不能被禁用')
  else fail('fanfan 保护', blockFanfan.text)

  // 2. 不能禁用自己
  const selfA = await api(tokenA, `/api/users/${adminA.id}/disable`, { method: 'POST' })
  if (selfA.res.status === 400 && selfA.json.message?.includes('自己')) pass('管理员 A 不能禁用自己')
  else fail('禁止自禁用', selfA.text)

  // 3. 管理员 A 可以禁用管理员 B
  const disableB = await api(tokenA, `/api/users/${adminB.id}/disable`, { method: 'POST' })
  if (disableB.res.ok) pass('管理员 A 可禁用管理员 B')
  else fail('互禁其他管理员', disableB.text)

  // 4. 被禁用后不能登录
  const loginB = await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: suffixB, password: 'test123456' }),
  })
  if (loginB.res.status === 403) pass('被禁用后不能登录')
  else fail('禁用后登录拦截', loginB.text)

  // 5. 被禁用后旧 token 不能继续调 API
  const meB = await api(tokenB, '/api/auth/me')
  if (meB.res.status === 403) pass('被禁用后旧 token 立即失效')
  else fail('禁用后 token 仍可用', meB.text)

  // 6. 启用 B 后可再登录
  await api(adminToken, `/api/users/${adminB.id}/enable`, { method: 'POST' })
  const loginB2 = await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: suffixB, password: 'test123456' }),
  })
  if (loginB2.res.ok) pass('启用后可重新登录')
  else fail('启用后登录', loginB2.text)

  // cleanup: disable test admins (fanfan 受保护)
  for (const u of [adminA, adminB].filter(Boolean)) {
    await api(adminToken, `/api/users/${u.id}/disable`, { method: 'POST' }).catch(() => {})
  }
  pass('测试账号已清理（禁用）')

  console.log(`\n=== 结果: ${failed === 0 ? '全部通过' : `${failed} 项失败`} ===`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
