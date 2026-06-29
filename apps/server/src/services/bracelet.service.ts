import { ERROR_CODES } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { workerHub } from '../websocket/worker-hub'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { getScannerSettings } from './scanner-config.service'
import { getFileView } from './file.service'

const SCANNER_NOT_FOUND_MSG = '扫码枪系统未找到该镯子，请确认编号是否正确。'

export function presentBracelet(b: {
  id: number
  braceletCode: string
  certificateNo: string | null
  scannerProductId: string | null
  barcodeValue: string | null
  imageFileId: number | null
  sourceImagePath: string | null
  inboundAt: Date | null
  inboundCost: unknown
  scannerStatus: string | null
  sourceSyncedAt: Date | null
  createdAt: Date
  updatedAt: Date
}, extra?: { fromScanner?: boolean; notSynced?: boolean }) {
  return {
    id: b.id,
    braceletCode: b.braceletCode,
    certificateNo: b.certificateNo,
    scannerProductId: b.scannerProductId,
    barcodeValue: b.barcodeValue,
    imageFileId: b.imageFileId,
    hasImage: !!(b.sourceImagePath || b.imageFileId),
    inboundAt: b.inboundAt,
    inboundCost: b.inboundCost,
    scannerStatus: b.scannerStatus,
    sourceSyncedAt: b.sourceSyncedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    fromScanner: extra?.fromScanner || false,
    notSynced: extra?.notSynced || false,
  }
}

export async function findBraceletByExactCode(code: string) {
  const normalized = code.trim()
  if (!normalized) return null
  return prisma.bracelet.findFirst({
    where: {
      OR: [
        { braceletCode: normalized },
        { barcodeValue: normalized },
      ],
    },
  })
}

async function ensureWorkerAvailable(forImage = false) {
  const scannerSettings = await getScannerSettings()
  if (!scannerSettings.localWorkerEnabled) {
    const err = new Error(forImage ? '本地 Worker 未启用，暂时无法查看镯子图片。' : '本地 Worker 未启用，无法连接扫码枪系统')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }
  if (!workerHub.isOnline()) {
    const err = new Error(forImage ? '本地电脑未连接，暂时无法查看镯子图片。' : '本地电脑未连接，无法从扫码枪系统同步镯子')
    ;(err as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
    throw err
  }
  return scannerSettings
}

function buildBraceletData(data: {
  scannerProductId?: string
  braceletCode?: string
  certificateNo?: string
  imagePath?: string
  inboundAt?: string
  inboundCost?: number
  status?: string
}) {
  if (!data.braceletCode) throw new Error(SCANNER_NOT_FOUND_MSG)
  return {
    braceletCode: data.braceletCode,
    certificateNo: data.certificateNo || data.braceletCode,
    scannerProductId: data.scannerProductId || null,
    barcodeValue: data.braceletCode,
    sourceImagePath: data.imagePath || null,
    inboundAt: data.inboundAt ? new Date(data.inboundAt) : null,
    inboundCost: data.inboundCost || 0,
    scannerStatus: data.status || 'in_stock',
    localSnapshotJson: JSON.stringify({ ...data, imagePath: undefined }),
    sourceSyncedAt: new Date(),
  }
}

export async function getOrSyncBracelet(code: string, operator?: AuthRequest['user'], force = false) {
  const normalized = code.trim()
  if (!normalized) throw new Error('镯子编号不能为空')

  const existing = await findBraceletByExactCode(normalized)
  if (existing && !force) return presentBracelet(existing)

  await ensureWorkerAvailable()
  const data = await workerHub.getBraceletFromScanner(normalized) as {
    scannerProductId?: string
    braceletCode?: string
    certificateNo?: string
    imagePath?: string
    inboundAt?: string
    inboundCost?: number
    status?: string
  }

  if (!data?.braceletCode) {
    const err = new Error(SCANNER_NOT_FOUND_MSG)
    ;(err as Error & { code: string }).code = ERROR_CODES.SCANNER_NOT_FOUND
    throw err
  }

  const braceletData = buildBraceletData(data)
  const target = existing
    ? await prisma.bracelet.findUnique({ where: { id: existing.id } })
    : await prisma.bracelet.findUnique({ where: { braceletCode: braceletData.braceletCode } })

  const bracelet = target
    ? await prisma.bracelet.update({ where: { id: target.id }, data: braceletData })
    : await prisma.bracelet.create({ data: braceletData })

  if (operator) {
    await writeOperationLog({
      module: 'bracelet',
      action: force ? 'sync_bracelet' : 'auto_sync_bracelet',
      targetType: 'bracelet',
      targetId: bracelet.id,
      targetCode: bracelet.braceletCode,
      afterJson: presentBracelet(bracelet),
      operator,
    })
  }

  return presentBracelet(bracelet)
}

export async function searchBracelets(q: string) {
  const keyword = q.trim()

  const localItems = keyword
    ? await prisma.bracelet.findMany({
        where: {
          OR: [
            { braceletCode: keyword },
            { braceletCode: { contains: keyword } },
            { barcodeValue: { contains: keyword } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      })
    : await prisma.bracelet.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 })

  const map = new Map<string, ReturnType<typeof presentBracelet>>()
  for (const item of localItems) {
    map.set(item.braceletCode.toUpperCase(), presentBracelet(item))
  }

  if (keyword) {
    try {
      const scannerSettings = await getScannerSettings()
      if (scannerSettings.localWorkerEnabled && workerHub.isOnline()) {
        const scannerItems = await workerHub.searchBraceletsFromScanner(keyword) as Array<{
          braceletCode?: string
          certificateNo?: string
          scannerProductId?: string
          inboundCost?: number
          status?: string
          inboundAt?: string
          imagePath?: string
        }>
        for (const item of scannerItems) {
          if (!item.braceletCode) continue
          const key = item.braceletCode.toUpperCase()
          if (map.has(key)) continue
          map.set(key, presentBracelet({
            id: 0,
            braceletCode: item.braceletCode,
            certificateNo: item.certificateNo || item.braceletCode,
            scannerProductId: item.scannerProductId || null,
            barcodeValue: item.braceletCode,
            imageFileId: null,
            sourceImagePath: item.imagePath || null,
            inboundAt: item.inboundAt ? new Date(item.inboundAt) : null,
            inboundCost: item.inboundCost || 0,
            scannerStatus: item.status || 'in_stock',
            sourceSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { fromScanner: true, notSynced: true }))
        }
      }
    } catch {
      // Worker 离线时仅返回本地结果
    }
  }

  return Array.from(map.values()).slice(0, 50)
}

export async function getBraceletDetail(id: number) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id } })
  if (!bracelet) return null
  const expenses = await prisma.expense.findMany({
    where: { braceletId: id, isVoided: false },
    orderBy: { occurredAt: 'desc' },
  })
  const sales = await prisma.sale.findMany({
    where: { braceletId: id },
    orderBy: { soldAt: 'desc' },
  })
  const costAdjustments = await prisma.costAdjustment.findMany({
    where: { braceletId: id },
    orderBy: { createdAt: 'desc' },
  })
  return {
    bracelet: presentBracelet(bracelet),
    expenses,
    sales,
    costAdjustments,
  }
}

export async function getBraceletImage(id: number) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id } })
  if (!bracelet) throw new Error('镯子不存在')

  if (bracelet.imageFileId) {
    return getFileView(bracelet.imageFileId, false)
  }

  if (!bracelet.sourceImagePath) {
    throw new Error('该镯子暂无图片')
  }

  await ensureWorkerAvailable(true)
  const data = await workerHub.readScannerImage(bracelet.sourceImagePath) as {
    buffer: string
    mimeType: string
  }

  return {
    buffer: Buffer.from(data.buffer, 'base64'),
    mimeType: data.mimeType || 'image/jpeg',
    originalName: `${bracelet.braceletCode}.jpg`,
  }
}

export { SCANNER_NOT_FOUND_MSG }
