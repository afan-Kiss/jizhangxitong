#!/usr/bin/env node
/**
 * 通过本地 Worker 将云端生产 accounting.db 备份到公司电脑
 * 前提：本地 Worker 已连接阿里云（npm run dev:worker 或一键启动）
 */
import { login, fetchJson, authHeaders, SERVER } from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

async function main() {
  installScriptTimeout('backup:prod-db', TIMEOUTS.acceptanceBasic + 120000)
  console.log(`\n>>> 生产库备份（经 Worker） server=${SERVER}\n`)

  const ready = await fetchJson(`${SERVER}/api/backup/worker-ready`, {
    headers: authHeaders(await login()),
  })
  if (!ready.res.ok) {
    console.error('无法检查 Worker 状态:', ready.json.message || ready.text)
    process.exit(1)
  }
  if (!ready.json.data?.workerOnline) {
    console.error('本地 Worker 未连接，请先打开「一键启动本地Worker.bat」并保持窗口运行。')
    process.exit(2)
  }

  const token = await login()
  const res = await fetchJson(`${SERVER}/api/backup/pull-prod-db`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })

  if (!res.res.ok) {
    console.error('备份失败:', res.json.message || res.text)
    process.exit(res.res.status === 503 ? 2 : 1)
  }

  const data = res.json.data || {}
  console.log('备份成功')
  console.log(`  本地目录: ${data.destination || data.databasePath || '(unknown)'}`)
  console.log(`  数据库文件: ${data.databasePath || ''}`)
  console.log(`  大小: ${Math.round((data.fileSizeBytes || data.manifest?.fileSizeBytes || 0) / 1024)} KB`)
  console.log(`  有效支出: ${data.expenseCount ?? data.manifest?.expenseCount ?? '?'} 条`)
  console.log(`  SHA256: ${data.manifest?.sha256 || ''}`)
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
