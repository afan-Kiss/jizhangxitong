#!/usr/bin/env node
/** 等待远程 Worker online=true，供 PowerShell 启动脚本调用 */
import { login, fetchJson, sleep } from './lib/services.mjs'

const server = (process.env.ACCEPTANCE_SERVER || 'http://8.137.126.18/account').replace(/\/$/, '')
const maxSec = Number(process.env.WAIT_SECONDS || 45)

const token = await login(server)
for (let i = 0; i < maxSec; i++) {
  const { json } = await fetchJson(`${server}/api/worker/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (json.data?.online) {
    console.log(JSON.stringify(json.data))
    process.exit(0)
  }
  await sleep(1000)
}
process.exit(1)
