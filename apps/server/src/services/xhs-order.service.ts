import { getQianfanCookie } from '../xhs/control-cookie.client'
import { fetchOrderPage } from '../xhs/xhs-order-api'
import {
  dedupeOrders,
  resolveSearchRangeMs,
  sortOrdersStable,
  type ParsedXhsOrder,
} from '../xhs/xhs-order-parser'
import { deriveCookieSyncState } from '../xhs/xhs-signer'
import {
  DEFAULT_PAGE_SIZE,
  XHS_SHOPS,
  getShopByKey,
  type XhsShopDef,
  type XhsShopKey,
} from '../xhs/xhs-shops.constants'

export type ShopStatusItem = {
  key: string
  name: string
  canSyncOrders: boolean
  statusLabel: string
  reason: string
}

type ShopPageState = {
  pageNo: number
  hasMore: boolean
  error?: string
  authExpired?: boolean
}

type SingleCursor = {
  v: 1
  mode: 'single'
  shopKey: string
  keyword: string
  pageNo: number
}

type AllCursor = {
  v: 1
  mode: 'all'
  keyword: string
  shops: Record<string, ShopPageState>
  buffer: ParsedXhsOrder[]
}

type CursorState = SingleCursor | AllCursor

const cookieCache = new Map<string, { cookie: string; at: number }>()
const COOKIE_CACHE_TTL = 5 * 60 * 1000

function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
}

function decodeCursor(raw?: string): CursorState | null {
  if (!raw?.trim()) return null
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorState
    if (json?.v === 1 && (json.mode === 'single' || json.mode === 'all')) return json
  } catch { /* invalid */ }
  return null
}

async function resolveShopCookie(shop: XhsShopDef): Promise<string> {
  const cached = cookieCache.get(shop.key)
  if (cached && Date.now() - cached.at < COOKIE_CACHE_TTL) return cached.cookie

  const res = await getQianfanCookie(shop.cookieShopName)
  if (!res.ok || !res.value) {
    throw new Error(res.message || 'Cookie 读取失败')
  }
  cookieCache.set(shop.key, { cookie: res.value, at: Date.now() })
  return res.value
}

export async function getXhsShopStatuses(): Promise<ShopStatusItem[]> {
  const items: ShopStatusItem[] = [
    { key: 'all', name: '全部', canSyncOrders: true, statusLabel: '可同步', reason: '汇总四店订单' },
  ]

  let anyOk = false
  for (const shop of XHS_SHOPS) {
    let cookie = ''
    try {
      cookie = await resolveShopCookie(shop)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      items.push({
        key: shop.key,
        name: shop.name,
        canSyncOrders: false,
        statusLabel: '暂不可用',
        reason: msg || 'Cookie 不可用',
      })
      continue
    }
    const st = deriveCookieSyncState(cookie)
    if (st.canSyncOrders) anyOk = true
    items.push({
      key: shop.key,
      name: shop.name,
      canSyncOrders: st.canSyncOrders,
      statusLabel: st.statusLabel,
      reason: st.reason,
    })
  }

  items[0].canSyncOrders = anyOk
  if (!anyOk) {
    items[0].statusLabel = '暂不可用'
    items[0].reason = '四店 Cookie 都不可用，可手动输入订单号'
  }

  return items
}

function toApiItem(o: ParsedXhsOrder) {
  return {
    externalOrderNo: o.externalOrderNo,
    shopKey: o.shopKey,
    shopName: o.shopName,
    buyerName: o.buyerName,
    phoneMasked: o.phoneMasked,
    amount: o.amount,
    payTime: o.payTime,
    orderStatus: o.orderStatus,
    afterSaleStatus: o.afterSaleStatus,
    logisticsNo: o.logisticsNo,
    goodsTitle: o.goodsTitle,
    raw: o.raw,
  }
}

async function fetchShopPage(
  shop: XhsShopDef,
  pageNo: number,
  pageSize: number,
  keyword: string,
): Promise<{ orders: ParsedXhsOrder[]; hasMore: boolean; error?: string; authExpired?: boolean }> {
  try {
    const cookie = await resolveShopCookie(shop)
    const st = deriveCookieSyncState(cookie)
    if (!st.canSyncOrders) {
      return { orders: [], hasMore: false, error: st.reason }
    }
    const { startMs, endMs } = resolveSearchRangeMs(30)
    return fetchOrderPage(shop, cookie, pageNo, pageSize, startMs, endMs, keyword)
  } catch (err) {
    return {
      orders: [],
      hasMore: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function searchSingleShop(params: {
  shopKey: string
  keyword: string
  pageSize: number
  cursor: SingleCursor | null
}) {
  const shop = getShopByKey(params.shopKey)
  if (!shop) throw new Error(`未知店铺: ${params.shopKey}`)

  const pageNo = params.cursor?.pageNo ?? 1
  const result = await fetchShopPage(shop, pageNo, params.pageSize, params.keyword)

  const nextCursor = result.hasMore && result.orders.length
    ? encodeCursor({
        v: 1,
        mode: 'single',
        shopKey: params.shopKey,
        keyword: params.keyword,
        pageNo: pageNo + 1,
      })
    : null

  return {
    items: result.orders.map(toApiItem),
    nextCursor,
    hasMore: !!nextCursor,
    pageSize: params.pageSize,
    shopKey: params.shopKey,
    warnings: result.error ? [result.error] : [],
  }
}

async function searchAllShops(params: {
  keyword: string
  pageSize: number
  cursor: AllCursor | null
}) {
  const pageSize = params.pageSize
  const warnings: string[] = []

  const shopStates: Record<string, ShopPageState> = {}
  for (const shop of XHS_SHOPS) {
    const prev = params.cursor?.shops?.[shop.key]
    shopStates[shop.key] = prev
      ? { ...prev }
      : { pageNo: 1, hasMore: true }
  }

  let buffer: ParsedXhsOrder[] = params.cursor?.buffer ? [...params.cursor.buffer] : []
  buffer = dedupeOrders(buffer)

  const activeShops = XHS_SHOPS.filter((s: XhsShopDef) => shopStates[s.key]?.hasMore !== false)
  let rounds = 0
  const maxRounds = activeShops.length * 3 + 5

  while (buffer.length < pageSize && rounds < maxRounds) {
    let progressed = false
    for (const shop of XHS_SHOPS) {
      const st = shopStates[shop.key]
      if (!st.hasMore) continue

      const result = await fetchShopPage(shop, st.pageNo, pageSize, params.keyword)
      st.pageNo += 1

      if (result.error) {
        st.error = result.error
        if (result.authExpired) st.authExpired = true
        if (!result.orders.length) {
          st.hasMore = false
          warnings.push(`${shop.name}：${result.error}`)
        }
      }

      if (result.orders.length) {
        buffer.push(...result.orders)
        buffer = dedupeOrders(sortOrdersStable(buffer))
        progressed = true
      }

      if (!result.hasMore) st.hasMore = false
    }
    if (!progressed) break
    rounds += 1
  }

  buffer = sortOrdersStable(dedupeOrders(buffer))
  const items = buffer.slice(0, pageSize).map(toApiItem)
  const remaining = buffer.slice(pageSize)

  const anyHasMore = XHS_SHOPS.some((s: XhsShopDef) => shopStates[s.key]?.hasMore)
  const hasMore = remaining.length > 0 || anyHasMore

  const nextCursor = hasMore
    ? encodeCursor({
        v: 1,
        mode: 'all',
        keyword: params.keyword,
        shops: shopStates,
        buffer: remaining,
      })
    : null

  return {
    items,
    nextCursor,
    hasMore: !!nextCursor,
    pageSize,
    shopKey: 'all',
    warnings: [...new Set(warnings)],
  }
}

export async function searchXhsOrders(params: {
  shopKey?: string
  keyword?: string
  cursor?: string
  pageSize?: number
}) {
  const shopKey = (params.shopKey || 'all') as XhsShopKey
  const keyword = String(params.keyword || '').trim()
  const pageSize = Math.min(20, Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE))
  const decoded = decodeCursor(params.cursor)

  if (shopKey === 'all') {
    const cur = decoded?.mode === 'all' && decoded.keyword === keyword ? decoded : null
    return searchAllShops({ keyword, pageSize, cursor: cur })
  }

  const shop = getShopByKey(shopKey)
  if (!shop) throw new Error(`未知店铺: ${shopKey}`)

  const cur =
    decoded?.mode === 'single' && decoded.shopKey === shopKey && decoded.keyword === keyword
      ? decoded
      : null

  return searchSingleShop({ shopKey, keyword, pageSize, cursor: cur })
}
