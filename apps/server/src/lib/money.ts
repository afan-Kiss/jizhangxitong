import { Decimal } from '@prisma/client/runtime/library'

export type ParseMoneyOptions = {
  allowZero?: boolean
  allowNegative?: boolean
}

export function moneyRound(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export function toCents(value: number): number {
  return Math.round(moneyRound(value) * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function parseMoneyInput(
  value: unknown,
  fieldName = '金额',
  opts: ParseMoneyOptions = {},
): number {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName}不能为空`)
  }
  const raw = typeof value === 'string' ? value.trim().replace(/,/g, '') : value
  const num = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(num)) {
    throw new Error(`${fieldName}格式不对，请填写有效数字`)
  }
  if (num !== moneyRound(num)) {
    throw new Error(`${fieldName}格式不对，最多填两位小数`)
  }
  if (!opts.allowNegative && num < 0) {
    throw new Error(`${fieldName}不能为负数`)
  }
  if (!opts.allowZero && num <= 0 && !opts.allowNegative) {
    throw new Error(`${fieldName}必须大于 0`)
  }
  return moneyRound(num)
}

export function toMoneyNumber(value: Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return moneyRound(value)
  if (typeof value === 'string') return moneyRound(Number(value) || 0)
  return moneyRound(Number(value.toString()) || 0)
}

export function moneyAdd(...values: number[]): number {
  const cents = values.reduce((sum, value) => sum + toCents(value || 0), 0)
  return fromCents(cents)
}

export function moneySub(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b))
}

export function sumMoney(values: Array<Decimal | number | string | null | undefined>): number {
  let cents = 0
  for (const value of values) {
    cents += toCents(toMoneyNumber(value))
  }
  return fromCents(cents)
}
