import fs from 'fs/promises'
import path from 'path'

const BACKUP_ROOT = path.resolve(process.env.BACKUP_ROOT_DIR || 'D:/jewelry-account-backups')
const DEFAULT_KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30)

type BackupSession = {
  partPath: string
  destPath: string
  dirPath: string
  totalChunks: number
  received: Set<number>
}

const sessions = new Map<string, BackupSession>()

export function getBackupRootDir() {
  return BACKUP_ROOT
}

function assertSafeRelativeDir(relativeDir: string): string {
  const normalized = relativeDir.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('PATH_TRAVERSAL')
  }
  return normalized
}

function assertSafeFileName(fileName: string): string {
  const base = path.basename(fileName)
  if (!base || base !== fileName || base.includes('..')) {
    throw new Error('PATH_TRAVERSAL')
  }
  return base
}

export async function ensureBackupRoot() {
  await fs.mkdir(BACKUP_ROOT, { recursive: true })
}

export async function initBackupSession(input: {
  sessionId: string
  relativeDir: string
  fileName: string
  totalChunks: number
}) {
  await ensureBackupRoot()
  const relativeDir = assertSafeRelativeDir(input.relativeDir)
  const fileName = assertSafeFileName(input.fileName)
  const dirPath = path.join(BACKUP_ROOT, relativeDir)
  await fs.mkdir(dirPath, { recursive: true })
  const destPath = path.join(dirPath, fileName)
  const partPath = `${destPath}.part`
  await fs.rm(partPath, { force: true })
  sessions.set(input.sessionId, {
    partPath,
    destPath,
    dirPath,
    totalChunks: Math.max(1, input.totalChunks),
    received: new Set(),
  })
  return { backupRoot: BACKUP_ROOT, destPath, dirPath }
}

export async function writeBackupChunk(input: {
  sessionId: string
  index: number
  base64: string
}) {
  const session = sessions.get(input.sessionId)
  if (!session) throw new Error('BACKUP_SESSION_NOT_FOUND')
  if (input.index < 0 || input.index >= session.totalChunks) {
    throw new Error('BACKUP_CHUNK_INDEX_OUT_OF_RANGE')
  }
  const buffer = Buffer.from(input.base64, 'base64')
  if (input.index === 0) await fs.writeFile(session.partPath, buffer)
  else await fs.appendFile(session.partPath, buffer)
  session.received.add(input.index)
  return {
    index: input.index,
    receivedChunks: session.received.size,
    totalChunks: session.totalChunks,
  }
}

async function pruneOldBackups(keepDays = DEFAULT_KEEP_DAYS) {
  const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true }).catch(() => [])
  const cutoff = Date.now() - keepDays * 86400000
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = path.join(BACKUP_ROOT, entry.name)
    const st = await fs.stat(full).catch(() => null)
    if (st && st.mtimeMs < cutoff) {
      await fs.rm(full, { recursive: true, force: true })
    }
  }
}

export async function finalizeBackupSession(input: {
  sessionId: string
  manifest: Record<string, unknown>
}) {
  const session = sessions.get(input.sessionId)
  if (!session) throw new Error('BACKUP_SESSION_NOT_FOUND')
  if (session.received.size !== session.totalChunks) {
    throw new Error(`BACKUP_INCOMPLETE:${session.received.size}/${session.totalChunks}`)
  }
  await fs.rm(session.destPath, { force: true })
  await fs.rename(session.partPath, session.destPath)
  const manifestPath = path.join(session.dirPath, 'backup-manifest.json')
  const manifest = {
    ...input.manifest,
    destination: session.dirPath,
    backupRoot: BACKUP_ROOT,
    fileName: path.basename(session.destPath),
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  sessions.delete(input.sessionId)
  await pruneOldBackups()
  const st = await fs.stat(session.destPath)
  return {
    backupRoot: BACKUP_ROOT,
    destination: session.dirPath,
    databasePath: session.destPath,
    manifestPath,
    fileSizeBytes: st.size,
  }
}
