/**
 * 千帆订单详情换票 — 对齐主播分析系统 good-reviews / board 换票逻辑
 * 使用总控台四店 Cookie，不依赖扫码枪或本地直播号配置
 */
import { buildQianfanOrderUrl } from '@jade-account/shared'
import { getQianfanCookie } from '../xhs/control-cookie.client'
import {
  extractAuthorizationFromCookie,
  parseCookieString,
  signPostHeaders,
} from '../xhs/xhs-signer'
import { XHS_SHOPS, resolveShopInput, type XhsShopDef } from '../xhs/xhs-shops.constants'
import { getQianfanOrderUrlTemplate } from './settings.service'

const SERVICE_TICKET_URL = 'https://customer.xiaohongshu.com/api/cas/customer/web/service-ticket'
const ARK_ROOT = 'https://ark.xiaohongshu.com'
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const FETCH_TIMEOUT_MS = 12_000

type TicketEntry = {
  redirectUrl: string
  createdAt: number
  used: boolean
}

const ticketStore = new Map<string, TicketEntry>()
const TICKET_TTL_MS = 60_000

export class QianfanOrderOpenTicketError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QianfanOrderOpenTicketError'
  }
}

export interface QianfanOrderDetailResolveResult {
  ok: boolean
  orderId: string
  packageId: string
  shop: string
  shopName: string
  serviceUrl: string
  finalOpenUrl: string
  hasTicket: boolean
  fallbackToBaseUrl: boolean
  error?: string
}

interface CookieCandidate {
  cookie: string
  accountName: string
  shopKey: string
  cookieSource: string
}

interface TicketBodySpec {
  body: Record<string, unknown>
  tag: string
}

interface HeaderVariant {
  tag: string
  origin?: string
  referer?: string
  authorization?: string
}

function parseCookieMap(cookie: string): Record<string, string> {
  return parseCookieString(cookie)
}

function extractFuwuAuthorization(cookie: string): string {
  const m = parseCookieMap(cookie)
  for (const [key, val] of Object.entries(m)) {
    if (!key.includes('access-token-fuwu') || key.includes('beta')) continue
    const v = String(val || '').trim()
    if (v.startsWith('customer.fuwu.')) return v.slice('customer.fuwu.'.length)
    if (v) return v
  }
  return ''
}

export function normalizePackageId(packageId: string): string {
  const raw = String(packageId || '').trim()
  if (!raw) return ''
  return raw.startsWith('P') ? raw : `P${raw}`
}

export function buildDetailServiceUrl(packageId: string): string {
  const pkg = normalizePackageId(packageId)
  if (!pkg) return ''
  return `${ARK_ROOT}/app-order/order/detail/${encodeURIComponent(pkg)}`
}

async function buildServiceUrl(orderId: string): Promise<string> {
  const tpl = await getQianfanOrderUrlTemplate()
  if (tpl) {
    const fromTpl = buildQianfanOrderUrl(tpl, orderId)
    if (fromTpl) return fromTpl
  }
  return buildDetailServiceUrl(orderId)
}

function extractTicketFromResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const obj = data as Record<string, unknown>
  const nested =
    obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : undefined
  const direct = nested?.ticket ?? obj.ticket ?? nested?.st ?? ''
  const s = String(direct ?? '').trim()
  if (s.startsWith('ST-')) return s
  return ''
}

function buildTicketRequestBodies(serviceUrl: string, cookie: string): TicketBodySpec[] {
  const m = parseCookieMap(cookie)
  const sid = String(m['customer-sso-sid'] || '').trim()
  const auth = extractAuthorizationFromCookie(cookie)
  const sellerId = String(m['x-user-id-ark.xiaohongshu.com'] || '').trim()
  const webSession = String(m.web_session || '').trim()
  const enc = encodeURIComponent(serviceUrl)
  const bodies: TicketBodySpec[] = []
  const push = (body: Record<string, unknown>, tag: string) => bodies.push({ body, tag })

  push({ service: ARK_ROOT, type: 'at' }, 'at+root')
  push({ service: encodeURIComponent(ARK_ROOT), type: 'at' }, 'at+root-enc')
  if (sid) push({ service: ARK_ROOT, type: 'at', sid, source: '' }, 'at+root+sid')

  if (sid) {
    for (const type of ['st', 'sso'] as const) {
      push({ service: enc, type, sid, source: '' }, `${type}+sid`)
      push({ service: enc, type, customerSid: sid, source: '' }, `${type}+customerSid`)
      push({ service: serviceUrl, type, sid, source: '' }, `${type}+sid+rawService`)
    }
  }

  if (sid && auth) {
    push({ service: enc, type: 'st', sid, accessToken: auth, source: '' }, 'st+sid+at')
    push({ service: enc, type: 'sso', sid, accessToken: auth, source: '' }, 'sso+sid+at')
  }

  if (sid && sellerId) {
    push({ service: enc, type: 'sso', sid, sellerId, source: '' }, 'sso+sid+seller')
    push({ service: enc, type: 'st', sid, sellerId, source: '' }, 'st+sid+seller')
  }

  if (webSession) {
    push({ service: enc, type: 'sso', webSession, source: '' }, 'sso+webSession')
    push({ service: enc, type: 'st', webSession, source: '' }, 'st+webSession')
  }

  if (sellerId) {
    for (const type of ['sso', 'st'] as const) {
      bodies.unshift({ body: { service: enc, type, sellerId, source: '' }, tag: `${type}+sellerOnly` })
      if (sid) {
        bodies.unshift({
          body: { service: enc, type, sid, sellerId, source: '' },
          tag: `${type}+sid+seller-priority`,
        })
      }
    }
  }

  return bodies
}

function buildHeaderVariants(cookie: string): HeaderVariant[] {
  const fuwuAuth = extractFuwuAuthorization(cookie)
  const arkAuth = extractAuthorizationFromCookie(cookie)
  const variants: HeaderVariant[] = [{ tag: 'customer' }]
  variants.push({
    tag: 'ark',
    origin: 'https://ark.xiaohongshu.com',
    referer: 'https://ark.xiaohongshu.com/app-order/aftersale/list',
    authorization: arkAuth,
  })
  if (fuwuAuth || arkAuth) {
    variants.push({
      tag: 'walle',
      origin: 'https://walle.xiaohongshu.com',
      referer: 'https://walle.xiaohongshu.com/cstools/seller/dashboard',
      authorization: fuwuAuth || arkAuth,
    })
  }
  return variants
}

async function postServiceTicket(
  cookie: string,
  body: Record<string, unknown>,
  opts: HeaderVariant,
): Promise<{ ticket: string; httpStatus: number; platformMsg?: string }> {
  const signed = signPostHeaders(SERVICE_TICKET_URL, body, cookie, 'seller')
  const origin = opts.origin || 'https://customer.xiaohongshu.com'
  const referer = opts.referer || 'https://customer.xiaohongshu.com/'
  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    origin,
    referer,
    'user-agent': DEFAULT_UA,
    cookie,
    ...signed,
  }
  if (opts.authorization) headers.authorization = opts.authorization

  const res = await fetch(SERVICE_TICKET_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    return { ticket: '', httpStatus: res.status }
  }

  const root = data as Record<string, unknown>
  const platformMsg = String(root.msg ?? root.message ?? '').trim() || undefined
  if (!res.ok) return { ticket: '', httpStatus: res.status, platformMsg }

  const ticket = extractTicketFromResponse(data)
  if (ticket) return { ticket, httpStatus: res.status, platformMsg }

  if (platformMsg && /登录|过期|鉴权|token/i.test(platformMsg)) {
    throw new Error('店铺 Cookie 可能已过期，请联系管理员刷新')
  }

  return { ticket: '', httpStatus: res.status, platformMsg }
}

async function fetchTicketWithCookie(cookie: string, serviceUrl: string): Promise<string> {
  const bodySpecs = buildTicketRequestBodies(serviceUrl, cookie)
  const headerVariants = buildHeaderVariants(cookie)

  for (const hv of headerVariants) {
    if (hv.tag === 'walle' && !hv.authorization) continue
    for (const { body } of bodySpecs) {
      try {
        const result = await postServiceTicket(cookie, body, hv)
        if (result.ticket) return result.ticket
      } catch {
        // try next variant
      }
    }
  }
  return ''
}

function buildArkUrlWithTicketDirect(serviceUrl: string, ticket: string): string {
  const base = String(serviceUrl || '').trim()
  const st = String(ticket || '').trim()
  if (!base || !st.startsWith('ST-')) return base
  const u = new URL(base)
  u.searchParams.set('ticket', st)
  return u.toString()
}

async function resolveCookieCandidates(shopInput?: string): Promise<CookieCandidate[]> {
  const out: CookieCandidate[] = []
  const seen = new Set<string>()

  const pushShop = async (shop: XhsShopDef, source: string) => {
    const res = await getQianfanCookie(shop.cookieShopName)
    if (!res.ok || !res.value.trim() || seen.has(res.value)) return
    seen.add(res.value)
    out.push({
      cookie: res.value,
      accountName: shop.name,
      shopKey: shop.key,
      cookieSource: source,
    })
  }

  const preferred = resolveShopInput(shopInput)
  if (preferred) await pushShop(preferred, 'shop')

  for (const shop of XHS_SHOPS) {
    if (preferred && shop.key === preferred.key) continue
    await pushShop(shop, 'fallback')
  }

  return out
}

export async function resolveQianfanOrderDetail(params: {
  orderId: string
  shop?: string
}): Promise<QianfanOrderDetailResolveResult> {
  const orderId = String(params.orderId || '').trim()
  const shopInput = String(params.shop || '').trim()
  const shopDef = resolveShopInput(shopInput)
  const packageId = normalizePackageId(orderId)

  const emptyResult = (error: string): QianfanOrderDetailResolveResult => ({
    ok: false,
    orderId,
    packageId,
    shop: shopDef?.key || shopInput,
    shopName: shopDef?.name || shopInput || '未知店铺',
    serviceUrl: '',
    finalOpenUrl: '',
    hasTicket: false,
    fallbackToBaseUrl: false,
    error,
  })

  if (!orderId) return emptyResult('请提供订单号')
  if (!packageId) return emptyResult('请提供有效订单号')

  const serviceUrl = await buildServiceUrl(packageId)
  if (!serviceUrl) return emptyResult('无法构建订单详情地址')

  const shopName = shopDef?.name || shopInput || '四店轮询'
  const candidates = await resolveCookieCandidates(shopInput || undefined)

  if (!candidates.length) {
    return {
      ok: false,
      orderId,
      packageId,
      shop: shopDef?.key || shopInput,
      shopName,
      serviceUrl,
      finalOpenUrl: serviceUrl,
      hasTicket: false,
      fallbackToBaseUrl: true,
      error: '千帆 Cookie 不可用，请确认总控台 Cookie 服务正常',
    }
  }

  for (const candidate of candidates) {
    const ticket = await fetchTicketWithCookie(candidate.cookie, serviceUrl)
    if (ticket) {
      return {
        ok: true,
        orderId,
        packageId,
        shop: candidate.shopKey,
        shopName: candidate.accountName,
        serviceUrl,
        finalOpenUrl: buildArkUrlWithTicketDirect(serviceUrl, ticket),
        hasTicket: true,
        fallbackToBaseUrl: false,
      }
    }
  }

  return {
    ok: true,
    orderId,
    packageId,
    shop: shopDef?.key || shopInput,
    shopName,
    serviceUrl,
    finalOpenUrl: serviceUrl,
    hasTicket: false,
    fallbackToBaseUrl: true,
    error: '未能换到登录票据，已回退到基础链接',
  }
}

export async function createQianfanOrderOpenTicket(
  orderNo: string,
  options?: { shop?: string },
): Promise<{
  openUrl: string
  hasTicket: boolean
  fallbackToBaseUrl: boolean
}> {
  const resolved = await resolveQianfanOrderDetail({
    orderId: orderNo,
    shop: options?.shop,
  })

  if (!resolved.serviceUrl) {
    throw new QianfanOrderOpenTicketError(resolved.error || '请提供订单号')
  }
  if (!resolved.finalOpenUrl) {
    throw new QianfanOrderOpenTicketError(resolved.error || '暂时无法打开订单详情')
  }

  const ticket = `qf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  ticketStore.set(ticket, {
    redirectUrl: resolved.finalOpenUrl,
    createdAt: Date.now(),
    used: false,
  })

  return {
    openUrl: `/api/qianfan/order-detail/open?ticket=${encodeURIComponent(ticket)}`,
    hasTicket: resolved.hasTicket,
    fallbackToBaseUrl: resolved.fallbackToBaseUrl,
  }
}

export function consumeQianfanOrderOpenTicket(ticket: string): {
  ok: boolean
  redirectUrl?: string
  html: string
} {
  const key = String(ticket || '').trim()
  if (!key) {
    return {
      ok: false,
      html: htmlArkOrderFallbackPage({ serviceUrl: '', shopName: '未知店铺', message: '链接无效' }),
    }
  }

  const entry = ticketStore.get(key)
  if (!entry) {
    return {
      ok: false,
      html: htmlArkOrderFallbackPage({ serviceUrl: '', shopName: '未知店铺', message: '链接已失效，请回到记账页重新打开' }),
    }
  }

  if (Date.now() - entry.createdAt > TICKET_TTL_MS) {
    ticketStore.delete(key)
    return {
      ok: false,
      html: htmlArkOrderFallbackPage({ serviceUrl: '', shopName: '未知店铺', message: '链接已过期，请重新打开' }),
    }
  }

  if (entry.used) {
    return {
      ok: false,
      html: htmlArkOrderFallbackPage({ serviceUrl: entry.redirectUrl, shopName: '未知店铺', message: '链接已使用，请重新打开' }),
    }
  }

  entry.used = true
  ticketStore.delete(key)
  return { ok: true, redirectUrl: entry.redirectUrl, html: '' }
}

export function htmlArkOrderFallbackPage(params: {
  serviceUrl: string
  shopName: string
  message?: string
}): string {
  const msg = params.message?.trim() || '请提供有效参数'
  const safeMsg = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeUrl = params.serviceUrl.replace(/"/g, '&quot;')
  const safeShop = params.shopName.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const redirectScript = params.serviceUrl
    ? `<script>setTimeout(function(){ location.replace(${JSON.stringify(params.serviceUrl)}); }, 800);</script>`
    : ''
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>打开千帆订单详情</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#334155;line-height:1.6}
.box{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:16px;margin:16px 0}
a{color:#e11d48;word-break:break-all}</style></head><body>
<h1>正在打开千帆订单详情</h1>
<p>店铺：${safeShop}</p>
<div class="box"><p>${safeMsg}</p></div>
<p><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a></p>
${redirectScript}
</body></html>`
}
