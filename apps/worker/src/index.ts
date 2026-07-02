import WebSocket from 'ws'
import { RPC_METHODS, RpcMessage, WORKER_DISPLAY_NAME, WORKER_WINDOW_TITLE } from '@jade-account/shared'
import { ensureBaseDirs, fileExists, readFileByPath, saveUpload, deleteLocalFile, assertPathAllowed } from './file-store'
import { workerLog, nextBackoffMs } from './logger'
import { acquireWorkerLock, releaseWorkerLock } from './single-instance'
import {
  loadWorkerEnv,
  getWorkerEnvPath,
  getServerWsUrl,
  getWorkerWsToken,
  assertWorkerEnvForBoot,
  maskToken,
  WORKER_DIR,
  PRODUCTION_WS,
} from './load-env'

loadWorkerEnv()
assertWorkerEnvForBoot()

const SERVER_WS_URL = getServerWsUrl()
const WORKER_WS_TOKEN = getWorkerWsToken()
const WORKER_ID = process.env.WORKER_ID || 'local-worker-1'
const WORKER_NAME = process.env.WORKER_NAME || WORKER_DISPLAY_NAME
const FILE_BASE_DIR = process.env.FILE_BASE_DIR || ''
const VERSION = '1.0.0'

acquireWorkerLock(SERVER_WS_URL, WORKER_ID)

const SCANNER_DISABLED = { success: false as const, error: '扫码枪功能已下线，本系统仅用于图片上传', code: 'SCANNER_DISABLED' }

let reconnectAttempt = 0
let wsInstance: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let intentionalClose = false
let shuttingDown = false

function exitWorker(code: number, message: string) {
  if (shuttingDown) return
  shuttingDown = true
  void workerLog(message).finally(() => {
    releaseWorkerLock()
    process.exit(code)
  })
}

function wsUrlWithToken() {
  const url = new URL(SERVER_WS_URL)
  if (WORKER_WS_TOKEN) url.searchParams.set('token', WORKER_WS_TOKEN)
  return url.toString()
}

async function handleRpc(msg: RpcMessage) {
  try {
    switch (msg.method) {
      case RPC_METHODS.SCANNER_GET_BRACELET:
      case RPC_METHODS.SCANNER_SEARCH_BRACELETS:
      case RPC_METHODS.SCANNER_READ_IMAGE:
      case RPC_METHODS.WORKER_SCAN_PROBE:
        return SCANNER_DISABLED
      case RPC_METHODS.FILE_SAVE_UPLOAD: {
        try {
          const result = await saveUpload({
            fileType: String(msg.params.fileType || 'other'),
            originalName: String(msg.params.originalName || 'file.jpg'),
            mimeType: String(msg.params.mimeType || 'image/jpeg'),
            base64: String(msg.params.base64 || ''),
          })
          await workerLog(`保存图片成功: ${result.localPath}`)
          return { success: true, data: result }
        } catch (err) {
          await workerLog(`保存图片失败: ${(err as Error).message}`)
          return { success: false, error: (err as Error).message }
        }
      }
      case RPC_METHODS.WORKER_UPLOAD_PROBE: {
        return { success: true, data: { ok: true, fileBaseWritable: !!FILE_BASE_DIR } }
      }
      case RPC_METHODS.FILE_DELETE_LOCAL: {
        const localPath = String(msg.params.localPath || '')
        const thumbPath = String(msg.params.thumbPath || '')
        try {
          if (localPath) assertPathAllowed(localPath)
          if (thumbPath) assertPathAllowed(thumbPath)
          const deleted = await deleteLocalFile(localPath, thumbPath || undefined)
          await workerLog(`删除本地文件: ${deleted.join(', ')}`)
          return { success: true, data: { deleted } }
        } catch (err) {
          return { success: false, error: (err as Error).message }
        }
      }
      case RPC_METHODS.FILE_READ: {
        const localPath = String(msg.params.localPath || '')
        if (!localPath || !(await fileExists(localPath))) {
          return { success: false, error: '文件不存在', code: 'FILE_NOT_FOUND' }
        }
        const { buffer, mimeType } = await readFileByPath(localPath)
        return {
          success: true,
          data: {
            fileId: Number(msg.params.fileId),
            buffer: buffer.toString('base64'),
            mimeType,
            originalName: String(msg.params.originalName || 'file'),
            fileType: String(msg.params.fileType || 'other'),
          },
        }
      }
      case RPC_METHODS.FILE_READ_THUMB: {
        const thumbPath = String(msg.params.thumbPath || msg.params.localPath || '')
        if (!thumbPath || !(await fileExists(thumbPath))) {
          return { success: false, error: '缩略图不存在', code: 'FILE_NOT_FOUND' }
        }
        const { buffer, mimeType } = await readFileByPath(thumbPath)
        return { success: true, data: { fileId: Number(msg.params.fileId), buffer: buffer.toString('base64'), mimeType } }
      }
      case RPC_METHODS.FILE_EXISTS: {
        const localPath = String(msg.params.localPath || '')
        const exists = localPath ? await fileExists(localPath).catch(() => false) : false
        return { success: true, data: { exists } }
      }
      case RPC_METHODS.FILE_READ_MANY_FOR_EXPORT: {
        const files = (msg.params.files as Array<{ fileId: number; localPath: string; fileType: string; originalName?: string }>) || []
        const results = []
        for (const f of files) {
          if (!(await fileExists(f.localPath).catch(() => false))) continue
          const { buffer, mimeType } = await readFileByPath(f.localPath)
          results.push({
            fileId: f.fileId,
            buffer: buffer.toString('base64'),
            mimeType,
            originalName: f.originalName || 'file',
            fileType: f.fileType,
          })
        }
        return { success: true, data: results }
      }
      default:
        return { success: false, error: `Unknown method: ${msg.method}` }
    }
  } catch (err) {
    await workerLog(`RPC 内部错误: ${(err as Error).message}`)
    return { success: false, error: (err as Error).message }
  }
}

function scheduleReconnect() {
  if (shuttingDown) return
  const delay = nextBackoffMs(reconnectAttempt)
  reconnectAttempt++
  workerLog(`已断开，${delay / 1000} 秒后准备重连（第 ${reconnectAttempt} 次）`)
  setTimeout(connect, delay)
}

function connect() {
  if (shuttingDown) return
  if (wsInstance) {
    intentionalClose = true
    try { wsInstance.removeAllListeners(); wsInstance.close() } catch { /* */ }
    wsInstance = null
    intentionalClose = false
  }
  const ws = new WebSocket(wsUrlWithToken())
  wsInstance = ws

  ws.on('open', () => {
    reconnectAttempt = 0
    workerLog('已连接服务端')
    ws.send(JSON.stringify({
      type: 'register',
      workerId: WORKER_ID,
      workerName: WORKER_NAME,
      version: VERSION,
      token: WORKER_WS_TOKEN,
      localBaseInfo: {
        fileBase: FILE_BASE_DIR,
        serverWsUrl: SERVER_WS_URL,
      },
    }))
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', workerId: WORKER_ID }))
      }
    }, 30000)
  })

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as RpcMessage
      if (msg.type !== 'rpc') return
      const result = await handleRpc(msg)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'rpc_result', id: msg.id, success: result.success, data: result.data, error: result.error, code: result.code }))
      }
    } catch (err) {
      workerLog(`RPC 消息处理失败: ${(err as Error).message}`)
    }
  })

  ws.on('close', (code, reason) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    wsInstance = null
    if (intentionalClose || shuttingDown) return
    const reasonText = String(reason || '')
    void workerLog(`连接关闭 code=${code ?? 'none'} reason=${reasonText || '(empty)'}`).then(() => {
      if (code === 4002 || reasonText.includes('replaced by new connection')) {
        exitWorker(
          0,
          '已有另一个 Worker 窗口连上云端，本窗口自动退出。请只保留标题为「项目资金支出记录系统 - 本地Worker」的一个窗口。',
        )
        return
      }
      if (code === 4001) {
        exitWorker(1, 'Worker Token 无效，请运行 sync-worker-env 或一键修复后再启动。')
        return
      }
      if (code === 4003) {
        exitWorker(0, '连接已被服务端关闭（重复 Worker），本窗口退出。')
        return
      }
      scheduleReconnect()
    })
    return
  })

  ws.on('error', (err) => {
    workerLog(`WebSocket 错误: ${err.message}`)
  })
}

async function main() {
  await ensureBaseDirs()
  await workerLog(`======== ${WORKER_WINDOW_TITLE} 启动 ========`)
  await workerLog(`cwd: ${process.cwd()}`)
  await workerLog(`workerDir: ${WORKER_DIR}`)
  await workerLog(`envFile: ${getWorkerEnvPath() || '(none)'}`)
  await workerLog(`SERVER_WS_URL: ${SERVER_WS_URL}`)
  await workerLog(`WORKER_ID: ${WORKER_ID}`)
  await workerLog(`FILE_BASE_DIR: ${FILE_BASE_DIR || '(default)'}`)
  await workerLog(`WORKER_WS_TOKEN: ${maskToken(WORKER_WS_TOKEN)}`)
  if (/localhost|127\.0\.0\.1/i.test(SERVER_WS_URL) && SERVER_WS_URL !== PRODUCTION_WS) {
    await workerLog('警告: SERVER_WS_URL 指向 localhost，不会连接阿里云')
  }
  connect()
}

main().catch(async (err) => {
  await workerLog(`Worker 启动失败: ${(err as Error).message}`)
  process.exit(1)
})
