import { checkScannerHealth } from './scanner-client'
import { checkWritable, getFileBaseDir } from './file-store'
import { workerLog } from './logger'
import fs from 'fs/promises'
import path from 'path'

const SERVER_WS_URL = process.env.SERVER_WS_URL || 'ws://localhost:3001/ws/worker'
const SCANNER_API_URL = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
const LOG_DIR = process.env.WORKER_LOG_DIR || path.join(process.cwd(), 'logs')

async function readLastLogLines(maxLines = 15) {
  try {
    const files = await fs.readdir(LOG_DIR)
    const logs = files.filter((f) => f.startsWith('worker-') && f.endsWith('.log')).sort().reverse()
    if (!logs.length) return []
    const content = await fs.readFile(path.join(LOG_DIR, logs[0]), 'utf-8')
    return content.trim().split('\n').slice(-maxLines)
  } catch {
    return []
  }
}

async function main() {
  const fileBase = getFileBaseDir()
  const writable = await checkWritable()
  const scannerOk = await checkScannerHealth(SCANNER_API_URL)
  const recentLogs = await readLastLogLines()

  const status = {
    workerId: process.env.WORKER_ID || 'local-worker-1',
    workerName: process.env.WORKER_NAME || '本地记账Worker',
    serverWsUrl: SERVER_WS_URL,
    fileBaseDir: fileBase,
    fileBaseWritable: writable,
    scannerApiUrl: SCANNER_API_URL,
    scannerAvailable: scannerOk,
    logDir: LOG_DIR,
    recentLogs,
    hint: 'Worker 进程是否在线请查看 recentLogs 中是否有「已连接服务端」',
  }

  console.log(JSON.stringify(status, null, 2))
  await workerLog('status 命令执行完成')
}

main().catch(async (err) => {
  console.error(err)
  await workerLog(`status 命令失败: ${(err as Error).message}`)
  process.exit(1)
})
