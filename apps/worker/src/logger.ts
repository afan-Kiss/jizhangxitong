import fs from 'fs/promises'
import path from 'path'

const LOG_DIR = process.env.WORKER_LOG_DIR || path.join(process.cwd(), 'logs')

export async function workerLog(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
    const file = path.join(LOG_DIR, `worker-${new Date().toISOString().slice(0, 10)}.log`)
    await fs.appendFile(file, line + '\n')
  } catch {
    // ignore log write failure
  }
}

export const BACKOFF_MS = [3000, 5000, 10000, 30000, 60000]

export function nextBackoffMs(attempt: number): number {
  const idx = Math.min(attempt, BACKOFF_MS.length - 1)
  return BACKOFF_MS[idx]
}
