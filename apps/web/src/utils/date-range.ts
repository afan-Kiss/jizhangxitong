export type DateRangeKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom'

export type DateRangeState = {
  range: DateRangeKey
  startDate: string
  endDate: string
}

export const RANGE_PRESETS: { key: DateRangeKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'this_week', label: '本周' },
  { key: 'last_week', label: '上周' },
  { key: 'this_month', label: '本月' },
  { key: 'last_month', label: '上月' },
]

export function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export function resolveDateRange(range: DateRangeKey, startDate?: string, endDate?: string): DateRangeState {
  const now = new Date()
  switch (range) {
    case 'today':
      return { range, startDate: formatYmd(now), endDate: formatYmd(now) }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return { range, startDate: formatYmd(y), endDate: formatYmd(y) }
    }
    case 'this_week':
      return { range, startDate: formatYmd(startOfWeek(now)), endDate: formatYmd(now) }
    case 'last_week': {
      const thisMon = startOfWeek(now)
      const lastMon = new Date(thisMon)
      lastMon.setDate(lastMon.getDate() - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastSun.getDate() + 6)
      return { range, startDate: formatYmd(lastMon), endDate: formatYmd(lastSun) }
    }
    case 'last_month': {
      const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      return { range, startDate: formatYmd(start), endDate: formatYmd(end) }
    }
    case 'custom':
      return {
        range,
        startDate: startDate || formatYmd(startOfMonth(now)),
        endDate: endDate || formatYmd(now),
      }
    case 'this_month':
    default:
      return { range: 'this_month', startDate: formatYmd(startOfMonth(now)), endDate: formatYmd(now) }
  }
}

export function rangeLabel(state: DateRangeState): string {
  const preset = RANGE_PRESETS.find((p) => p.key === state.range)
  if (preset && state.range !== 'custom') return preset.label
  return `${state.startDate} 至 ${state.endDate}`
}

export function formatDisplayDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return `${m}月${d}日`
}

export function parseRouteRange(query: Record<string, string | string[] | undefined>): DateRangeState {
  const raw = String(query.range || 'today')
  const valid: DateRangeKey[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom']
  const range = (valid.includes(raw as DateRangeKey) ? raw : 'today') as DateRangeKey
  const startDate = query.startDate ? String(query.startDate) : undefined
  const endDate = query.endDate ? String(query.endDate) : undefined
  return resolveDateRange(range, startDate, endDate)
}

export function toRangeQuery(state: DateRangeState): Record<string, string> {
  return {
    range: state.range,
    startDate: state.startDate,
    endDate: state.endDate,
  }
}

export function last7Days(): DateRangeState {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  return { range: 'custom', startDate: formatYmd(start), endDate: formatYmd(end) }
}

export function last30Days(): DateRangeState {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return { range: 'custom', startDate: formatYmd(start), endDate: formatYmd(end) }
}
