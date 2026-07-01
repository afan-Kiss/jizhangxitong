/** 支出业务大类 */
export const EXPENSE_BUSINESS_TYPES = {
  normal: 'normal',
  item_cost: 'item_cost',
  customer_refund: 'customer_refund',
  customer_compensation: 'customer_compensation',
  after_sale_compensation: 'after_sale_compensation',
  platform_fee: 'platform_fee',
  staff_reimbursement: 'staff_reimbursement',
  manual_pending: 'manual_pending',
} as const

export type ExpenseBusinessType = typeof EXPENSE_BUSINESS_TYPES[keyof typeof EXPENSE_BUSINESS_TYPES]

export const EXPENSE_BUSINESS_LABELS: Record<ExpenseBusinessType, string> = {
  normal: '好评返现',
  item_cost: '货品成本',
  customer_refund: '客户返款/退差价',
  customer_compensation: '客户补偿/安抚打款',
  after_sale_compensation: '售后补偿',
  platform_fee: '平台扣款',
  staff_reimbursement: '员工垫付',
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

/** 扣减销售利润的支出分类（含旧数据兼容） */
export const PROFIT_DEDUCTING_EXPENSE_TYPES = [
  '客户返款',
  '客户退差价',
  '客户心理落差补偿',
  '售后补偿',
  '退货运费补偿',
  '客户补偿',
  '平台扣款',
] as const

const PROFIT_DEDUCTING_BUSINESS_TYPES = new Set<string>([
  EXPENSE_BUSINESS_TYPES.customer_refund,
  EXPENSE_BUSINESS_TYPES.customer_compensation,
  EXPENSE_BUSINESS_TYPES.after_sale_compensation,
])

export function isProfitDeductingExpense(expense: {
  expenseType?: string | null
  businessType?: string | null
  saleId?: number | null
}): boolean {
  const bt = expense.businessType || ''
  if (PROFIT_DEDUCTING_BUSINESS_TYPES.has(bt)) return true
  if (bt === EXPENSE_BUSINESS_TYPES.platform_fee) return !!expense.saleId
  const t = expense.expenseType || ''
  return (PROFIT_DEDUCTING_EXPENSE_TYPES as readonly string[]).includes(t)
}

/** 是否计入货品 costTotal（客户返款/补偿不计入成本） */
export function countsTowardBraceletCost(expense: {
  expenseType?: string | null
  businessType?: string | null
  pendingLinkStatus?: string | null
}): boolean {
  if (isProfitDeductingExpense(expense)) return false
  if (expense.businessType === EXPENSE_BUSINESS_TYPES.manual_pending
    && expense.pendingLinkStatus !== PENDING_LINK_STATUSES.linked) {
    return false
  }
  return true
}

export function defaultExpenseTypeForBusiness(businessType: ExpenseBusinessType): string {
  switch (businessType) {
    case 'customer_refund': return '客户返款'
    case 'customer_compensation': return '客户心理落差补偿'
    case 'after_sale_compensation': return '售后补偿'
    case 'platform_fee': return '平台扣款'
    case 'item_cost': return '原料采购'
    case 'staff_reimbursement': return '员工垫付'
    default: return '其他'
  }
}

export function buildQianfanOrderUrl(template: string, orderNo: string): string | null {
  const t = template?.trim()
  const no = orderNo?.trim()
  if (!t || !no || !t.includes('{orderNo}')) return null
  return t.replace(/\{orderNo\}/g, encodeURIComponent(no))
}
