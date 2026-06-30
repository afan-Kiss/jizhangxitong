/** 归一化退款状态 */
export function normalizeRefundStatus(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase()
}

const CONFIRMED_REFUND_STATUSES = new Set([
  '',
  'completed',
  'success',
  'refund_success',
  '已完成',
  '退款成功',
])

const UNCONFIRMED_REFUND_STATUSES = new Set([
  'pending',
  'processing',
  'cancelled',
  'canceled',
  'failed',
  '待处理',
  '处理中',
  '已取消',
  '失败',
])

/**
 * 是否计入利润扣减的已确认退款。
 * 空值兼容旧数据，默认视为已确认。
 */
export function isConfirmedRefund(status: string | null | undefined): boolean {
  const s = normalizeRefundStatus(status)
  if (UNCONFIRMED_REFUND_STATUSES.has(s)) return false
  if (CONFIRMED_REFUND_STATUSES.has(s)) return true
  // 未知状态：保守计入（与旧数据 completed 默认一致）
  return true
}
