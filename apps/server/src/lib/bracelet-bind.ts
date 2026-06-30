import { ERROR_CODES } from '@jade-account/shared'
import { prisma } from './prisma'
import { AuthRequest } from '../middleware/auth'
import { getOrSyncBracelet } from '../services/bracelet.service'

export async function resolveBraceletBinding(
  code?: string,
  braceletId?: number,
  operator?: AuthRequest['user'],
): Promise<{ braceletId: number | null; braceletCode: string | null }> {
  if (braceletId) {
    const b = await prisma.bracelet.findUnique({ where: { id: braceletId } })
    if (!b) throw new Error('镯子不存在')
    return { braceletId: b.id, braceletCode: b.braceletCode }
  }

  const trimmed = code?.trim()
  if (!trimmed) return { braceletId: null, braceletCode: null }

  const local = await prisma.bracelet.findUnique({ where: { braceletCode: trimmed } })
  if (local) return { braceletId: local.id, braceletCode: local.braceletCode }

  try {
    const synced = await getOrSyncBracelet(trimmed, operator)
    return { braceletId: synced.id, braceletCode: synced.braceletCode }
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === ERROR_CODES.SCANNER_NOT_FOUND) {
      const msg = new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
      ;(msg as Error & { code: string }).code = ERROR_CODES.SCANNER_NOT_FOUND
      throw msg
    }
    if (e.code === ERROR_CODES.LOCAL_WORKER_OFFLINE) {
      const msg = new Error('本地电脑没连上，暂时查不到扫码枪里的镯子')
      ;(msg as Error & { code: string }).code = ERROR_CODES.LOCAL_WORKER_OFFLINE
      throw msg
    }
    throw err
  }
}
