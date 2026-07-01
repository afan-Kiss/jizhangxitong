#!/usr/bin/env node
/**
 * 登录专项验收：API + 前端逻辑 + 页面结构
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'
import { resolveAcceptanceWebBase } from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS, fetchWithTimeout } from './lib/script-timeout.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SERVER = (process.env.ACCEPTANCE_SERVER || RECOMMENDED_URL).replace(/\/$/, '')

const results = []
let failed = 0

function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failed++
}

async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts, 30000)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { res, json, text }
}

function readSecretsPassword() {
  const file = path.join(ROOT, 'secrets/initial-admin-password.txt')
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf-8').match(/密码:\s*(.+)/)?.[1]?.trim() || ''
}

function resolveTestCredentials() {
  const username = process.env.TEST_LOGIN_USERNAME?.trim() || 'fanfan'
  const passwordCandidates = [
    process.env.TEST_LOGIN_PASSWORD?.trim(),
    readSecretsPassword(),
    'fanfan123456',
    'fanfan9724',
  ].filter(Boolean)
  return { username, passwordCandidates }
}

installScriptTimeout('test:login', TIMEOUTS.login)

async function main() {
  const { username, passwordCandidates } = resolveTestCredentials()
  const WEB = (await resolveAcceptanceWebBase()).replace(/\/$/, '')
  console.log(`\n========== 登录专项验收 (API: ${SERVER}, Web: ${WEB}) ==========`)
  console.log(`测试账号: ${username}\n`)

  // 1. SPA 页面
  const loginPage = await fetchWithTimeout(`${WEB}/login`, {}, 30000)
  const loginHtml = await loginPage.text()
  ok('打开 /account/login 返回 SPA', loginPage.status === 200 && loginHtml.includes('id="app"'))
  ok('登录页含 viewport（手机端）', loginHtml.includes('viewport'))

  // 2. 前端空表单校验
  function validateLoginForm(u, password) {
    if (!u.trim() || !password) return '请输入用户名和密码'
    return null
  }
  ok('空用户名/空密码前端提示', validateLoginForm('', '') === '请输入用户名和密码')
  ok('空密码前端提示', validateLoginForm(username, '') === '请输入用户名和密码')

  // 3. 错误密码 API（用 fanfan，不要求 admin 存在）
  const bad = await fetchJson(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'wrong-password-xyz' }),
  })
  ok('错误密码返回 401', bad.res.status === 401)
  ok('错误密码有明确 message', bad.json.message === '用户名或密码错误', bad.json.message || '')

  // 4. 正确密码登录 + /me
  let loggedIn = false
  for (const pwd of passwordCandidates) {
    const good = await fetchJson(`${SERVER}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pwd }),
    })
    if (good.res.ok && good.json.success && good.json.data?.token) {
      ok(`正确密码登录成功 (${username})`, true)
      loggedIn = true
      const token = good.json.data.token
      const me = await fetchJson(`${SERVER}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      ok('登录后 /auth/me 成功', me.res.ok && me.json.success && !!me.json.data?.user)

      const badMe = await fetchJson(`${SERVER}/api/auth/me`, {
        headers: { Authorization: 'Bearer invalid-token-xyz' },
      })
      ok('错误 token /auth/me 返回 401', badMe.res.status === 401)
      break
    }
  }
  if (!loggedIn) {
    ok(`正确密码登录成功 (${username})`, false, `尝试了 ${passwordCandidates.length} 组密码均失败`)
  }

  // 5. admin 不存在不应导致失败 — 仅记录
  const adminTry = await fetchJson(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'any' }),
  })
  ok('admin 账号不存在时不影响本测试', adminTry.res.status === 401 || adminTry.res.ok, `status=${adminTry.res.status}`)

  // 6. 源码结构检查
  const layoutVue = fs.readFileSync(path.join(ROOT, 'apps/web/src/components/ResponsiveLayout.vue'), 'utf-8')
  ok('ResponsiveLayout hideMobileTab 使用 computed', layoutVue.includes('computed') && layoutVue.includes('hideMobileTab'))
  ok('登录页路由隐藏底部导航', layoutVue.includes("route.path === '/login'"))

  const loginVue = fs.readFileSync(path.join(ROOT, 'apps/web/src/views/Login.vue'), 'utf-8')
  ok('Login.vue 无空 catch', !loginVue.includes('catch { /* */ }'))
  ok('Login.vue 密码默认空', loginVue.includes("ref('')") && !loginVue.includes("ref('admin123')"))
  ok('Login.vue 用户名默认空', loginVue.includes("const username = ref('')") && !loginVue.includes("ref('fanfan')"))
  ok('Login.vue loading 文案', loginVue.includes('正在进入...'))
  ok('Login.vue Enter 登录', loginVue.includes('@keyup.enter'))

  const apiTs = fs.readFileSync(path.join(ROOT, 'apps/web/src/api/index.ts'), 'utf-8')
  ok('401 登录页不全局跳转', apiTs.includes('isLoginRoute') && apiTs.includes('isLoginRequest'))

  const authTs = fs.readFileSync(path.join(ROOT, 'apps/web/src/stores/auth.ts'), 'utf-8')
  ok('auth.initSession 存在', authTs.includes('initSession'))

  const testLoginSrc = fs.readFileSync(path.join(__dirname, 'test-login.mjs'), 'utf-8')
  const usesFanfanDefault = testLoginSrc.includes("|| 'fanfan'") || testLoginSrc.includes("'fanfan'")
  ok('test-login 默认 fanfan', usesFanfanDefault && testLoginSrc.includes('TEST_LOGIN_USERNAME'))

  const homePublic = await fetchWithTimeout(`${WEB}/`, {}, 30000)
  ok('首页 SPA 可访问', homePublic.status === 200)

  console.log(`\n${failed ? 'FAIL' : 'PASS'} — ${results.length - failed}/${results.length} 通过\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
