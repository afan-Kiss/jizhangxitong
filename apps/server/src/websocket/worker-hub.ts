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

const HEARTBEAT_TIMEOUT_MS = 90000

class WorkerHub {
  private wss: WebSocketServer | null = null
  private workerSocket: WebSocket | null = null
  private workerId: string | null = null
  private workerName: string | null = null
  private connectedAt: Date | null = null
  private lastHeartbeatAt: Date | null = null
  private scannerAvailable: boolean | null = null
  private lastRejectReason: string | null = null
  private lastRegisteredWsUrl: string | null = null
  private pending: Map<string, PendingRpc> = new Map()
  private heartbeatCheckTimer: ReturnType<typeof setInterval> | null = null

  init(server: import('http').Server) {
    this.wss = new WebSocketServer({ server, path: '/ws/worker' })
    this.wss.on('connection', (socket, req) => this.handleConnection(socket, req))
    this.heartbeatCheckTimer = setInterval(() => this.checkHeartbeatTimeout(), 30000)
  }

  getConnectionDetail() {
    return {
      socketOpen: this.isOnline(),
      workerId: this.workerId,
      workerName: this.workerName,
      connectedAt: this.connectedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      scannerAvailable: this.scannerAvailable,
      lastRejectReason: this.lastRejectReason,
      lastRegisteredWsUrl: this.lastRegisteredWsUrl,
    }
  }

  private checkHeartbeatTimeout() {
    if (!this.workerSocket || this.workerSocket.readyState !== WebSocket.OPEN) return
    const last = this.lastHeartbeatAt || this.connectedAt
    if (last && Date.now() - last.getTime() > HEARTBEAT_TIMEOUT_MS) {
      console.warn('[WorkerHub] 心跳超时，关闭旧连接')
      this.workerSocket.close(4000, 'heartbeat timeout')
    }
  }

  private rejectAllPending(reason: string) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      const err = new Error(reason)
      ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
      pending.reject(err)
    }
    this.pending.clear()
  }

  private closeExistingSocket(reason: string) {
    if (!this.workerSocket) return
    const old = this.workerSocket
    this.workerSocket = null
    try {
      old.close(4002, reason)
    } catch {
      /* ignore */
    }
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage) {
    const { query } = parse(req.url || '', true)
    if (config.isProd || config.workerWsToken) {
      const token = String(query.token || '')
      if (!config.workerWsToken || token !== config.workerWsToken) {
        this.lastRejectReason = 'Unauthorized worker token'
        console.warn('[WorkerHub] Unauthorized worker token')
        socket.close(4001, 'Unauthorized worker token')
        return
      }
    }
    this.lastRejectReason = null

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as WorkerMessage & { scannerAvailable?: boolean }
        if (msg.type === 'register') {
          if (this.workerSocket && this.workerSocket !== socket) {
            this.closeExistingSocket('replaced by new connection')
          }
          this.workerSocket = socket
          this.workerId = msg.workerId
          this.workerName = msg.workerName
          this.connectedAt = new Date()
          this.lastHeartbeatAt = this.connectedAt
          const baseInfo = msg.localBaseInfo as Record<string, unknown> | undefined
          this.lastRegisteredWsUrl = typeof baseInfo?.serverWsUrl === 'string' ? baseInfo.serverWsUrl : null
          await prisma.localWorkerConnection.updateMany({
            where: { workerId: { not: msg.workerId } },
            data: { status: 'offline' },
          })
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
          if (this.workerId && msg.workerId !== this.workerId) {
            socket.close(4003, 'stale worker heartbeat')
            return
          }
          this.lastHeartbeatAt = new Date()
          if (typeof msg.scannerAvailable === 'boolean') {
            this.scannerAvailable = msg.scannerAvailable
          }
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
        this.rejectAllPending('本地 Worker 已断开')
        this.workerSocket = null
        const wid = this.workerId
        if (wid) {
          await prisma.localWorkerConnection.updateMany({
            where: { workerId: wid },
            data: { status: 'offline' },
          })
        }
        this.workerId = null
        this.workerName = null
        this.connectedAt = null
        this.lastHeartbeatAt = null
        this.scannerAvailable = null
      }
    })
  }

  isOnline(): boolean {
    return this.workerSocket !== null && this.workerSocket.readyState === WebSocket.OPEN
  }

  async getStatus() {
    const { getWorkerStatusDetail } = await import('../services/worker-status.service')
    return getWorkerStatusDetail()
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
    if (!this.workerSocket || this.workerSocket.readyState !== WebSocket.OPEN) {
      const err = new Error('本地电脑未连接，暂时无法读取本地扫码枪或图片')
      ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
      throw err
    }
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
      try {
        this.workerSocket!.send(JSON.stringify(message))
      } catch {
        this.pending.delete(id)
        clearTimeout(timer)
        const err = new Error('本地电脑未连接，暂时无法读取本地扫码枪或图片')
        ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
        reject(err)
      }
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
