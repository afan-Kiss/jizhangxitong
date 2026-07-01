/** 订单包裹解析 — 精简自扫码枪 xiangyu/xhsPackageParse.js */

const P_ORDER_PATTERN = /^P\d{10,}$/i
const TZ_OFFSET_MS = 8 * 3600000

function str(val: unknown): string {
  if (val == null) return ''
  return String(val).trim()
}

function parseTs(val: unknown): number {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000
  const s = String(val).trim()
  const n = Number(s)
  if (!Number.isNaN(n) && n > 0) return n > 1e12 ? n : n * 1000
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 8, Number(mi), Number(se))
  }
  return 0
}

function orderNoAsStr(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return ''
    if (Number.isInteger(val)) return String(val)
    return Math.abs(val) > 1e15 ? val.toFixed(0) : String(val)
  }
  return String(val).trim()
}

const ORDER_NO_FIELD_PRIORITY = [
  'orderSn', 'order_sn', 'orderNo', 'order_no', 'orderIdStr', 'order_id_str',
  'fulfillmentOrderNo', 'packageOrderNo', 'packageId', 'package_id', 'orderId', 'order_id', 'id',
]

function resolveOrderNo(pkg: Record<string, unknown>): string {
  let chosen = ''
  for (const key of ORDER_NO_FIELD_PRIORITY) {
    const v = orderNoAsStr(pkg[key])
    if (!v) continue
    if (!chosen) chosen = v
    if (P_ORDER_PATTERN.test(v)) {
      chosen = v
      break
    }
  }
  return chosen
}

function toAmount(val: unknown, fieldName = ''): number {
  if (val == null || val === '') return 0
  const n = Number(String(val).replace(/,/g, ''))
  if (Number.isNaN(n)) return 0
  const fn = fieldName.toLowerCase().replace(/_/g, '')
  if (fn.includes('cent') || fn.includes('fen')) return n / 100
  return n
}

function firstProductTitle(pkg: Record<string, unknown>): string {
  const skus = Array.isArray(pkg.skus) ? pkg.skus : []
  for (const sku of skus) {
    if (!sku || typeof sku !== 'object') continue
    const s = sku as Record<string, unknown>
    const name = str(s.displayName || s.skuName)
    if (name) return name
  }
  return '商品'
}

function extractNickName(pkg: Record<string, unknown>): string {
  const ui = (pkg.userInfo || pkg.user_info || {}) as Record<string, unknown>
  const fields = [pkg.nickName, pkg.nickname, ui.nickName, ui.nickname, ui.nick_name]
  for (const f of fields) {
    const v = str(f)
    if (v) return v
  }
  return ''
}

function extractPhone(pkg: Record<string, unknown>): string {
  const fields = [
    pkg.receiverPhone, pkg.receiver_phone, pkg.phone,
    (pkg.receiverInfo as Record<string, unknown>)?.phone,
    (pkg.userInfo as Record<string, unknown>)?.phone,
  ]
  for (const f of fields) {
    const v = str(f)
    if (v) return v
  }
  return ''
}

function extractLogisticsNo(pkg: Record<string, unknown>): string {
  const expressInfo = (pkg.expressInfo || pkg.express_info) as Record<string, unknown> | undefined
  const logisticsInfo = (pkg.logisticsInfo || pkg.logistics_info) as Record<string, unknown> | undefined
  const logistics = pkg.logistics as Record<string, unknown> | undefined
  const deliveryInfo = (pkg.deliveryInfo || pkg.delivery_info) as Record<string, unknown> | undefined
  const shippingInfo = (pkg.shippingInfo || pkg.shipping_info) as Record<string, unknown> | undefined

  const shipDirect = [
    pkg.expressNo, pkg.express_no, pkg.shipExpressNo, pkg.ship_express_no,
    pkg.logisticsNo, pkg.logistics_no, pkg.trackingNo, pkg.tracking_no,
    pkg.waybillNo, pkg.waybill_no, pkg.deliveryExpressNo, pkg.delivery_express_no,
    expressInfo?.expressNo, expressInfo?.express_no,
    logisticsInfo?.expressNo, logisticsInfo?.express_no,
    logistics?.expressNo, logistics?.express_no,
    deliveryInfo?.expressNo, deliveryInfo?.express_no,
    shippingInfo?.expressNo, shippingInfo?.express_no,
  ]
  for (const f of shipDirect) {
    const v = normalizeExpressNo(str(f))
    if (v) return v
  }

  const retDirect = [
    pkg.returnExpressNo, pkg.return_express_no, pkg.returnLogisticsNo, pkg.returnWaybillNo,
  ]
  const returnNo = normalizeExpressNo(str(retDirect.find((x) => str(x)) || ''))

  const collected: string[] = []
  walkExpressCollect(pkg, collected)
  for (const c of collected) {
    const v = normalizeExpressNo(c)
    if (!v) continue
    if (returnNo && v === returnNo) continue
    return v
  }
  return ''
}

const EXPRESS_KEY_RE =
  /^(ship|delivery|return|express|logistics|waybill|tracking|carrier)?_?(express|logistics|waybill|tracking)?_?(no|number|code|id)?$/i

function normalizeExpressNo(value: string): string {
  return str(value).toUpperCase().replace(/\s+/g, '')
}

function walkExpressCollect(obj: unknown, out: string[], depth = 0): void {
  if (depth > 8 || obj == null) return
  if (typeof obj === 'string') {
    const v = str(obj)
    if (v) out.push(v)
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 60)) walkExpressCollect(item, out, depth + 1)
    return
  }
  if (typeof obj !== 'object') return
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (EXPRESS_KEY_RE.test(key)) {
      if (typeof val === 'string') {
        const v = str(val)
        if (v) out.push(v)
      } else if (val && typeof val === 'object') {
        walkExpressCollect(val, out, depth + 1)
      }
    } else if (val && typeof val === 'object') {
      walkExpressCollect(val, out, depth + 1)
    }
  }
}

export function extractPackagesFromResponse(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') return []
  const data = (body as Record<string, unknown>).data
  if (!data || typeof data !== 'object') return []
  const packages = (data as Record<string, unknown>).packages
  if (Array.isArray(packages)) {
    return packages.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  return []
}

export function extractApiHasMore(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined
  const data = ((body as Record<string, unknown>).data || body) as Record<string, unknown>
  if (typeof data.hasMore === 'boolean') return data.hasMore
  if (typeof data.has_more === 'boolean') return data.has_more
  return undefined
}

export function extractApiTotal(body: unknown): number {
  if (!body || typeof body !== 'object') return 0
  const data = ((body as Record<string, unknown>).data || body) as Record<string, unknown>
  const total = data.total ?? data.totalCount
  return typeof total === 'number' ? total : Number(total) || 0
}

export type ParsedXhsOrder = {
  externalOrderNo: string
  shopKey: string
  shopName: string
  buyerName: string
  phoneMasked: string
  amount: number
  payTime: string
  orderStatus: string
  afterSaleStatus: string
  logisticsNo: string
  goodsTitle: string
  sortTs: number
  raw: Record<string, unknown>
}

export function maskPhone(phone: string): string {
  const p = phone.replace(/\D/g, '')
  if (p.length >= 7) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 4) return `${p.slice(0, 1)}***${p.slice(-2)}`
  return phone ? '***' : ''
}

export function normalizePackage(
  pkg: Record<string, unknown>,
  shopKey: string,
  shopName: string,
): ParsedXhsOrder | null {
  const statusDesc = str(pkg.statusDesc || pkg.status)
  if (statusDesc.includes('取消')) return null

  const orderNo = resolveOrderNo(pkg)
  if (!orderNo) return null

  const payTs = parseTs(pkg.paidAt || pkg.orderedAt || pkg.createdAt)
  const payDate = payTs ? new Date(payTs + TZ_OFFSET_MS) : null
  const payTime = payDate
    ? payDate.toISOString().slice(0, 19).replace('T', ' ')
    : ''

  const amount = toAmount(pkg.actualPaid ?? pkg.totalOrderAmount, 'actualPaid')
  const phone = extractPhone(pkg)

  return {
    externalOrderNo: orderNo,
    shopKey,
    shopName,
    buyerName: extractNickName(pkg) || str(pkg.userInfo && (pkg.userInfo as Record<string, unknown>).name) || '买家',
    phoneMasked: maskPhone(phone),
    amount,
    payTime,
    orderStatus: statusDesc || str(pkg.status) || '待处理',
    afterSaleStatus: str(pkg.afterSaleStatusDesc || pkg.afterSaleStatus),
    logisticsNo: extractLogisticsNo(pkg),
    goodsTitle: firstProductTitle(pkg),
    sortTs: payTs || 0,
    raw: pkg,
  }
}

export function sortOrdersStable(orders: ParsedXhsOrder[]): ParsedXhsOrder[] {
  return [...orders].sort((a, b) => {
    if (b.sortTs !== a.sortTs) return b.sortTs - a.sortTs
    return b.externalOrderNo.localeCompare(a.externalOrderNo)
  })
}

export function dedupeOrders(orders: ParsedXhsOrder[]): ParsedXhsOrder[] {
  const seen = new Set<string>()
  const out: ParsedXhsOrder[] = []
  for (const o of orders) {
    const key = `${o.shopKey}::${o.externalOrderNo}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}

export function startOfShanghaiDay(offsetDays = 0): number {
  const now = Date.now()
  const sh = new Date(now + TZ_OFFSET_MS)
  const y = sh.getUTCFullYear()
  const m = sh.getUTCMonth()
  const d = sh.getUTCDate()
  return Date.UTC(y, m, d - offsetDays, -8, 0, 0, 0)
}

export function endOfShanghaiDay(offsetDays = 0): number {
  const now = Date.now()
  const sh = new Date(now + TZ_OFFSET_MS)
  const y = sh.getUTCFullYear()
  const m = sh.getUTCMonth()
  const d = sh.getUTCDate()
  return Date.UTC(y, m, d - offsetDays, 15, 59, 59, 999)
}

export function resolveSearchRangeMs(days = 30): { startMs: number; endMs: number } {
  const span = Math.min(Math.max(days, 1), 90)
  return { startMs: startOfShanghaiDay(span - 1), endMs: endOfShanghaiDay(0) }
}

export function buildOrderListBody(
  pageNo: number,
  pageSize: number,
  startMs: number,
  endMs: number,
  keyword = '',
): Record<string, unknown> {
  return {
    page_no: pageNo,
    page_size: pageSize,
    multi_search_field: String(keyword || '').trim(),
    order_tag_list: [],
    order_type_list: [],
    promise_ship_time_type_list: [],
    after_sale_status_list: [],
    seller_mark_priority_list: [],
    seller_mark_note_status_list: [],
    status: [],
    time_range_list: [{ time_type: 3, start_time: startMs, end_time: endMs }],
    overdue_status: -2,
    sort_by: { sort_field: 'ordered_at', desc: true },
    need_declare_info: false,
    need_declare_times: false,
    allow_es_fallback: true,
  }
}

export function shouldStopPage(
  rowsThisPage: number,
  pageSize: number,
  hasMore?: boolean,
  total = 0,
  accumulated = 0,
): boolean {
  if (!rowsThisPage) return true
  if (hasMore === false) return true
  if (total > 0 && accumulated >= total) return true
  if (rowsThisPage < pageSize && hasMore !== true) return true
  return false
}
