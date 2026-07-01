#!/usr/bin/env node
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning, getAdminCredentials,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:user-approval-and-audit', TIMEOUTS.acceptanceFull)

const BASE = SERVER.replace(/\/$/, '')
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

async function main() {
  await ensureServerRunning(() => {})
  const adminCreds = await getAdminCredentials()
  const suffix = Date.now().toString().slice(-6)
  const newUser = {
    username: `test_${suffix}`,
    password: 'test123456',
    displayName: `测试员工${suffix}`,
  }

  console.log('\n--- 注册审核 ---')
  const reg = await fetchJson(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...newUser,
      confirmPassword: newUser.password,
    }),
  })
  if (reg.res.ok && reg.json.data?.status === 'pending') pass('注册后状态 pending')
  else fail('注册 pending', reg.text)

  const pendingLogin = await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: newUser.username, password: newUser.password }),
  })
  if (pendingLogin.res.status === 403) pass('pending 用户不能登录')
  else fail('pending 登录拦截', pendingLogin.text)

  const adminToken = await login(BASE)
  const users = await fetchJson(`${BASE}/api/users`, { headers: authHeaders(adminToken) })
  const target = users.json.data?.find((u) => u.username === newUser.username)
  if (!target) {
    fail('管理员能看到待审核用户')
    process.exit(1)
  }
  pass('管理员能看到待审核用户')

  const approve = await fetchJson(`${BASE}/api/users/${target.id}/approve`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ roleName: '员工' }),
  })
  if (approve.res.ok) pass('fanfan 审核通过')
  else fail('审核通过', approve.text)

  const promote = await fetchJson(`${BASE}/api/users/${target.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ roleName: '管理员' }),
  })
  const usersAfterPromote = await fetchJson(`${BASE}/api/users`, { headers: authHeaders(adminToken) })
  const promoted = usersAfterPromote.json.data?.find((u) => u.id === target.id)
  if (promote.res.ok && promoted?.roles?.includes('管理员')) pass('管理员可把用户升为管理员')
  else fail('升为管理员', promote.text || JSON.stringify(promoted?.roles))

  const demote = await fetchJson(`${BASE}/api/users/${target.id}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ roleName: '员工' }),
  })
  if (demote.res.ok) pass('管理员可把用户改回员工')
  else fail('改回员工', demote.text)

  const userLogin = await fetchJson(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: newUser.username, password: newUser.password }),
  })
  if (userLogin.res.ok && userLogin.json.data?.token) pass('审核后可以登录')
  else fail('审核后登录', userLogin.text)

  const userToken = userLogin.json.data.token
  const today = new Date().toISOString().slice(0, 10)
  const expense = await fetchJson(`${BASE}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(userToken),
    body: JSON.stringify({
      amount: 33,
      expenseType: '包装耗材',
      paySource: '员工垫付',
      occurredAt: today,
      reimbursementPerson: newUser.displayName,
      remark: 'test-user-approval-audit',
    }),
  })
  if (!expense.res.ok) {
    fail('新用户创建支出', expense.text)
    process.exit(1)
  }
  pass('新用户创建支出')
  const expenseId = expense.json.data.id

  const detail = await fetchJson(`${BASE}/api/expenses/${expenseId}`, { headers: authHeaders(userToken) })
  if (detail.json.data?.createdByUser?.displayName === newUser.displayName) {
    pass('支出详情显示创建人')
  } else {
    fail('支出详情创建人', JSON.stringify(detail.json.data?.createdByUser))
  }

  const patch = await fetchJson(`${BASE}/api/expenses/${expenseId}`, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ amount: 30, remark: '管理员修改' }),
  })
  if (patch.res.ok) pass('修改支出成功')
  else fail('修改支出', patch.text)

  const detail2 = await fetchJson(`${BASE}/api/expenses/${expenseId}`, { headers: authHeaders(adminToken) })
  if (detail2.json.data?.updatedByUser) pass('修改后显示修改人')
  else fail('修改人显示')

  const logs = detail2.json.data?.operationLogs || []
  if (logs.some((l) => l.action === 'create_expense') && logs.some((l) => l.action === 'update_expense')) {
    pass('操作日志含 create/update')
  } else {
    fail('操作日志', JSON.stringify(logs.map((l) => l.action)))
  }

  const list = await fetchJson(`${BASE}/api/expenses?paySource=${encodeURIComponent('员工垫付')}`, {
    headers: authHeaders(adminToken),
  })
  const row = list.json.data?.items?.find((i) => i.id === expenseId)
  if (row?.submitterName) pass('支出列表显示提交人')
  else fail('支出提交人')

  const fanfan = users.json.data?.find((u) => u.username === 'fanfan')
  const disableFanfan = await fetchJson(`${BASE}/api/users/${fanfan.id}/disable`, {
    method: 'POST',
    headers: authHeaders(adminToken),
  })
  if (disableFanfan.res.status === 400) pass('fanfan 不能被禁用')
  else fail('fanfan 保护', disableFanfan.text)

  await fetchJson(`${BASE}/api/expenses/${expenseId}/void`, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify({ voidReason: '测试清理' }),
  })

  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
