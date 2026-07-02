/**
 * 总控台 Cookie 读取 — 优先本地 resolver，失败时从主播分析系统 SQLite/API 回退
 */
const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const DEFAULT_CONTROL_BASE = 'http://8.137.126.18/control'
const DEFAULT_ZHUBO_BASE = 'http://127.0.0.1:4723'

export type ControlCookieResult = {
  ok: boolean
  value: string
  updatedAt?: string
  source: 'control' | 'fallback' | 'none'
  message?: string
}

type ShopKeyRule = { key: string; canonical: string; patterns: RegExp[] }

const SHOP_KEY_RULES: ShopKeyRule[] = [
  { key: 'xyxiangyu', canonical: 'XY祥钰珠宝', patterns: [/XY\s*祥钰/i, /XY祥钰珠宝/i] },
  { key: 'shiyuju', canonical: '拾玉居和田玉', patterns: [/拾玉居/i] },
  { key: 'hetianyayu', canonical: '和田雅玉', patterns: [/和田雅玉/i, /禾田雅玉/i] },
  { key: 'xiangyu', canonical: '祥钰珠宝', patterns: [/^祥钰珠宝$/i] },
]

const DIRECT_SHOP_KEYS = new Set(['hetianyayu', 'shiyuju', 'xyxiangyu', 'xiangyu'])

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

function getControlConfig() {
  return {
    baseUrl: normalizeBaseUrl(process.env.CONTROL_SERVER_URL || DEFAULT_CONTROL_BASE),
    serviceToken: String(process.env.CONTROL_SERVICE_TOKEN || '').trim(),
    zhuboBaseUrl: normalizeBaseUrl(process.env.ZHUBO_ANALYSIS_URL || DEFAULT_ZHUBO_BASE),
  }
}

export function resolveZhuboShopKey(shopName: string): string | null {
  const label = String(shopName || '').trim()
  if (!label) return null
  if (DIRECT_SHOP_KEYS.has(label)) return label
  for (const rule of SHOP_KEY_RULES) {
    if (label === rule.canonical || rule.patterns.some((p) => p.test(label))) {
      return rule.key
    }
  }
  return null
}

async function fetchFromControl(shopName: string): Promise<ControlCookieResult> {
  const { baseUrl, serviceToken } = getControlConfig()
  if (!serviceToken) {
    return { ok: false, value: '', source: 'none', message: '未配置 CONTROL_SERVICE_TOKEN' }
  }

  try {
    const query = new URLSearchParams({
      platform: 'qianfan',
      shopName,
      keyName: 'cookie',
    })
    const res = await fetch(`${baseUrl}/api/secrets/resolve?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'x-service-token': serviceToken,
      },
      signal: AbortSignal.timeout(12000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (res.status === 404) {
      return { ok: false, value: '', source: 'none', message: '总控台没有这个店铺的 Cookie' }
    }
    if (res.status === 403) {
      return { ok: false, value: '', source: 'none', message: '总控服务令牌不正确' }
    }
    if (!res.ok) {
      return { ok: false, value: '', source: 'none', message: String(data.error || `HTTP ${res.status}`) }
    }

    const value = String(data.value || '').trim()
    if (!value) {
      return { ok: false, value: '', source: 'none', message: 'Cookie 为空' }
    }

    const updatedAt = String(data.updatedAt || '')
    if (updatedAt) {
      const age = Date.now() - Date.parse(updatedAt)
      if (Number.isFinite(age) && age > THREE_HOURS_MS) {
        console.warn(`[xhs-cookie] ${shopName} Cookie 超过 3 小时未更新`)
      }
    }

    return { ok: true, value, updatedAt, source: 'control' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, value: '', source: 'none', message: msg }
  }
}

async function fetchFromZhuboAnalysis(shopName: string): Promise<ControlCookieResult> {
  const { zhuboBaseUrl } = getControlConfig()
  const shopKey = resolveZhuboShopKey(shopName)
  if (!shopKey) {
    return { ok: false, value: '', source: 'none', message: `无法映射到主播分析店铺: ${shopName}` }
  }

  try {
    const query = new URLSearchParams({ shopKey })
    const res = await fetch(`${zhuboBaseUrl}/api/shop-cookies/plain?${query.toString()}`, {
      signal: AbortSignal.timeout(12000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const payload = (data.data ?? data) as Record<string, unknown>

    if (!res.ok) {
      const msg = String(payload.message || data.message || `HTTP ${res.status}`)
      return { ok: false, value: '', source: 'none', message: `主播分析: ${msg}` }
    }

    const value = String(payload.cookie || '').trim()
    if (!value) {
      return { ok: false, value: '', source: 'none', message: '主播分析 Cookie 为空' }
    }

    console.log(
      `[xhs-cookie] 已从主播分析系统读取 Cookie shop=${shopName} shopKey=${shopKey} len=${value.length}`,
    )
    return {
      ok: true,
      value,
      source: 'fallback',
      message: 'zhubo-analysis',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, value: '', source: 'none', message: `主播分析读取失败: ${msg}` }
  }
}

export async function getQianfanCookie(shopName: string): Promise<ControlCookieResult> {
  const name = String(shopName || '').trim()
  const primary = await fetchFromControl(name)
  if (primary.ok && primary.value) return primary

  console.warn(
    `[xhs-cookie] 总控 Cookie 不可用，尝试主播分析回退 shop=${name} reason=${primary.message || 'unknown'}`,
  )
  const fallback = await fetchFromZhuboAnalysis(name)
  if (fallback.ok && fallback.value) return fallback

  return {
    ok: false,
    value: '',
    source: 'none',
    message: fallback.message || primary.message || 'Cookie 读取失败',
  }
}
