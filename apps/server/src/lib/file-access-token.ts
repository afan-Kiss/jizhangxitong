import crypto from 'crypto'
import { config } from './config'

const TTL_MS = 5 * 60 * 1000

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(payload).digest('base64url')
}

export function createFileAccessToken(userId: number, fileId: number): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + TTL_MS
  const payload = `${userId}:${fileId}:${expiresAt}`
  const token = `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
  return { token, expiresAt: new Date(expiresAt).toISOString() }
}

export function verifyFileAccessToken(token: string): { userId: number; fileId: number } {
  const [body, sig] = token.split('.')
  if (!body || !sig) throw new Error('无效的文件访问令牌')
  const payload = Buffer.from(body, 'base64url').toString('utf8')
  if (sign(payload) !== sig) throw new Error('无效的文件访问令牌')
  const [userIdStr, fileIdStr, expiresAtStr] = payload.split(':')
  const expiresAt = Number(expiresAtStr)
  if (!expiresAt || expiresAt < Date.now()) throw new Error('文件访问令牌已过期')
  return { userId: Number(userIdStr), fileId: Number(fileIdStr) }
}

export function createBraceletImageAccessToken(userId: number, braceletId: number): { token: string; expiresAt: string } {
  const expiresAt = Date.now() + TTL_MS
  const payload = `b:${userId}:${braceletId}:${expiresAt}`
  const token = `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
  return { token, expiresAt: new Date(expiresAt).toISOString() }
}

export function verifyBraceletImageAccessToken(token: string): { userId: number; braceletId: number } {
  const [body, sig] = token.split('.')
  if (!body || !sig) throw new Error('无效的文件访问令牌')
  const payload = Buffer.from(body, 'base64url').toString('utf8')
  if (sign(payload) !== sig) throw new Error('无效的文件访问令牌')
  const [, userIdStr, braceletIdStr, expiresAtStr] = payload.split(':')
  const expiresAt = Number(expiresAtStr)
  if (!expiresAt || expiresAt < Date.now()) throw new Error('文件访问令牌已过期')
  return { userId: Number(userIdStr), braceletId: Number(braceletIdStr) }
}
