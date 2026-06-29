#!/usr/bin/env node
/** 验证 /account/ 子路径刷新与 API（HTTP + HTTPS） */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const BASES = [
  process.env.ACCEPTANCE_SERVER,
  'https://xiangyuzhubao.xyz/account/',
  'https://8.137.126.18/account/',
].filter(Boolean)

console.log('\n/account/ HTTPS 子路径检查\n')
let failed = 0
for (const base of BASES) {
  console.log(`--- ${base} ---`)
  const paths = ['', 'login', 'expenses', 'bracelets', 'settings']
  for (const p of paths) {
    const url = `${base.replace(/\/$/, '')}/${p}`.replace(/([^:]\/)\/+/g, '$1')
    const r = await fetch(url)
    const t = await r.text()
    const ok = r.status === 200 && (t.includes('和田玉') || t.includes('id="app"')) && !t.includes('Welcome to nginx')
    console.log(`${url} -> ${r.status} ${ok ? 'OK' : 'FAIL'}`)
    if (!ok) failed++
  }
  const health = await fetch(`${base.replace(/\/$/, '')}/api/health`)
  const hj = await health.json().catch(() => ({}))
  console.log(`health: ${health.status} ${hj.message || ''}`)
}
process.exit(failed ? 1 : 0)
