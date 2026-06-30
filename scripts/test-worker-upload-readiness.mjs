#!/usr/bin/env node
import {
  SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:worker-upload-readiness', TIMEOUTS.acceptanceFull)

const BASE = SERVER.replace(/\/$/, '')
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

async function main() {
  await ensureServerRunning(() => {})
  const token = await login(BASE)

  console.log('\n--- Worker 上传就绪 ---')
  const st = await fetchJson(`${BASE}/api/worker/status`, { headers: authHeaders(token) })
  if (st.res.ok && st.json.data) {
    const d = st.json.data
    if (d.socketOpen && !d.uploadChannelReady && d.message?.includes('上传通道')) {
      pass('socket 在线但上传未就绪时不显示全绿已连接')
    } else if (!d.socketOpen && !d.uploadChannelReady) {
      pass('Worker 离线时 uploadChannelReady=false')
    } else if (d.uploadChannelReady) {
      pass('Worker 上传通道就绪')
    } else {
      pass('Worker 状态接口可用')
    }
    if (d.online && !d.uploadChannelReady) {
      fail('不允许 upload 未就绪却 online=true')
    } else {
      pass('online 与 uploadChannelReady 一致')
    }
  } else {
    fail('GET /api/worker/status', st.text)
  }

  const probe = await fetchJson(`${BASE}/api/worker/probe-upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ timeoutMs: 3000 }),
  })
  if (probe.res.ok) {
    pass('probe-upload 接口可用')
    if (!probe.json.data?.ok) {
      pass('probe 失败时有大白话提示')
    }
  } else {
    fail('probe-upload', probe.text)
  }

  const today = new Date().toISOString().slice(0, 10)
  const create = await fetchJson(`${BASE}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 12.34,
      expenseType: '包装耗材',
      paySource: '微信',
      occurredAt: today,
      remark: 'test-worker-upload-readiness-no-image',
    }),
  })
  if (create.res.ok && create.json.data?.id) {
    pass('Worker 不可用时仍可保存无图支出')
    await fetchJson(`${BASE}/api/expenses/${create.json.data.id}/void`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ voidReason: '测试清理' }),
    })
  } else {
    fail('保存无图支出', create.text)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
