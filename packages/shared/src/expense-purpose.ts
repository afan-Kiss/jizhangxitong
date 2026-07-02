import { EXPENSE_BUSINESS_TYPES, type ExpenseBusinessType } from './expense-business'

/** 记支出时的「大白话支出用途」 */
export const EXPENSE_PURPOSE_OPTIONS = [
  { label: '普通支出', businessType: EXPENSE_BUSINESS_TYPES.normal },
  { label: '客户返款', businessType: EXPENSE_BUSINESS_TYPES.customer_refund },
  { label: '售后补偿', businessType: EXPENSE_BUSINESS_TYPES.after_sale_compensation },
  { label: '快递/运费', businessType: EXPENSE_BUSINESS_TYPES.normal },
  { label: '包装物料', businessType: EXPENSE_BUSINESS_TYPES.normal },
  { label: '推广工具', businessType: EXPENSE_BUSINESS_TYPES.normal },
  { label: '其他', businessType: EXPENSE_BUSINESS_TYPES.normal },
] as const

export type ExpensePurposeLabel = (typeof EXPENSE_PURPOSE_OPTIONS)[number]['label']

export function resolveExpensePurpose(purpose: string): {
  businessType: ExpenseBusinessType
  expenseSummary: string
} {
  const label = purpose?.trim() || '普通支出'
  const opt = EXPENSE_PURPOSE_OPTIONS.find((o) => o.label === label)
  if (opt) return { businessType: opt.businessType, expenseSummary: opt.label }
  return { businessType: EXPENSE_BUSINESS_TYPES.normal, expenseSummary: label }
}

/** 列表 / 导出 / 对账中心展示用 */
export function displayExpensePurpose(expense: {
  expenseSummary?: string | null
  businessType?: string | null
}): string {
  const summary = expense.expenseSummary?.trim()
  if (summary) return summary
  const mapped = EXPENSE_PURPOSE_OPTIONS.find(
    (o) => o.businessType === expense.businessType && o.label !== '普通支出',
  )
  return mapped?.label || '普通支出'
}
