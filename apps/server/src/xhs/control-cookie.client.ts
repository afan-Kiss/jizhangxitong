/**
 * 总控台 Cookie 读取 — 复用主播分析系统 controlCookieClient 逻辑
 */
const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const DEFAULT_BASE = 'http://8.137.126.18/control'

export type ControlCookieResult = {
  ok: boolean
  value: string
  updatedAt?: string
  source: 'control' | 'fallback' | 'none'
  message?: string
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

function getControlConfig() {
  return {
    baseUrl: normalizeBaseUrl(process.env.CONTROL_SERVER_URL || DEFAULT_BASE),
    serviceToken: String(process.env.CONTROL_SERVICE_TOKEN || '').trim(),
    projectName: process.env.XHS_COOKIE_PROJECT || 'zhubo-analysis',
  }
}

export async function getQianfanCookie(shopName: string): Promise<ControlCookieResult> {
  const { baseUrl, serviceToken } = getControlConfig()
  const name = String(shopName || '').trim()

  if (!serviceToken) {
    return { ok: false, value: '', source: 'none', message: '未配置 CONTROL_SERVICE_TOKEN' }
  }

  try {
    const query = new URLSearchParams({
      platform: 'qianfan',
      shopName: name,
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
        console.warn(`[xhs-cookie] ${name} Cookie 超过 3 小时未更新`)
      }
    }

    return { ok: true, value, updatedAt, source: 'control' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, value: '', source: 'none', message: msg }
  }
}
