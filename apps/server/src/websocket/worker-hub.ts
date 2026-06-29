import { WebSocket, WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { IncomingMessage } from 'http'
import { parse } from 'url'
import { ERROR_CODES, RPC_METHODS, RpcMessage, WorkerMessage } from '@jade-account/shared'
import { config } from '../lib/config'
import { prisma } from '../lib/prisma'
import { getScannerSettings } from '../services/scanner-config.service'

type PendingRpc = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class WorkerHub {
  private wss: WebSocketServer | null = null
  private workerSocket: WebSocket | null = null
  private workerId: string | null = null
  private pending: Map<string, PendingRpc> = new Map()

  init(server: import('http').Server) {
    this.wss = new WebSocketServer({ server, path: '/ws/worker' })
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req))
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage) {
    const { query } = parse(req.url || '', true)
    if (config.isProd || config.workerWsToken) {
      const token = String(query.token || '')
      if (!config.workerWsToken || token !== config.workerWsToken) {
        socket.close(4001, 'Unauthorized worker token')
        return
      }
    }

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as WorkerMessage
        if (msg.type === 'register') {
          this.workerSocket = socket
          this.workerId = msg.workerId
          await prisma.localWorkerConnection.upsert({
            where: { workerId: msg.workerId },
            create: {
              workerId: msg.workerId,
              workerName: msg.workerName,
              status: 'online',
              lastSeenAt: new Date(),
              version: msg.version,
              localBaseInfo: msg.localBaseInfo ? JSON.stringify(msg.localBaseInfo) : null,
            },
            update: {
              workerName: msg.workerName,
              status: 'online',
              lastSeenAt: new Date(),
              version: msg.version,
              localBaseInfo: msg.localBaseInfo ? JSON.stringify(msg.localBaseInfo) : null,
            },
          })
          socket.send(JSON.stringify({ type: 'registered', success: true }))
          return
        }
        if (msg.type === 'heartbeat') {
          await prisma.localWorkerConnection.updateMany({
            where: { workerId: msg.workerId },
            data: { status: 'online', lastSeenAt: new Date() },
          })
          return
        }
        if (msg.type === 'rpc_result') {
          const pending = this.pending.get(msg.id)
          if (!pending) return
          clearTimeout(pending.timer)
          this.pending.delete(msg.id)
          if (msg.success) pending.resolve(msg.data)
          else {
            const err = new Error(msg.error || msg.code || 'RPC failed')
            if (msg.code) (err as Error & { code: string }).code = msg.code
            pending.reject(err)
          }
        }
      } catch (err) {
        console.error('Worker message error:', err)
      }
    })

    socket.on('close', async () => {
      if (this.workerSocket === socket) {
        this.workerSocket = null
        if (this.workerId) {
          await prisma.localWorkerConnection.updateMany({
            where: { workerId: this.workerId },
            data: { status: 'offline' },
          })
        }
        this.workerId = null
      }
    })
  }

  isOnline(): boolean {
    return this.workerSocket !== null && this.workerSocket.readyState === WebSocket.OPEN
  }

  async getStatus() {
    const conn = await prisma.localWorkerConnection.findFirst({
      orderBy: { lastSeenAt: 'desc' },
    })
    const scannerSettings = await getScannerSettings()
    return {
      online: this.isOnline(),
      lastSeenAt: conn?.lastSeenAt?.toISOString() || null,
      workerId: conn?.workerId || null,
      workerName: conn?.workerName || null,
      localWorkerEnabled: scannerSettings.localWorkerEnabled,
      scannerApiBaseUrl: scannerSettings.scannerApiBaseUrl,
    }
  }

  private async assertWorkerReady() {
    const scannerSettings = await getScannerSettings()
    if (!scannerSettings.localWorkerEnabled) {
      const err = new Error('本地 Worker 未启用，无法连接扫码枪系统')
      ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
      throw err
    }
    if (!this.isOnline()) {
      const err = new Error('本地电脑未连接，暂时无法读取本地扫码枪或图片')
      ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
      throw err
    }
    return scannerSettings
  }

  async callRpc<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    await this.assertWorkerReady()
    const scannerSettings = await getScannerSettings()
    const id = uuidv4()
    const message: RpcMessage = {
      type: 'rpc',
      id,
      method,
      params: {
        ...params,
        scannerApiBaseUrl: scannerSettings.scannerApiBaseUrl,
        timeoutMs: timeoutMs || scannerSettings.scannerSyncTimeoutMs,
      },
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('本地 Worker 响应超时'))
      }, timeoutMs || scannerSettings.scannerSyncTimeoutMs)
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
      this.workerSocket!.send(JSON.stringify(message))
    })
  }

  async getBraceletFromScanner(code: string) {
    return this.callRpc(RPC_METHODS.SCANNER_GET_BRACELET, { braceletCode: code })
  }

  async searchBraceletsFromScanner(keyword: string) {
    return this.callRpc(RPC_METHODS.SCANNER_SEARCH_BRACELETS, { keyword })
  }

  async readScannerImage(imagePath: string) {
    return this.callRpc(RPC_METHODS.SCANNER_READ_IMAGE, { imagePath })
  }

  async saveUpload(params: Record<string, unknown>) {
    return this.callRpc(RPC_METHODS.FILE_SAVE_UPLOAD, params)
  }

  async readFile(fileId: number, localPath: string, originalName?: string, fileType?: string) {
    return this.callRpc(RPC_METHODS.FILE_READ, { fileId, localPath, originalName, fileType })
  }

  async readThumb(fileId: number, thumbPath: string, localPath?: string) {
    return this.callRpc(RPC_METHODS.FILE_READ_THUMB, { fileId, thumbPath, localPath })
  }

  async readManyForExport(files: Array<{ fileId: number; localPath: string; fileType: string; originalName?: string }>) {
    return this.callRpc(RPC_METHODS.FILE_READ_MANY_FOR_EXPORT, { files })
  }

  async deleteLocalFile(localPath: string, thumbPath?: string) {
    return this.callRpc(RPC_METHODS.FILE_DELETE_LOCAL, { localPath, thumbPath: thumbPath || '' })
  }
}

export const workerHub = new WorkerHub()
