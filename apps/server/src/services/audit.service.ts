import { prisma } from '../lib/prisma'

export async function resolveUserBrief(userId?: number | null) {
  if (!userId) return null
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true },
  })
  if (!u) return null
  return { id: u.id, username: u.username, displayName: u.name }
}

export async function resolveUsersBrief(userIds: number[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map<number, { id: number; username: string; displayName: string }>()
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, name: true },
  })
  return new Map(users.map((u) => [u.id, { id: u.id, username: u.username, displayName: u.name }]))
}

export async function getEntityOperationLogs(targetType: string, targetId: number, limit = 50) {
  const logs = await prisma.operationLog.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return logs.map(formatOperationLogEntry)
}

const ACTION_LABELS: Record<string, string> = {
  create_expense: '添加了这笔支出',
  update_expense: '修改了这笔支出',
  void_expense: '作废了这笔支出',
  link_expense: '补关联了这笔支出',
  upload_attachment: '上传了凭证图片',
  create_sale: '登记了这笔销售',
  update_sale: '修改了这笔销售',
  create_refund: '登记了退款',
  update_refund: '修改了退款',
  approve_user: '审核通过了账号',
  reject_user: '拒绝了账号',
  disable_user: '禁用了账号',
  enable_user: '启用了账号',
  update_user: '修改了账号信息',
  update_setting: '修改了系统设置',
  register: '注册了账号',
}

export function formatOperationLogEntry(log: {
  id: number
  action: string
  operatorName?: string | null
  beforeJson?: string | null
  afterJson?: string | null
  createdAt: Date
  targetCode?: string | null
}) {
  const actor = log.operatorName || '未知'
  const actionLabel = ACTION_LABELS[log.action] || log.action
  let detail = ''
  if (log.action === 'update_expense' && log.beforeJson && log.afterJson) {
    try {
      const before = JSON.parse(log.beforeJson)
      const after = JSON.parse(log.afterJson)
      if (before.amount !== undefined && after.amount !== undefined && String(before.amount) !== String(after.amount)) {
        detail = `把金额从 ${before.amount} 改成 ${after.amount}`
      }
    } catch { /* ignore */ }
  }
  if (log.action === 'approve_user' && log.targetCode) {
    detail = log.targetCode
  }
  const summary = detail ? `${actor}${actionLabel.replace('账号', ` ${detail} 的账号`)}` : `${actor}${actionLabel}`
  return {
    id: log.id,
    action: log.action,
    summary,
    operatorName: log.operatorName,
    createdAt: log.createdAt,
  }
}
