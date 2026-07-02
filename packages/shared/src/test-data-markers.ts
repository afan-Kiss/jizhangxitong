/** 自动化验收 / 测试脚本写入的数据标记 — 清理时匹配，不误伤用户真实记录 */

export const TEST_TEXT_MARKERS = [
  'test_auto_check',
  'test_auto_check_multi_images',
  'test-accounting-flow',
  'test-project-expense-only',
  'test-unlimited-attachments',
  'test-user-approval-audit',
  'test-worker-upload-readiness',
  'acceptance test cleanup',
  '自动联调测试',
] as const

/** 备注 / 摘要中的测试 TAG 前缀（后接时间戳） */
export const TEST_REMARK_TAG_PREFIXES = [
  'FUND-',
  'CL-',
  'CP-',
  'RECON-',
  'MONEY-EXP-',
  'IDEM-',
  'IDEM2-',
  'FUF-',
  'STAB-',
  'AUDIT-',
] as const

function includesTestMarker(text?: string | null): boolean {
  if (!text) return false
  return TEST_TEXT_MARKERS.some((m) => text.includes(m))
}

function matchesTestRemarkTag(remark?: string | null): boolean {
  const r = String(remark || '').trim()
  if (!r) return false
  return TEST_REMARK_TAG_PREFIXES.some((prefix) => {
    if (!r.startsWith(prefix)) return false
    return /^\d+/.test(r.slice(prefix.length))
  })
}

function matchesTestOrderNo(orderNo?: string | null): boolean {
  const no = String(orderNo || '').trim()
  if (!no) return false
  if (/^TEST-\d+/.test(no)) return true
  return /^(CP|AUDIT|CL|IDEM2?|FUF|RECON|MONEY-EXP|FUND)-\d+-(ORDER|PENDING-ORDER|ORPHAN)$/i.test(no)
}

/** 判断支出是否为自动化测试数据 */
export function isAcceptanceTestExpense(expense: {
  remark?: string | null
  expenseSummary?: string | null
  externalOrderNo?: string | null
}) {
  if (includesTestMarker(expense.remark) || includesTestMarker(expense.expenseSummary)) return true
  if (matchesTestRemarkTag(expense.remark)) return true
  if (matchesTestOrderNo(expense.externalOrderNo)) return true
  return false
}

/** 判断销售是否为自动化测试数据 */
export function isAcceptanceTestSale(sale: {
  customerRemark?: string | null
  customerName?: string | null
  externalOrderNo?: string | null
}) {
  if (includesTestMarker(sale.customerRemark)) return true
  const remark = String(sale.customerRemark || '').trim()
  if (/^(IDEM|IDEM2|CL|FUF)-\d+$/.test(remark)) return true
  const name = String(sale.customerName || '').trim()
  if (/^(IDEM|IDEM2|CL|FUF)-\d+$/.test(name)) return true
  if (matchesTestOrderNo(sale.externalOrderNo)) return true
  return false
}

/** 判断账本分录是否为测试注入数据 */
export function isAcceptanceTestLedgerEntry(entry: {
  refType?: string | null
  refId?: string | null
  entryType?: string | null
}) {
  if (entry.entryType === 'customer_payment_dup') return true
  const refId = String(entry.refId || '')
  if (/^(RECON|CL|CP|FUND|MONEY-EXP|IDEM2?|FUF|STAB|AUDIT)-\d+-orphan$/i.test(refId)) return true
  if (/^\d+-dup-\d+$/.test(refId)) return true
  if (entry.refType === 'expense' && refId.startsWith('RECON-')) return true
  return false
}
