#!/usr/bin/env node
/** 检查线上 index.html 引用的 assets 是否全部有效（MIME 类型正确） */
import { RECOMMENDED_URL } from './lib/deploy-env.mjs'

const ORIGIN = RECOMMENDED_URL.replace(/\/account\/?$/, '').replace(/\/$/, '')

function absUrl(rel) {
  if (rel.startsWith('http')) return rel
  if (rel.startsWith('/')) return `${ORIGIN}${rel}`
  return `${ORIGIN}/account/${rel}`
}

async function checkUrl(url) {
  const res = await fetch(url, { redirect: 'follow' })
  const ct = res.headers.get('content-type') || ''
  const buf = await res.arrayBuffer()
  const text = new TextDecoder().decode(buf.slice(0, 120))
  const isHtml = ct.includes('text/html') || text.trimStart().startsWith('<!DOCTYPE')
  return { status: res.status, ct, isHtml, cacheControl: res.headers.get('cache-control') || '' }
}

const indexRes = await fetch(`${ORIGIN}/account/`)
const html = await indexRes.text()
console.log('=== index.html ===')
console.log('status', indexRes.status)
console.log('cache-control', indexRes.headers.get('cache-control'))

const scripts = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
const styles = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => m[1])
const version = html.match(/app-version" content="([^"]+)"/)?.[1]
console.log('APP_VERSION meta:', version || '(missing)')
console.log('scripts:', scripts)
console.log('styles:', styles)

let failed = 0
for (const rel of [...scripts, ...styles]) {
  const url = absUrl(rel)
  const r = await checkUrl(url)
  const isJs = rel.endsWith('.js')
  const ok = r.status === 200 && !r.isHtml && (isJs
    ? (r.ct.includes('javascript') || r.ct.includes('ecmascript'))
    : r.ct.includes('css'))
  console.log(`${ok ? 'OK' : 'FAIL'} ${r.status} ${r.ct} ${url}`)
  if (!ok) failed++
}
process.exit(failed ? 1 : 0)
