import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

export async function writeOperationLog(input: {
  module: string
  action: string
  targetType?: string
  targetId?: number
  targetCode?: string
  beforeJson?: unknown
  afterJson?: unknown
  operator?: AuthRequest['user']
  ip?: string
  userAgent?: string
}) {
  await prisma.operationLog.create({
    data: {
      module: input.module,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      targetCode: input.targetCode,
      beforeJson: input.beforeJson ? JSON.stringify(input.beforeJson) : null,
      afterJson: input.afterJson ? JSON.stringify(input.afterJson) : null,
      operatorId: input.operator?.userId,
      operatorName: input.operator?.name,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  })
}
