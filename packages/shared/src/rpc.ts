export type RpcMessage = {
  type: 'rpc'
  id: string
  method: string
  params: Record<string, unknown>
}

export type RpcResultMessage = {
  type: 'rpc_result'
  id: string
  success: boolean
  data?: unknown
  error?: string
  code?: string
}

export type WorkerRegisterMessage = {
  type: 'register'
  workerId: string
  workerName: string
  version: string
  localBaseInfo?: Record<string, unknown>
}

export type WorkerHeartbeatMessage = {
  type: 'heartbeat'
  workerId: string
}

export type WorkerMessage = RpcResultMessage | WorkerRegisterMessage | WorkerHeartbeatMessage

export const RPC_METHODS = {
  SCANNER_GET_BRACELET: 'scanner.getBraceletByCode',
  SCANNER_SEARCH_BRACELETS: 'scanner.searchBracelets',
  SCANNER_READ_IMAGE: 'scanner.readImage',
  FILE_SAVE_UPLOAD: 'file.saveUpload',
  FILE_READ: 'file.read',
  FILE_READ_THUMB: 'file.readThumb',
  FILE_EXISTS: 'file.exists',
  FILE_READ_MANY_FOR_EXPORT: 'file.readManyForExport',
  FILE_DELETE_LOCAL: 'file.deleteLocal',
} as const

export const ERROR_CODES = {
  LOCAL_WORKER_OFFLINE: 'LOCAL_WORKER_OFFLINE',
  SCANNER_NOT_FOUND: 'SCANNER_NOT_FOUND',
  SCANNER_API_UNAVAILABLE: 'SCANNER_API_UNAVAILABLE',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
} as const
