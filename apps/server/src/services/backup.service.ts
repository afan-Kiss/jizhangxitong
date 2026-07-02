import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { ERROR_CODES } from '@jade-account/shared'
import { config } from '../lib/config'
import { prisma } from '../lib/prisma'
import { workerHub } from '../websocket/worker-hub'
import { AuthRequest } from '../middleware/auth'

const CHUNK_SIZE_BYTES = 512 * 1024
const BACKUP_RPC_TIMEOUT_MS = Math.max(config.workerRpcTimeoutMs, 120000)

export function resolveSqliteDatabasePath(): string {
  const url = (config.databaseUrl || '').trim().replace(/^["']|["']$/g, '')
  if (!url.startsWith('file:')) {
    throw new Error('当前仅支持 SQLite 数据库备份')
  }
  const rel = url.replace(/^file:/, '')
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel)
}

function localDateTag(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function pullProductionDatabaseToWorker(operator?: AuthRequest['user']) {
  if (!workerHub.isOnline()) {
    const err = new Error('本地 Worker 未连接，请先在公司电脑打开「本地Worker」窗口')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }

  const dbPath = resolveSqliteDatabasePath()
  await fs.access(dbPath)

  await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
  const buffer = await fs.readFile(dbPath)
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

  const [expenseCount, saleCount, userCount] = await Promise.all([
    prisma.expense.count({ where: { isVoided: false, isTrialRun: false } }),
    prisma.sale.count(),
    prisma.user.count({ where: { isActive: true } }),
  ])

  const totalChunks = Math.max(1, Math.ceil(buffer.length / CHUNK_SIZE_BYTES))
  const sessionId = uuidv4()
  const relativeDir = `${localDateTag()}-prod`
  const fileName = 'accounting.db'

  await workerHub.initBackupSession(
    {
      sessionId,
      relativeDir,
      fileName,
      totalChunks,
      totalBytes: buffer.length,
    },
    BACKUP_RPC_TIMEOUT_MS,
  )

  for (let index = 0; index < totalChunks; index++) {
    const chunk = buffer.subarray(index * CHUNK_SIZE_BYTES, (index + 1) * CHUNK_SIZE_BYTES)
    await workerHub.writeBackupChunk(
      {
        sessionId,
        index,
        base64: chunk.toString('base64'),
      },
      BACKUP_RPC_TIMEOUT_MS,
    )
  }

  const manifest = {
    backupTime: new Date().toISOString(),
    source: 'production',
    appVersion: process.env.APP_VERSION || '',
    serverDatabasePath: dbPath,
    fileName,
    fileSizeBytes: buffer.length,
    sha256,
    expenseCount,
    saleCount,
    userCount,
    operatorId: operator?.userId ?? null,
    operatorName: operator?.username ?? null,
  }

  const result = (await workerHub.finalizeBackupSession(
    { sessionId, manifest },
    BACKUP_RPC_TIMEOUT_MS,
  )) as {
    backupRoot?: string
    destination?: string
    databasePath?: string
    manifestPath?: string
    fileSizeBytes?: number
  }

  return {
    ...result,
    manifest,
    expenseCount,
    saleCount,
    userCount,
  }
}
