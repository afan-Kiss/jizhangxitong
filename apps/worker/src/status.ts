import { checkWritable, getFileBaseDir } from './file-store'
import { workerLog } from './logger'
import fs from 'fs/promises'
import path from 'path'
import { WORKER_DISPLAY_NAME } from '@jade-account/shared'
import {
  loadWorkerEnv,
  getWorkerEnvPath,
  getServerWsUrl,
  getWorkerWsToken,
  maskToken,
  WORKER_DIR,
} from './load-env'

loadWorkerEnv()

const SERVER_WS_URL = getServerWsUrl()
const LOG_DIR = process.env.WORKER_LOG_DIR || path.join(WORKER_DIR, 'logs')

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
  const recentLogs = await readLastLogLines()

  const status = {
    cwd: process.cwd(),
    workerDir: WORKER_DIR,
    envFile: getWorkerEnvPath(),
    workerId: process.env.WORKER_ID || 'local-worker-1',
    workerName: process.env.WORKER_NAME || WORKER_DISPLAY_NAME,
    serverWsUrl: SERVER_WS_URL,
    workerWsTokenSet: Boolean(getWorkerWsToken()),
    workerWsTokenPreview: maskToken(getWorkerWsToken()),
    fileBaseDir: fileBase,
    fileBaseWritable: writable,
    logDir: LOG_DIR,
    recentLogs,
    hint: 'Worker 进程是否在线请查看 recentLogs 中是否有「已连接服务端」',
  }

  console.log(JSON.stringify(status, null, 2))
}

main().catch(async (err) => {
  console.error(err)
  await workerLog(`status 命令失败: ${(err as Error).message}`)
  process.exit(1)
})
