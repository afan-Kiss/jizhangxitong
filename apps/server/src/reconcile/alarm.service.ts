import { moneySub } from '../lib/money'

export type AlertLevel = 'L1' | 'L2' | 'L3' | 'L4'

export type AlertType =
  | 'amount_mismatch'
  | 'duplicate_ledger'
  | 'orphan_ledger'
  | 'negative_abnormal'
  | 'time_inconsistency'
  | 'ledger_generation_failure'

export type ReconcileAlert = {
  level: AlertLevel
  type: AlertType
  dimension: string
  message: string
  expected?: number
  actual?: number
  diff?: number
  refId?: string
  details?: Record<string, unknown>
}

export type ReconcileStatus = 'OK' | 'WARNING' | 'ERROR'

/** L1 浮点容差（元），差异在此范围内视为可忽略 */
export const FLOAT_TOLERANCE = 0.01

export function amountDiff(expected: number, actual: number): number {
  return Math.abs(moneySub(expected, actual))
}

export function isFloatToleranceDiff(expected: number, actual: number): boolean {
  return amountDiff(expected, actual) <= FLOAT_TOLERANCE
}

export function createAmountMismatchAlert(input: {
  dimension: string
  expected: number
  actual: number
  message?: string
  refId?: string
  details?: Record<string, unknown>
}): ReconcileAlert | null {
  const diff = amountDiff(input.expected, input.actual)
  if (diff <= FLOAT_TOLERANCE) {
    return {
      level: 'L1',
      type: 'amount_mismatch',
      dimension: input.dimension,
      message: input.message || `${input.dimension} 存在 ${diff} 元浮点差异（可忽略）`,
      expected: input.expected,
      actual: input.actual,
      diff,
      refId: input.refId,
      details: input.details,
    }
  }
  return {
    level: 'L2',
    type: 'amount_mismatch',
    dimension: input.dimension,
    message: input.message || `${input.dimension} 金额不一致，差 ${diff} 元`,
    expected: input.expected,
    actual: input.actual,
    diff,
    refId: input.refId,
    details: input.details,
  }
}

export function createAlert(input: Omit<ReconcileAlert, 'level'> & { level: AlertLevel }): ReconcileAlert {
  return input
}

export function filterAlertsForResponse(alerts: ReconcileAlert[], includeL1 = false): ReconcileAlert[] {
  if (includeL1) return alerts
  return alerts.filter((a) => a.level !== 'L1')
}

export function resolveOverallStatus(alerts: ReconcileAlert[], includeL1 = false): ReconcileStatus {
  const visible = filterAlertsForResponse(alerts, includeL1)
  if (visible.some((a) => a.level === 'L4')) return 'ERROR'
  if (visible.some((a) => a.level === 'L3')) return 'ERROR'
  if (visible.some((a) => a.level === 'L2')) return 'WARNING'
  return 'OK'
}
