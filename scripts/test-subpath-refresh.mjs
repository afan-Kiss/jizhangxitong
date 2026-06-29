#!/usr/bin/env node
/** 验证 /account/ 子路径（仅推荐 HTTP IP 入口） */
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'

const BASE = RECOMMENDED_URL

console.log('\n/account/ 子路径检查\n')
console.log(`推荐入口: ${BASE}\n`)
let failed = 0
const paths = ['', 'login', 'expenses', 'bracelets', 'settings']
for (const p of paths) {
  const url = `${BASE.replace(/\/$/, '')}/${p}`.replace(/([^:]\/)\/+/g, '$1')
  const r = await fetch(url)
  const t = await r.text()
  const ok = r.status === 200 && (t.includes('和田玉') || t.includes('id="app"')) && !t.includes('Welcome to nginx')
  console.log(`${url} -> ${r.status} ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) failed++
}
const health = await fetch(`${BASE.replace(/\/$/, '')}/api/health`)
const hj = await health.json().catch(() => ({}))
console.log(`health: ${health.status} ${hj.message || ''}`)
console.log('\n域名 https://xiangyuzhubao.xyz/account/ 待备案/正式证书完成后启用\n')
process.exit(failed ? 1 : 0)
