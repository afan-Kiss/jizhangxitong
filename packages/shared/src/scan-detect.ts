export type ScanType = 'goods_code' | 'order_no' | 'logistics_no' | 'unknown'

const LOGISTICS_PREFIXES = /^(SF|YT|ZTO|STO|JD|JT|KY|EMS|YZ|DB|ANE|HTKY)/i
const GOODS_PREFIXES = /^(HTY|DIA|JZ|GOOD|ITEM|F\d{4,})/i

/** 去掉首尾空格，合并中间连续空格 */
export function normalizeScanInput(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, '')
}

/**
 * 统一扫码类型识别（一期规则）
 */
export function detectScanCodeType(raw: string): { scanType: ScanType; normalizedCode: string } {
  const normalizedCode = normalizeScanInput(raw)
  if (!normalizedCode) {
    return { scanType: 'unknown', normalizedCode: '' }
  }

  const upper = normalizedCode.toUpperCase()

  if (LOGISTICS_PREFIXES.test(upper)) {
    return { scanType: 'logistics_no', normalizedCode: upper }
  }

  if (GOODS_PREFIXES.test(upper) || /^HTY-/i.test(normalizedCode)) {
    return { scanType: 'goods_code', normalizedCode: upper }
  }

  if (/^P\d{10,}$/i.test(normalizedCode)) {
    return { scanType: 'order_no', normalizedCode: upper }
  }

  if (/^\d{10,}$/.test(normalizedCode)) {
    return { scanType: 'order_no', normalizedCode: upper }
  }

  return { scanType: 'unknown', normalizedCode: upper }
}

export function scanTypeHumanLabel(scanType: ScanType): string {
  switch (scanType) {
    case 'goods_code': return '货品码'
    case 'order_no': return '订单号'
    case 'logistics_no': return '物流单号'
    default: return '未知编码'
  }
}

export function scanTypeRecognizeMessage(scanType: ScanType, code: string): string {
  if (!code) return '请输入或扫描编码'
  const label = scanTypeHumanLabel(scanType)
  return `识别到${label}：${code}`
}
