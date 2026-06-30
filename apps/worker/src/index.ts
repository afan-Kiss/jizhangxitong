import WebSocket from 'ws'
import { RPC_METHODS, RpcMessage } from '@jade-account/shared'
import { ensureBaseDirs, fileExists, readFileByPath, saveUpload, deleteLocalFile, assertPathAllowed } from './file-store'
import { getBraceletByCode, readImageByPath, SCANNER_NOT_FOUND_MSG, searchBraceletsFromScanner, checkScannerHealth } from './scanner-client'
import { workerLog, nextBackoffMs } from './logger'
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
const WORKER_NAME = process.env.WORKER_NAME || '本地记账Worker'
const SCANNER_API_URL = process.env.SCANNER_API_URL || 'http://127.0.0.1:7789'
const FILE_BASE_DIR = process.env.FILE_BASE_DIR || ''
const VERSION = '1.0.0'

let reconnectAttempt = 0
let wsInstance: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function wsUrlWithToken() {
  const url = new URL(SERVER_WS_URL)
  if (WORKER_WS_TOKEN) url.searchParams.set('token', WORKER_WS_TOKEN)
  return url.toString()
}

async function handleRpc(msg: RpcMessage) {
  try {
    switch (msg.method) {
      case RPC_METHODS.SCANNER_GET_BRACELET: {
        const code = String(msg.params.braceletCode || '')
        const baseUrl = String(msg.params.scannerApiBaseUrl || SCANNER_API_URL)
        const timeoutMs = Number(msg.params.timeoutMs || 8000)
        try {
          const data = await getBraceletByCode(code, baseUrl, timeoutMs)
          if (!data) {
            await workerLog(`扫码枪未找到镯子: ${code}`)
            return { success: false, error: SCANNER_NOT_FOUND_MSG, code: 'SCANNER_NOT_FOUND' }
          }
          await workerLog(`扫码枪查询成功: ${code}`)
          return { success: true, data }
        } catch (err) {
          const code = (err as Error & { code?: string }).code
          await workerLog(`扫码枪查询失败: ${code || ''} ${(err as Error).message}`)
          return { success: false, error: (err as Error).message, code: code || 'SCANNER_API_UNAVAILABLE' }
        }
      }
      case RPC_METHODS.SCANNER_SEARCH_BRACELETS: {
        const keyword = String(msg.params.keyword || '')
        const baseUrl = String(msg.params.scannerApiBaseUrl || SCANNER_API_URL)
        const timeoutMs = Number(msg.params.timeoutMs || 8000)
        try {
          const data = await searchBraceletsFromScanner(keyword, baseUrl, timeoutMs)
          await workerLog(`扫码枪搜索 "${keyword}" → ${data.length} 条`)
          return { success: true, data }
        } catch (err) {
          return { success: false, error: (err as Error).message, code: (err as Error & { code?: string }).code }
        }
      }
      case RPC_METHODS.SCANNER_READ_IMAGE: {
        const imagePath = String(msg.params.imagePath || '')
        if (!imagePath) return { success: false, error: '图片路径为空', code: 'FILE_NOT_FOUND' }
        try {
          const { buffer, mimeType } = await readImageByPath(imagePath)
          return { success: true, data: { buffer: buffer.toString('base64'), mimeType } }
        } catch (err) {
          return { success: false, error: (err as Error).message, code: (err as Error & { code?: string }).code || 'FILE_NOT_FOUND' }
        }
      }
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
      case RPC_METHODS.WORKER_SCAN_PROBE: {
        const ok = await checkScannerHealth(SCANNER_API_URL, Number(msg.params.timeoutMs || 3000))
        return { success: true, data: { ok } }
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
  const delay = nextBackoffMs(reconnectAttempt)
  reconnectAttempt++
  workerLog(`已断开，${delay / 1000} 秒后准备重连（第 ${reconnectAttempt} 次）`)
  setTimeout(connect, delay)
}

function connect() {
  if (wsInstance) {
    try { wsInstance.removeAllListeners(); wsInstance.close() } catch { /* */ }
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
        scannerApiUrl: SCANNER_API_URL,
      },
    }))
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(async () => {
      if (ws.readyState === WebSocket.OPEN) {
        const scannerAvailable = await checkScannerHealth(SCANNER_API_URL)
        ws.send(JSON.stringify({ type: 'heartbeat', workerId: WORKER_ID, scannerAvailable }))
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

  ws.on('close', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    scheduleReconnect()
  })

  ws.on('error', (err) => {
    workerLog(`WebSocket 错误: ${err.message}`)
  })
}

async function main() {
  await ensureBaseDirs()
  await workerLog('======== Worker 启动 ========')
  await workerLog(`cwd: ${process.cwd()}`)
  await workerLog(`workerDir: ${WORKER_DIR}`)
  await workerLog(`envFile: ${getWorkerEnvPath() || '(none)'}`)
  await workerLog(`SERVER_WS_URL: ${SERVER_WS_URL}`)
  await workerLog(`WORKER_ID: ${WORKER_ID}`)
  await workerLog(`FILE_BASE_DIR: ${FILE_BASE_DIR || '(default)'}`)
  await workerLog(`SCANNER_API_URL: ${SCANNER_API_URL}`)
  await workerLog(`WORKER_WS_TOKEN: ${maskToken(WORKER_WS_TOKEN)}`)
  if (/localhost|127\.0\.0\.1/i.test(SERVER_WS_URL) && SERVER_WS_URL !== PRODUCTION_WS) {
    await workerLog('警告: SERVER_WS_URL 指向 localhost，不会连接阿里云')
  }
  await workerLog(`本地 Worker 启动: ${WORKER_NAME}`)
  connect()
}

main().catch(async (err) => {
  await workerLog(`Worker 启动失败: ${(err as Error).message}`)
  process.exit(1)
})
