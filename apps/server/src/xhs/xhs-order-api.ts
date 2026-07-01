import {
  ORDER_API_URL,
  ORDER_REFERER,
  ORDER_FETCH_TIMEOUT_MS,
  DEFAULT_UA,
  type XhsShopDef,
} from './xhs-shops.constants'
import {
  authExpiredMessage,
  extractAuthorizationFromCookie,
  isAuthExpiredError,
  signPostHeaders,
  XhsSignError,
} from './xhs-signer'
import {
  buildOrderListBody,
  extractApiHasMore,
  extractPackagesFromResponse,
  normalizePackage,
  type ParsedXhsOrder,
  shouldStopPage,
} from './xhs-order-parser'

export type OrderPageResult = {
  orders: ParsedXhsOrder[]
  hasMore: boolean
  error?: string
  authExpired?: boolean
}

export async function fetchOrderPage(
  shop: XhsShopDef,
  cookie: string,
  pageNo: number,
  pageSize: number,
  startMs: number,
  endMs: number,
  keyword = '',
): Promise<OrderPageResult> {
  const body = buildOrderListBody(pageNo, pageSize, startMs, endMs, keyword)
  let headers: Record<string, string>
  try {
    const auth = extractAuthorizationFromCookie(cookie)
    if (!auth) {
      return {
        orders: [],
        hasMore: false,
        error: '这个店铺 Cookie 不完整，暂时拉不了订单。',
      }
    }
    const signed = signPostHeaders(ORDER_API_URL, body, cookie, 'seller')
    headers = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      origin: 'https://ark.xiaohongshu.com',
      referer: ORDER_REFERER,
      'bill-type': 'xhs',
      'user-agent': DEFAULT_UA,
      cookie,
      authorization: auth,
      ...signed,
    }
  } catch (err) {
    return {
      orders: [],
      hasMore: false,
      error: err instanceof XhsSignError ? err.message : '请求签名失败',
    }
  }

  try {
    const res = await fetch(ORDER_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ORDER_FETCH_TIMEOUT_MS),
    })

    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return { orders: [], hasMore: false, error: `订单 API 返回非 JSON（HTTP ${res.status}）` }
    }

    const payload = data as Record<string, unknown>
    const code = payload.code
    const msg = String(payload.msg || payload.message || '')

    if (res.status === 401 || res.status === 403 || isAuthExpiredError(msg, String(code ?? ''))) {
      return {
        orders: [],
        hasMore: false,
        error: authExpiredMessage(),
        authExpired: true,
      }
    }

    if (!res.ok) {
      return { orders: [], hasMore: false, error: `请求失败 HTTP ${res.status}` }
    }

    if (payload.success === false || (code != null && ![0, '0', 200, '200', true].includes(code as never))) {
      if (isAuthExpiredError(msg, String(code ?? ''))) {
        return { orders: [], hasMore: false, error: authExpiredMessage(), authExpired: true }
      }
      return { orders: [], hasMore: false, error: msg || String(code) || '接口返回失败' }
    }

    const packages = extractPackagesFromResponse(data)
    const orders: ParsedXhsOrder[] = []
    for (const pkg of packages) {
      const row = normalizePackage(pkg, shop.key, shop.name)
      if (row) orders.push(row)
    }

    const hasMoreFlag = extractApiHasMore(data)
    const hasMore = !shouldStopPage(packages.length, pageSize, hasMoreFlag, 0, pageNo * pageSize)

    return { orders, hasMore }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { orders: [], hasMore: false, error: msg }
  }
}
