import fs from 'fs/promises'
import path from 'path'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { workerHub } from '../websocket/worker-hub'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { ERROR_CODES } from '@jade-account/shared'

export async function ensureDirs() {
  await fs.mkdir(config.tempUploadDir, { recursive: true })
  await fs.mkdir(config.exportDir, { recursive: true })
}

export async function uploadAndRelay(
  file: Express.Multer.File,
  meta: {
    fileType: string
    relatedType?: string
    relatedId?: number
    uploadedBy: number
  },
  operator?: AuthRequest['user'],
) {
  if (!workerHub.isOnline()) {
    const err = new Error('本地电脑未连接，无法保存图片')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }

  const buffer = await fs.readFile(file.path)
  const base64 = buffer.toString('base64')

  const result = await workerHub.saveUpload({
    fileType: meta.fileType,
    originalName: file.originalname,
    mimeType: file.mimetype,
    base64,
  }) as {
    localPath: string
    thumbPath: string
    fileSize: number
    sha256: string
  }

  const record = await prisma.file.create({
    data: {
      relatedType: meta.relatedType,
      relatedId: meta.relatedId,
      fileType: meta.fileType,
      localPath: result.localPath,
      thumbPath: result.thumbPath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: result.fileSize,
      sha256: result.sha256,
      uploadedBy: meta.uploadedBy,
    },
  })

  await fs.unlink(file.path).catch(() => {})

  if (operator) {
    await writeOperationLog({
      module: 'file',
      action: 'upload_attachment',
      targetType: 'file',
      targetId: record.id,
      afterJson: { fileType: meta.fileType },
      operator,
    })
  }

  return record
}

export async function getFileView(fileId: number, useThumb = false) {
  const file = await prisma.file.findUnique({ where: { id: fileId } })
  if (!file) throw new Error('文件不存在')

  if (!workerHub.isOnline()) {
    const err = new Error('本地电脑未连接，图片暂时无法查看')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }

  const data = useThumb
    ? await workerHub.readThumb(fileId, file.thumbPath || file.localPath, file.localPath)
    : await workerHub.readFile(fileId, file.localPath, file.originalName || undefined, file.fileType)

  const parsed = data as { buffer: string; mimeType: string; originalName?: string }
  return {
    buffer: Buffer.from(parsed.buffer, 'base64'),
    mimeType: parsed.mimeType || file.mimeType || 'image/jpeg',
    originalName: parsed.originalName || file.originalName || 'file',
  }
}

export async function readFilesForExport(fileIds: number[]) {
  if (!workerHub.isOnline()) {
    const err = new Error('本地电脑未连接，无法读取支出图片，暂时不能导出带图片的报销表')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }
  const files = await prisma.file.findMany({ where: { id: { in: fileIds } } })
  const fileParams = files.map((f) => ({
    fileId: f.id,
    localPath: f.localPath,
    fileType: f.fileType,
    originalName: f.originalName || undefined,
  }))
  return workerHub.readManyForExport(fileParams) as Promise<Array<{
    fileId: number
    buffer: string
    mimeType: string
    originalName: string
    fileType: string
  }>>
}
