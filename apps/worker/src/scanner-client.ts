import { ERROR_CODES } from '@jade-account/shared'
import { assertPathAllowed, readFileByPath } from './file-store'

const SCANNER_NOT_FOUND_MSG = '扫码枪系统未找到该镯子，请确认编号是否正确。'

export interface ScannerBraceletPayload {
  scannerProductId?: string
  braceletCode?: string
  certificateNo?: string
  imagePath?: string
  inboundAt?: string
  inboundCost?: number
  status?: string
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const e = new Error('扫码枪 API 暂时不可用')
    ;(e as Error & { code: string }).code = ERROR_CODES.SCANNER_API_UNAVAILABLE
    throw e
  }
}

function normalizeScannerItem(data: Record<string, unknown>, fallbackCode?: string): ScannerBraceletPayload | null {
  const braceletCodeVal = String(data.braceletCode || data.certNo || fallbackCode || '').trim()
  if (!braceletCodeVal) return null
  const costRaw = data.inboundCost ?? data.cost ?? 0
  const inboundCost = Number(String(costRaw).replace(/[^\d.-]/g, '') || 0)
  const qty = Number(data.qty ?? 1)
  const status = String(data.status || (qty > 0 ? 'in_stock' : 'sold'))
  let imagePath = data.imagePath as string | undefined
  if (!imagePath && Array.isArray(data.mediaAssets) && data.mediaAssets.length > 0) {
    imagePath = String((data.mediaAssets[0] as { path?: string }).path || '')
  }
  return {
    scannerProductId: String(data.scannerProductId || data.id || ''),
    braceletCode: braceletCodeVal,
    certificateNo: String(data.certificateNo || data.certNo || braceletCodeVal),
    imagePath: imagePath || undefined,
    inboundAt: String(data.inboundAt || data.arrivalDate || data.createdAt || ''),
    inboundCost,
    status,
  }
}

function parseScannerResponse(json: Record<string, unknown>, fallbackCode?: string) {
  if (json.success === false || json.ok === false) return null
  const data = json.data as Record<string, unknown> | undefined
  if (!data) return null
  return normalizeScannerItem(data, fallbackCode)
}

function parseScannerListResponse(json: Record<string, unknown>): ScannerBraceletPayload[] {
  if (json.success === false || json.ok === false) return []
  const data = json.data
  const list = Array.isArray(data) ? data : []
  return list.map((item) => normalizeScannerItem(item as Record<string, unknown>)).filter((i): i is ScannerBraceletPayload => !!i?.braceletCode)
}

export async function checkScannerHealth(baseUrl: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/api/health`, timeoutMs)
    return res.ok
  } catch {
    return false
  }
}

export async function getBraceletByCode(braceletCode: string, baseUrl: string, timeoutMs: number) {
  const code = braceletCode.trim()
  if (!code) return null
  const primaryUrl = `${baseUrl.replace(/\/$/, '')}/api/bracelets/${encodeURIComponent(code)}`
  try {
    const res = await fetchWithTimeout(primaryUrl, timeoutMs)
    if (res.ok) {
      const json = await res.json() as Record<string, unknown>
      return parseScannerResponse(json, code)
    }
  } catch (err) {
    if ((err as Error & { code?: string }).code === ERROR_CODES.SCANNER_API_UNAVAILABLE) throw err
  }
  return null
}

export async function searchBraceletsFromScanner(keyword: string, baseUrl: string, timeoutMs: number) {
  const q = keyword.trim()
  if (!q) return []
  const primaryUrl = `${baseUrl.replace(/\/$/, '')}/api/bracelets/search?q=${encodeURIComponent(q)}`
  try {
    const res = await fetchWithTimeout(primaryUrl, timeoutMs)
    if (res.ok) {
      const json = await res.json() as Record<string, unknown>
      return parseScannerListResponse(json)
    }
  } catch (err) {
    if ((err as Error & { code?: string }).code === ERROR_CODES.SCANNER_API_UNAVAILABLE) throw err
  }
  return []
}

export async function readImageByPath(imagePath: string) {
  if (imagePath.includes('..')) {
    const e = new Error('非法图片路径')
    ;(e as Error & { code: string }).code = ERROR_CODES.PATH_TRAVERSAL
    throw e
  }
  return readFileByPath(imagePath, true)
}

export { SCANNER_NOT_FOUND_MSG }
