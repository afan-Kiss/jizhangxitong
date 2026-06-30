/** 归一化订单/售后状态字符串 */
export function normalizeOrderStatus(raw: string | null | undefined): string {
  return String(raw || '').trim().toLowerCase()
}

const EXCLUDED_ORDER_STATUSES = [
  '已关闭', 'closed', '已取消', 'cancelled', 'canceled',
  '待付款', 'pending_payment', 'unpaid',
  '待发货', 'pending_ship', 'pending_shipment', 'to_ship',
  '运输中', 'shipping', 'in_transit', 'in_transit',
  'refunded', 'customer_hold', 'returned',
]

const COMPLETED_ORDER_STATUSES = [
  '已完成', 'completed', 'complete', 'done',
  '已签收', 'signed', 'delivered', 'received',
  'sold',
]

const AFTER_SALE_CANCEL = [
  '售后取消', 'after_sale_cancel', 'after_sale_cancelled', 'cancel_after_sale',
]

const EXCLUDED_AFTER_SALE = [
  '售后处理中', 'processing', 'in_after_sale', 'after_sale_processing',
  '退款成功', 'refund_success', 'refunded',
  '售后完成', 'after_sale_complete', 'after_sale_done',
  '退货退款', 'return_refund', 'return_and_refund',
  '仅退款成功', 'refund_only', 'only_refund',
]

/**
 * 有效成交金额口径（运营月报统一规则）
 * - 只算已完成/已签收（含系统内 sold）
 * - 售后取消可计入
 * - 售后处理中、退款成功等不计入
 */
export function isEffectiveSale(
  orderStatus: string | null | undefined,
  afterSaleStatus: string | null | undefined,
): boolean {
  const os = normalizeOrderStatus(orderStatus)
  if (!os) return false

  for (const x of EXCLUDED_ORDER_STATUSES) {
    if (os === normalizeOrderStatus(x) || os.includes(normalizeOrderStatus(x))) return false
  }

  let completed = false
  for (const x of COMPLETED_ORDER_STATUSES) {
    const nx = normalizeOrderStatus(x)
    if (os === nx || os.includes(nx)) {
      completed = true
      break
    }
  }
  if (!completed) return false

  const as = normalizeOrderStatus(afterSaleStatus)
  if (!as) return true

  for (const x of AFTER_SALE_CANCEL) {
    if (as.includes(normalizeOrderStatus(x))) return true
  }

  for (const x of EXCLUDED_AFTER_SALE) {
    if (as.includes(normalizeOrderStatus(x))) return false
  }

  return true
}

export const EFFECTIVE_SALES_RULE_HINT =
  '有效成交金额只算已完成/已签收，售后处理中和退款不算，售后取消算。'
