import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.join(__dirname, '..', '..')

/** 当前推荐的生产访问地址（HTTP IP，非自签名 HTTPS） */
export const RECOMMENDED_URL = 'http://8.137.126.18/account/'
export const RECOMMENDED_WS = 'ws://8.137.126.18/account/ws/worker'

export function loadDeployEnv() {
  const envPath = path.join(ROOT, 'secrets/deploy.env')
  try {
    const text = fs.readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('SSH_PASS=') && !process.env.SSH_PASS) {
        process.env.SSH_PASS = trimmed.split('=', 1)[1]?.trim() || trimmed.slice('SSH_PASS='.length).trim()
        process.env.SSH_PASS = process.env.SSH_PASS.replace(/^["']|["']$/g, '')
      }
      const m = trimmed.match(/^([A-Z0-9_]+)=(.+)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* optional */ }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { res, json, text }
}

/** 报告写入前脱敏 */
export function sanitizeReportLine(line) {
  return String(line)
    .replace(/密码[:：]\s*\S+/g, '密码: [已隐藏]')
    .replace(/password[:=]\s*\S+/gi, 'password=[已隐藏]')
    .replace(/fanfan9724/g, '[已隐藏]')
    .replace(/admin123/g, '[默认密码-已失效]')
}
