import { PROJECT_EXPENSE_CATEGORIES } from './constants'

/** 支出业务大类（历史兼容；新记录统一 normal） */
export const EXPENSE_BUSINESS_TYPES = {
  normal: 'normal',
  item_cost: 'item_cost',
  customer_refund: 'customer_refund',
  customer_compensation: 'customer_compensation',
  after_sale_compensation: 'after_sale_compensation',
  platform_fee: 'platform_fee',
  manual_pending: 'manual_pending',
} as const

export type ExpenseBusinessType = typeof EXPENSE_BUSINESS_TYPES[keyof typeof EXPENSE_BUSINESS_TYPES]

/** @deprecated 纯支出系统不再展示业务大类 */
export const EXPENSE_BUSINESS_LABELS: Record<ExpenseBusinessType, string> = {
  normal: '普通支出',
  item_cost: '货品成本',
  customer_refund: '客户返款/退差价',
  customer_compensation: '客户补偿/安抚打款',
  after_sale_compensation: '售后补偿',
  platform_fee: '平台扣款',
  manual_pending: '先记账后补关联',
}

export const PENDING_LINK_STATUSES = {
  linked: 'linked',
  pending_order: 'pending_order',
  pending_goods: 'pending_goods',
  manual: 'manual',
} as const

export const CUSTOMER_PAYMENT_STATUSES = {
  unpaid: 'unpaid',
  paid: 'paid',
  failed: 'failed',
} as const

/** @deprecated 纯支出系统不再扣减销售利润 */
export const PROFIT_DEDUCTING_EXPENSE_TYPES = [
  '客户返款',
  '客户退差价',
  '客户心理落差补偿',
  '售后补偿',
  '退货运费补偿',
  '客户补偿',
  '平台扣款',
] as const

/** @deprecated 纯支出系统不再扣减销售利润 */
export function isProfitDeductingExpense(_expense: {
  expenseType?: string | null
  businessType?: string | null
  saleId?: number | null
}): boolean {
  return false
}

/** @deprecated 纯支出系统不再累计货品成本 */
export function countsTowardBraceletCost(_expense: {
  expenseType?: string | null
  businessType?: string | null
  pendingLinkStatus?: string | null
}): boolean {
  return false
}

export function defaultExpenseTypeForBusiness(_businessType?: ExpenseBusinessType): string {
  return PROJECT_EXPENSE_CATEGORIES[PROJECT_EXPENSE_CATEGORIES.length - 1]
}

export function buildQianfanOrderUrl(template: string, orderNo: string): string | null {
  const t = template?.trim()
  const no = orderNo?.trim()
  if (!t || !no || !t.includes('{orderNo}')) return null
  return t.replace(/\{orderNo\}/g, encodeURIComponent(no))
}
