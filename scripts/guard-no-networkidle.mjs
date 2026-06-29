#!/usr/bin/env node
/**
 * 防回退：禁止 Playwright 脚本使用 waitUntil: 'networkidle'
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SCRIPTS = path.join(ROOT, 'scripts')

function walkMjs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walkMjs(full, out)
    else if (name.endsWith('.mjs')) out.push(full)
  }
  return out
}

let failed = 0
for (const full of walkMjs(SCRIPTS)) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/')
  if (rel === 'scripts/guard-no-networkidle.mjs') continue
  const text = fs.readFileSync(full, 'utf-8')
  if (!/playwright|page\.goto|waitUntil/.test(text)) continue
  if (/waitUntil:\s*['"]networkidle['"]/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    console.error(`FAIL ${rel} 使用了 waitUntil: 'networkidle'，请改用 domcontentloaded + 明确元素/接口等待`)
    failed++
  }
}
if (failed) process.exit(1)
console.log('OK — Playwright 脚本未使用 networkidle')
