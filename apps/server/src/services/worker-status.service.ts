import { workerHub } from '../websocket/worker-hub'
import { getScannerSettings } from './scanner-config.service'
import { RPC_METHODS } from '@jade-account/shared'

export type WorkerOfflineReason =
  | 'OK'
  | 'WORKER_NOT_CONNECTED'
  | 'WORKER_TOKEN_INVALID'
  | 'WORKER_WS_PATH_WRONG'
  | 'WORKER_HEARTBEAT_TIMEOUT'
  | 'LOCAL_WORKER_DISABLED'
  | 'SCANNER_API_UNAVAILABLE'
  | 'UPLOAD_CHANNEL_TIMEOUT'
  | 'UPLOAD_CHANNEL_FAILED'

let lastUploadProbeAt: Date | null = null
let lastUploadProbeOk = false
let lastScanProbeAt: Date | null = null
let lastScanProbeOk = false

export async function probeUploadChannel(timeoutMs = 3000) {
  const now = new Date()
  if (!workerHub.isOnline()) {
    lastUploadProbeAt = now
    lastUploadProbeOk = false
    return { ok: false, reason: 'WORKER_NOT_CONNECTED' as const }
  }
  try {
    await workerHub.callRpc(RPC_METHODS.WORKER_UPLOAD_PROBE, {}, timeoutMs)
    lastUploadProbeAt = now
    lastUploadProbeOk = true
    return { ok: true, reason: 'OK' as const }
  } catch (err) {
    lastUploadProbeAt = now
    lastUploadProbeOk = false
    const msg = (err as Error).message || ''
    if (/超时|timeout/i.test(msg)) {
      return { ok: false, reason: 'UPLOAD_CHANNEL_TIMEOUT' as const }
    }
    return { ok: false, reason: 'UPLOAD_CHANNEL_FAILED' as const }
  }
}

export async function probeScanChannel(timeoutMs = 3000) {
  const now = new Date()
  if (!workerHub.isOnline()) {
    lastScanProbeAt = now
    lastScanProbeOk = false
    return { ok: false }
  }
  try {
    const result = await workerHub.callRpc<{ ok?: boolean }>(RPC_METHODS.WORKER_SCAN_PROBE, {}, timeoutMs)
    lastScanProbeAt = now
    lastScanProbeOk = !!result?.ok
    return { ok: lastScanProbeOk }
  } catch {
    lastScanProbeAt = now
    lastScanProbeOk = false
    return { ok: false }
  }
}

export async function getWorkerStatusDetail(options?: { probeUpload?: boolean; probeScan?: boolean }) {
  const scannerSettings = await getScannerSettings()
  const hubDetail = workerHub.getConnectionDetail()
  const serverNow = new Date()

  const socketOpen = hubDetail.socketOpen
  const workerOnline = socketOpen

  if (options?.probeUpload) {
    await probeUploadChannel(3000)
  }

  const heartbeatFresh = Boolean(
    hubDetail.lastHeartbeatAt
    && serverNow.getTime() - hubDetail.lastHeartbeatAt.getTime() < 90_000,
  )
  const probeFresh = Boolean(
    lastUploadProbeOk
    && lastUploadProbeAt
    && serverNow.getTime() - lastUploadProbeAt.getTime() < 120_000,
  )
  const probeFailedRecently = Boolean(
    lastUploadProbeAt
    && !lastUploadProbeOk
    && serverNow.getTime() - lastUploadProbeAt.getTime() < 60_000,
  )
  // WebSocket 心跳正常即视为上传通道可用；仅近期 probe 明确失败时才降级
  const uploadChannelReady = Boolean(
    socketOpen && !probeFailedRecently && (probeFresh || heartbeatFresh),
  )

  let reason: WorkerOfflineReason = 'OK'
  if (!scannerSettings.localWorkerEnabled) {
    reason = 'LOCAL_WORKER_DISABLED'
  } else if (!socketOpen) {
    if (hubDetail.lastRejectReason === 'Unauthorized worker token') reason = 'WORKER_TOKEN_INVALID'
    else if (/localhost|127\.0\.0\.1/i.test(hubDetail.lastRegisteredWsUrl || '')) reason = 'WORKER_WS_PATH_WRONG'
    else reason = 'WORKER_NOT_CONNECTED'
  } else if (!uploadChannelReady && lastUploadProbeAt) {
    reason = lastUploadProbeOk ? 'OK' : (lastUploadProbeAt ? 'UPLOAD_CHANNEL_TIMEOUT' : 'UPLOAD_CHANNEL_FAILED')
  }

  const message = buildStatusMessage({
    socketOpen,
    uploadChannelReady,
    localWorkerEnabled: scannerSettings.localWorkerEnabled,
    reason,
  })

  const online = workerOnline && uploadChannelReady && reason !== 'LOCAL_WORKER_DISABLED'

  return {
    online,
    workerOnline,
    socketOpen,
    uploadChannelReady,
    scanChannelReady: false,
    reason,
    message,
    workerId: socketOpen ? hubDetail.workerId : null,
    workerName: socketOpen ? hubDetail.workerName : null,
    lastSeenAt: hubDetail.lastHeartbeatAt?.toISOString() || null,
    lastHeartbeatAt: hubDetail.lastHeartbeatAt?.toISOString() || null,
    connectedAt: hubDetail.connectedAt?.toISOString() || null,
    lastUploadProbeAt: lastUploadProbeAt?.toISOString() || null,
    lastUploadProbeOk,
    lastScanProbeAt: null,
    serverNow: serverNow.toISOString(),
    secondsSinceLastSeen: hubDetail.lastHeartbeatAt
      ? Math.floor((serverNow.getTime() - hubDetail.lastHeartbeatAt.getTime()) / 1000)
      : null,
    localWorkerEnabled: scannerSettings.localWorkerEnabled,
    scannerApiBaseUrl: null,
    scannerAvailable: null,
  }
}

function buildStatusMessage(input: {
  socketOpen: boolean
  uploadChannelReady: boolean
  localWorkerEnabled: boolean
  reason: WorkerOfflineReason
}) {
  if (!input.localWorkerEnabled) {
    return '后台已关闭本地助手，请在设置中启用。'
  }
  if (!input.socketOpen) {
    return '公司电脑本地 Worker 未连接，图片暂无法上传。你仍可以先手动记账。'
  }
  if (!input.uploadChannelReady) {
    if (input.reason === 'UPLOAD_CHANNEL_TIMEOUT') {
      return '公司电脑已连接，但图片上传通道超时，请重启「项目资金支出记录系统 - 本地Worker」窗口。'
    }
    return '公司电脑已连接，但图片上传通道不可用，请重启本地 Worker。'
  }
  return '公司电脑已连接，图片可正常上传。'
}

export function workerReasonMessage(reason: WorkerOfflineReason, online: boolean): string {
  return buildStatusMessage({
    socketOpen: online,
    uploadChannelReady: online,
    localWorkerEnabled: reason !== 'LOCAL_WORKER_DISABLED',
    reason,
  })
}
