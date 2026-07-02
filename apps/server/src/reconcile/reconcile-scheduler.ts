import { localDateString } from '../lib/utils'
import { runDailyReconcile } from './reconcile.service'

let timer: ReturnType<typeof setTimeout> | null = null
let running = false

function msUntilNextMidnight(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return Math.max(1000, next.getTime() - now.getTime())
}

function yesterdayDateString(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

export async function executeScheduledDailyReconcile(dateStr?: string) {
  if (running) {
    console.warn('[reconcile] 上一次对账尚未结束，跳过')
    return null
  }
  running = true
  try {
    const date = dateStr || yesterdayDateString()
    const result = await runDailyReconcile(date)
    console.log(
      `[reconcile] ${date} 完成 status=${result.status} alerts=${result.alerts.length}`,
    )
    if (result.alerts.length) {
      for (const alert of result.alerts.slice(0, 10)) {
        console.warn(`[reconcile][${alert.level}] ${alert.message}`)
      }
    }
    return result
  } catch (err) {
    console.error('[reconcile] 定时对账失败:', err)
    return null
  } finally {
    running = false
  }
}

export function startDailyReconcileScheduler() {
  if (timer) return

  const schedule = () => {
    const delay = msUntilNextMidnight()
    timer = setTimeout(async () => {
      timer = null
      await executeScheduledDailyReconcile()
      schedule()
    }, delay)
  }

  schedule()
  console.log(`[reconcile] 已注册每日凌晨自动对账（约 ${Math.round(msUntilNextMidnight() / 60000)} 分钟后首次执行）`)
}

export function stopDailyReconcileScheduler() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
