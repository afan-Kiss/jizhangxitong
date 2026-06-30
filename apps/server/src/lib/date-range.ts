import { startOfDay, endOfDay, startOfWeek, startOfMonth, parseDateInput } from './utils'

export type DateRangeKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom'

export function formatYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function resolveDateRange(range?: string, startDate?: string, endDate?: string) {
  const now = new Date()
  let start: Date
  let end: Date
  let key: DateRangeKey

  switch (range) {
    case 'today':
      key = 'today'
      start = startOfDay(now)
      end = endOfDay(now)
      break
    case 'yesterday': {
      key = 'yesterday'
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      start = startOfDay(y)
      end = endOfDay(y)
      break
    }
    case 'this_week':
    case 'week':
      key = 'this_week'
      start = startOfWeek(now)
      end = endOfDay(now)
      break
    case 'last_week': {
      key = 'last_week'
      const thisMon = startOfWeek(now)
      start = new Date(thisMon)
      start.setDate(start.getDate() - 7)
      const lastSun = new Date(start)
      lastSun.setDate(lastSun.getDate() + 6)
      end = endOfDay(lastSun)
      break
    }
    case 'last_month': {
      key = 'last_month'
      start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      break
    }
    case 'custom':
      key = 'custom'
      start = startDate ? startOfDay(parseDateInput(startDate)) : startOfMonth(now)
      end = endDate ? endOfDay(parseDateInput(endDate)) : endOfDay(now)
      if (end < start) end = endOfDay(start)
      break
    case 'this_month':
    case 'month':
    default:
      key = 'this_month'
      start = startOfMonth(now)
      end = endOfDay(now)
  }

  return {
    key,
    start,
    end,
    startDate: formatYmd(start),
    endDate: formatYmd(end),
  }
}

export function rangeLabel(key: DateRangeKey, startDate: string, endDate: string): string {
  switch (key) {
    case 'today': return '今日'
    case 'yesterday': return '昨日'
    case 'this_week': return '本周'
    case 'last_week': return '上周'
    case 'this_month': return '本月'
    case 'last_month': return '上月'
    case 'custom': return `${startDate} 至 ${endDate}`
    default: return '本月'
  }
}
