import { workerHub } from '../websocket/worker-hub'
import { getScannerSettings } from './scanner-config.service'
import { prisma } from '../lib/prisma'

export type WorkerOfflineReason =
  | 'OK'
  | 'WORKER_NOT_CONNECTED'
  | 'WORKER_TOKEN_INVALID'
  | 'WORKER_WS_PATH_WRONG'
  | 'WORKER_HEARTBEAT_TIMEOUT'
  | 'LOCAL_WORKER_DISABLED'
  | 'SCANNER_API_UNAVAILABLE'

export async function getWorkerStatusDetail() {
  const scannerSettings = await getScannerSettings()
  const hubDetail = workerHub.getConnectionDetail()
  const conn = hubDetail.socketOpen && hubDetail.workerId
    ? await prisma.localWorkerConnection.findUnique({ where: { workerId: hubDetail.workerId } })
    : null

  const serverNow = new Date()
  const lastSeenAt = hubDetail.socketOpen
    ? (hubDetail.lastHeartbeatAt || conn?.lastSeenAt || null)
    : null
  const secondsSinceLastSeen = lastSeenAt
    ? Math.floor((serverNow.getTime() - lastSeenAt.getTime()) / 1000)
    : null

  let online = hubDetail.socketOpen
  let reason: WorkerOfflineReason = 'OK'

  const wsUrl = hubDetail.lastRegisteredWsUrl || ''
  const wrongLocalhost = /localhost|127\.0\.0\.1/i.test(wsUrl)

  if (!scannerSettings.localWorkerEnabled) {
    online = false
    reason = 'LOCAL_WORKER_DISABLED'
  } else if (!hubDetail.socketOpen) {
    if (hubDetail.lastRejectReason === 'Unauthorized worker token') {
      reason = 'WORKER_TOKEN_INVALID'
    } else if (wrongLocalhost) {
      reason = 'WORKER_WS_PATH_WRONG'
    } else if (secondsSinceLastSeen !== null && secondsSinceLastSeen > 90) {
      reason = 'WORKER_HEARTBEAT_TIMEOUT'
    } else {
      reason = 'WORKER_NOT_CONNECTED'
    }
  } else if (hubDetail.scannerAvailable === false) {
    online = true
    reason = 'SCANNER_API_UNAVAILABLE'
  }

  const message = workerReasonMessage(reason, online)

  return {
    online,
    reason,
    message,
    workerId: hubDetail.socketOpen ? hubDetail.workerId : null,
    workerName: hubDetail.socketOpen ? hubDetail.workerName : null,
    lastSeenAt: lastSeenAt?.toISOString() || null,
    lastHeartbeatAt: hubDetail.lastHeartbeatAt?.toISOString() || null,
    connectedAt: hubDetail.connectedAt?.toISOString() || null,
    serverNow: serverNow.toISOString(),
    secondsSinceLastSeen,
    localWorkerEnabled: scannerSettings.localWorkerEnabled,
    scannerApiBaseUrl: scannerSettings.scannerApiBaseUrl,
    scannerAvailable: hubDetail.scannerAvailable,
    socketOpen: hubDetail.socketOpen,
  }
}

export function workerReasonMessage(reason: WorkerOfflineReason, online: boolean): string {
  if (online && reason === 'SCANNER_API_UNAVAILABLE') {
    return '本地助手在线，但扫码枪接口没开。'
  }
  if (online) return '公司电脑已连接，扫码枪和图片可正常使用。'
  switch (reason) {
    case 'LOCAL_WORKER_DISABLED':
      return '后台已关闭本地助手，请在设置中启用。'
    case 'WORKER_TOKEN_INVALID':
      return '本地助手 token 不一致，请在公司电脑运行「一键修复本地Worker连接」。'
    case 'WORKER_HEARTBEAT_TIMEOUT':
      return '公司电脑开着，但本地助手心跳超时，请运行「一键修复本地Worker连接」。'
    case 'WORKER_WS_PATH_WRONG':
      return '本地助手连错地址了，当前可能连到了 localhost。'
    case 'SCANNER_API_UNAVAILABLE':
      return '本地助手在线，但扫码枪接口没开。'
    default:
      return '公司电脑开着，但本地助手没有连上。请在公司电脑运行「一键修复本地Worker连接」。'
  }
}
