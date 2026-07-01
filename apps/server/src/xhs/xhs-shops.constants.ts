/** 四店配置 — 与千帆中转机器人 / 总控台一致 */
export type XhsShopKey = 'hetianyayu' | 'shiyuju' | 'xyxiangyu' | 'xiangyuzhubao' | 'all'

export type XhsShopDef = {
  key: Exclude<XhsShopKey, 'all'>
  name: string
  cookieShopName: string
}

export const XHS_SHOPS: XhsShopDef[] = [
  { key: 'hetianyayu', name: '和田雅玉', cookieShopName: '和田雅玉' },
  { key: 'shiyuju', name: '拾玉居', cookieShopName: '拾玉居和田玉' },
  { key: 'xyxiangyu', name: 'XY祥钰', cookieShopName: 'XY祥钰珠宝' },
  { key: 'xiangyuzhubao', name: '祥钰珠宝', cookieShopName: '祥钰珠宝' },
]

export function getShopByKey(key: string): XhsShopDef | undefined {
  return XHS_SHOPS.find((s) => s.key === key)
}

export const ORDER_API_URL = 'https://ark.xiaohongshu.com/api/edith/fulfillment/order/page'
export const ORDER_REFERER = 'https://ark.xiaohongshu.com/app-order/order/query'
export const DEFAULT_PAGE_SIZE = 10
export const DEFAULT_SEARCH_DAYS = 30
export const ORDER_FETCH_TIMEOUT_MS = 15000

export const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
