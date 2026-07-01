import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(path.join(__dirname, '../../package.json'))

export class XhsSignError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XhsSignError'
  }
}

function loadXhshowClient() {
  const candidates = [
    path.join(__dirname, '../../node_modules/xhshow-js/dist/index.cjs'),
    path.join(__dirname, '../../../../node_modules/xhshow-js/dist/index.cjs'),
  ]
  for (const entry of candidates) {
    try {
      return nodeRequire(entry)
    } catch { /* next */ }
  }
  throw new XhsSignError('xhshow-js 未安装')
}

export function parseCookieString(cookie: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(cookie || '').split(';')) {
    const trimmed = part.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

export function extractA1FromCookie(cookie: string): string {
  const m = parseCookieString(cookie)
  return m.a1 || m.webId || ''
}

export function extractAuthorizationFromCookie(cookie: string): string {
  const m = parseCookieString(cookie)
  for (const [key, val] of Object.entries(m)) {
    if (key.toLowerCase().includes('access-token-ark') && val) {
      const v = String(val).trim()
      if (v.startsWith('customer.ark.')) return v.slice('customer.ark.'.length)
      return v
    }
  }
  return ''
}

export function signPostHeaders(
  url: string,
  body: unknown,
  cookie: string,
  xsecAppId = 'seller',
): Record<string, string> {
  const cookies = parseCookieString(cookie)
  const a1 = extractA1FromCookie(cookie)
  if (!a1 && !Object.keys(cookies).length) {
    throw new XhsSignError('Cookie 为空或缺少 a1')
  }

  let uri: string
  try {
    uri = new URL(url).pathname
  } catch {
    uri = url
  }

  const { Client } = loadXhshowClient()
  const client = new Client()
  const appIds = [xsecAppId, 'seller', 'xhs-pc-web']
  let lastErr: Error | null = null

  for (const appId of appIds) {
    try {
      const xs = client.signXS('POST', uri, a1 || cookies.a1, appId, body)
      if (!xs) continue
      return {
        'x-s': xs,
        'x-t': String(client.getXT()),
        'x-s-common': client.signXSCommon({ a1: a1 || cookies.a1, ...cookies }),
        'x-b3-traceid': client.getB3TraceId(),
        'x-xray-traceid': client.getXrayTraceId(),
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw new XhsSignError(`小红书请求签名失败：${lastErr?.message || '未知错误'}`)
}

export function deriveCookieSyncState(cookie: string | null | undefined): {
  canSyncOrders: boolean
  statusLabel: string
  reason: string
} {
  const c = String(cookie || '').trim()
  if (!c) {
    return {
      canSyncOrders: false,
      statusLabel: '暂不可用',
      reason: '未收到 Cookie',
    }
  }
  const a1 = extractA1FromCookie(c)
  const ark = extractAuthorizationFromCookie(c)
  if (!a1) {
    return {
      canSyncOrders: false,
      statusLabel: 'Cookie 不完整',
      reason: '这个店铺 Cookie 不完整，暂时拉不了订单。',
    }
  }
  if (!ark) {
    return {
      canSyncOrders: false,
      statusLabel: 'Cookie 不完整',
      reason: '这个店铺 Cookie 不完整，暂时拉不了订单。',
    }
  }
  return {
    canSyncOrders: true,
    statusLabel: '可同步',
    reason: '可拉取订单',
  }
}

export function isAuthExpiredError(msg: string, code?: string | number): boolean {
  const c = String(code ?? '').trim()
  const m = String(msg || '')
  if (c === '401' || c === '403' || c === '902') return true
  return /401|403|902|登录已过期|未登录|cookie|鉴权|token/i.test(m)
}

export function authExpiredMessage(): string {
  return '这个店铺登录过期，需要公司电脑重新打开千帆刷新 Cookie。'
}
