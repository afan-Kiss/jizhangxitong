import { Decimal } from '@prisma/client/runtime/library'

export function toNumber(value: Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return Number(value.toString()) || 0
}

export function formatDateMD(date: Date): string {
  return `${date.getMonth() + 1}.${date.getDate()}`
}

/** 本地日历 yyyy-mm-dd（避免 UTC toISOString 跨日偏移） */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function generateNo(prefix: string): string {
  const now = new Date()
  const ts = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `${prefix}${ts}${rand}`
}

export function parseDateInput(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00`)
  }
  return new Date(input)
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}
