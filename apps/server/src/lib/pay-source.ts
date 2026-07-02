import { DEFAULT_PAY_SOURCE } from '@jade-account/shared'

export class PaySourceRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaySourceRejectedError'
  }
}

/** 统一付款来源口径：专属经费 → 项目专用资金；员工垫付 → 拒绝 */
export function normalizePaySource(input?: string | null): string {
  const raw = (input || DEFAULT_PAY_SOURCE).trim()
  if (!raw) return DEFAULT_PAY_SOURCE
  if (raw === '员工垫付') {
    throw new PaySourceRejectedError('请使用项目专用资金记支出')
  }
  if (raw === '专属经费') {
    return DEFAULT_PAY_SOURCE
  }
  return raw
}
