import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export function generateSecret(length = 64) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}

export function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  let out = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}

export async function readEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    return text
  } catch {
    return null
  }
}

export async function writeEnvFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

export function getEnvValue(content, key) {
  const re = new RegExp(`^${key}=(.*)$`, 'm')
  const m = content.match(re)
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

export function setEnvValue(content, key, value) {
  const line = `${key}="${value}"`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(content)) return content.replace(re, line)
  return `${content.trim()}\n${line}\n`
}

const WEAK_JWT = new Set(['', 'change-this-in-production', 'changeme', 'secret'])
const WEAK_WORKER = new Set(['', 'dev-worker-token-change-in-production', 'changeme'])

export function isWeakJwtSecret(val) {
  if (!val || val.length < 32) return true
  return WEAK_JWT.has(val)
}

export function isWeakWorkerToken(val) {
  if (!val || val.length < 32) return true
  return WEAK_WORKER.has(val)
}
