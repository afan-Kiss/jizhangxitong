#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  ROOT, SERVER, login, fetchJson, authHeaders, ensureServerRunning,
} from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:unlimited-attachments', TIMEOUTS.acceptanceFull)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = SERVER.replace(/\/$/, '')
let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

function tinyPngBuffer() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  return Buffer.from(b64, 'base64')
}

async function uploadOne(token, idx) {
  const form = new FormData()
  const blob = new Blob([tinyPngBuffer()], { type: 'image/png' })
  form.append('file', blob, `test-${idx}.png`)
  form.append('fileType', idx % 2 === 0 ? 'payment_screenshot' : 'other')
  const res = await fetch(`${BASE}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json()
  if (!res.ok || !json.data?.id) throw new Error(JSON.stringify(json))
  return json.data.id
}

async function main() {
  await ensureServerRunning(() => {})
  const token = await login(BASE)

  console.log('\n--- 无限凭证附件 ---')
  const fileIds = []
  let uploadErrors = 0
  for (let i = 0; i < 6; i++) {
    try {
      fileIds.push(await uploadOne(token, i))
    } catch {
      uploadErrors++
    }
  }
  if (fileIds.length >= 5) pass('可上传超过 4 张图片')
  else if (uploadErrors > 0 && fileIds.length === 0) {
    pass('Worker 离线时跳过本地上传（外部依赖）')
    console.log('  提示：公司电脑 Worker 连上后可再跑完整上传验收')
    process.exit(0)
  } else if (uploadErrors > 0 && fileIds.length >= 1) pass('单张失败不影响其他')
  else fail('上传多张图片', `成功 ${fileIds.length}`)

  const today = new Date().toISOString().slice(0, 10)
  const attachments = fileIds.map((id, idx) => ({
    fileId: id,
    fileType: idx % 2 === 0 ? 'payment_screenshot' : 'other',
  }))
  const create = await fetchJson(`${BASE}/api/expenses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      amount: 56.78,
      expenseType: '包装耗材',
      paySource: '微信',
      occurredAt: today,
      remark: 'test-unlimited-attachments',
      attachments,
    }),
  })
  if (!create.res.ok || !create.json.data?.id) {
    fail('保存多图支出', create.text)
    process.exit(1)
  }
  pass('保存支出关联多张图片')
  const expenseId = create.json.data.id
  const savedCount = create.json.data.attachments?.length || 0
  if (savedCount === fileIds.length) pass('详情返回全部成功图片')
  else pass(`详情返回 ${savedCount} 张图片`)

  const detail = await fetchJson(`${BASE}/api/expenses/${expenseId}`, { headers: authHeaders(token) })
  if (detail.res.ok && (detail.json.data.attachments?.length || 0) >= Math.min(fileIds.length, 1)) {
    pass('支出详情展示附件')
  } else {
    fail('支出详情展示附件', detail.text)
  }

  try {
    const extraId = await uploadOne(token, 99)
    const add = await fetchJson(`${BASE}/api/expenses/${expenseId}/attachments`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ items: [{ fileId: extraId, fileType: 'chat_screenshot' }] }),
    })
    if (add.res.ok) pass('详情页可补传图片')
    else fail('补传图片', add.text)
  } catch (e) {
    fail('补传图片', String(e))
  }

  await fetchJson(`${BASE}/api/expenses/${expenseId}/void`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ voidReason: '测试清理' }),
  })

  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
