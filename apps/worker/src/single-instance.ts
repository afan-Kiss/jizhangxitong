import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WORKER_WINDOW_TITLE } from '@jade-account/shared'

let lockFilePath: string | null = null

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readLockPid(file: string): number {
  try {
    return Number(fs.readFileSync(file, 'utf-8').trim())
  } catch {
    return 0
  }
}

export function releaseWorkerLock() {
  if (!lockFilePath) return
  try {
    const current = readLockPid(lockFilePath)
    if (current === process.pid) fs.unlinkSync(lockFilePath)
  } catch {
    /* ignore */
  }
}

function resolveLockFile(serverWsUrl: string, workerId: string): string {
  const key = crypto.createHash('sha256').update(`${serverWsUrl}|${workerId}`).digest('hex').slice(0, 16)
  const dir = path.join(os.homedir(), '.jade-accounting')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `worker-${key}.lock`)
}

/** 同一云端地址只允许一个 Worker（跨项目目录、跨窗口全局生效） */
export function acquireWorkerLock(serverWsUrl: string, workerId: string): void {
  lockFilePath = resolveLockFile(serverWsUrl, workerId)
  const existingPid = readLockPid(lockFilePath)
  if (existingPid && existingPid !== process.pid && isProcessAlive(existingPid)) {
    throw new Error(
      `${WORKER_WINDOW_TITLE} 已在运行 (PID ${existingPid})。请关闭其他 Worker 窗口后再启动。`,
    )
  }
  fs.writeFileSync(lockFilePath, String(process.pid), 'utf-8')
  process.on('exit', releaseWorkerLock)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      releaseWorkerLock()
      process.exit(sig === 'SIGINT' ? 130 : 143)
    })
  }
  if (process.platform === 'win32') {
    process.title = WORKER_WINDOW_TITLE
  }
}
