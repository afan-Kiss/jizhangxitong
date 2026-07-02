/** 报账状态（支出 reimbursementStatus 字段） */
export const REIMBURSEMENT_STATUSES = [
  'pending',
  'submitted',
  'reimbursed',
  'rejected',
  'none',
] as const

export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number]

export const REIMBURSEMENT_STATUS_LABELS: Record<string, string> = {
  pending: '待报账',
  submitted: '已提交',
  reimbursed: '已报账',
  rejected: '已打回',
  none: '不报账',
  not_required: '不报账',
}

/** 旧数据兼容：not_required → none；未知值 → pending */
export function normalizeReimbursementStatus(raw?: string | null): ReimbursementStatus {
  if (!raw || raw === 'not_required') return 'none'
  if ((REIMBURSEMENT_STATUSES as readonly string[]).includes(raw)) {
    return raw as ReimbursementStatus
  }
  return 'pending'
}

export function reimbursementStatusLabel(raw?: string | null): string {
  const key = normalizeReimbursementStatus(raw)
  return REIMBURSEMENT_STATUS_LABELS[key] || REIMBURSEMENT_STATUS_LABELS.pending
}

export function isPendingReimbursement(raw?: string | null): boolean {
  const s = normalizeReimbursementStatus(raw)
  return s === 'pending' || s === 'submitted'
}

export function isReimbursedStatus(raw?: string | null): boolean {
  return normalizeReimbursementStatus(raw) === 'reimbursed'
}
