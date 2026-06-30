import { EXPENSE_BUSINESS_LABELS } from '@jade-account/shared'
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

type JsonRecord = Record<string, unknown>

function parseJson(raw: string | null | undefined): JsonRecord | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as JsonRecord) : null
  } catch {
    return null
  }
}

function moneyText(value: unknown): string {
  const n = Number(value)
  if (Number.isNaN(n)) return String(value ?? '')
  return n.toFixed(2)
}

function businessLabel(businessType?: unknown, expenseType?: unknown): string {
  const bt = String(businessType || '')
  if (bt && EXPENSE_BUSINESS_LABELS[bt as keyof typeof EXPENSE_BUSINESS_LABELS]) {
    return EXPENSE_BUSINESS_LABELS[bt as keyof typeof EXPENSE_BUSINESS_LABELS]
  }
  const t = String(expenseType || '').trim()
  if (t) return t
  return '普通支出'
}

function actorName(operatorName?: string | null): string | null {
  const name = operatorName?.trim()
  return name || null
}

function buildExpenseCreateMessage(actor: string, after: JsonRecord): string {
  const amount = moneyText(after.amount)
  const label = businessLabel(after.businessType, after.expenseType)
  const parts = [`${actor} 添加了一笔${label}，金额 ${amount} 元`]
  if (after.externalOrderNo) parts.push(`关联订单 ${after.externalOrderNo}`)
  if (after.braceletCode) parts.push(`货品 ${after.braceletCode}`)
  return parts.join('，')
}

function buildExpenseUpdateMessage(actor: string, before: JsonRecord, after: JsonRecord): string {
  const changes: string[] = []
  if (before.amount !== undefined && after.amount !== undefined && String(before.amount) !== String(after.amount)) {
    changes.push(`把金额从 ${moneyText(before.amount)} 元改成 ${moneyText(after.amount)} 元`)
  }
  const beforeBiz = businessLabel(before.businessType, before.expenseType)
  const afterBiz = businessLabel(after.businessType, after.expenseType)
  if (beforeBiz !== afterBiz) {
    changes.push(`把业务类型从 ${beforeBiz} 改成 ${afterBiz}`)
  }
  if (before.externalOrderNo !== after.externalOrderNo && (after.externalOrderNo || before.externalOrderNo)) {
    changes.push(`把关联订单从 ${before.externalOrderNo || '无'} 改成 ${after.externalOrderNo || '无'}`)
  }
  if (before.braceletCode !== after.braceletCode && (after.braceletCode || before.braceletCode)) {
    changes.push(`把货品编号从 ${before.braceletCode || '无'} 改成 ${after.braceletCode || '无'}`)
  }
  if (before.reimbursementPerson !== after.reimbursementPerson && (after.reimbursementPerson || before.reimbursementPerson)) {
    changes.push(`把经手人从 ${before.reimbursementPerson || '无'} 改成 ${after.reimbursementPerson || '无'}`)
  }
  if (changes.length) return `${actor} ${changes.join('；')}`
  return `${actor} 修改了这笔支出`
}

const REIMBURSE_LABELS: Record<string, string> = {
  pending: '未报销',
  reimbursed: '已报销',
  not_required: '不需要报销',
}

export function formatOperationLogEntry(log: {
  id: number
  action: string
  operatorName?: string | null
  beforeJson?: string | null
  afterJson?: string | null
  createdAt: Date
  targetCode?: string | null
  targetType?: string | null
  module?: string | null
}) {
  const actor = actorName(log.operatorName)
  const before = parseJson(log.beforeJson)
  const after = parseJson(log.afterJson)
  let formattedMessage = '历史数据，未记录操作人'

  if (actor) {
    switch (log.action) {
      case 'create_expense':
        formattedMessage = after ? buildExpenseCreateMessage(actor, after) : `${actor} 添加了一笔支出`
        break
      case 'update_expense':
        formattedMessage = before && after
          ? buildExpenseUpdateMessage(actor, before, after)
          : `${actor} 修改了这笔支出`
        break
      case 'void_expense':
        formattedMessage = `${actor} 作废了一笔支出`
        break
      case 'link_expense': {
        const order = after?.externalOrderNo || log.targetCode
        formattedMessage = order
          ? `${actor} 补关联了这笔支出，关联订单 ${order}`
          : `${actor} 补关联了这笔支出`
        break
      }
      case 'upload_attachment': {
        const count = Array.isArray(after?.fileIds) ? after.fileIds.length : 1
        formattedMessage = `${actor} 上传了 ${count} 张凭证图片`
        break
      }
      case 'update_reimbursement_status': {
        const status = REIMBURSE_LABELS[String(after?.reimbursementStatus || '')] || String(after?.reimbursementStatus || '报销状态')
        formattedMessage = `${actor} 把报销状态改成了 ${status}`
        break
      }
      case 'create_sale': {
        const amount = after?.saleAmount != null ? moneyText(after.saleAmount) : ''
        formattedMessage = amount
          ? `${actor} 登记了一笔销售，金额 ${amount} 元`
          : `${actor} 登记了一笔销售`
        break
      }
      case 'update_sale':
        formattedMessage = `${actor} 修改了这笔销售`
        break
      case 'refund_sale':
      case 'create_refund': {
        const amount = after?.refundAmount != null ? moneyText(after.refundAmount) : ''
        formattedMessage = amount
          ? `${actor} 添加了一笔退款，金额 ${amount} 元`
          : `${actor} 添加了一笔退款`
        break
      }
      case 'approve_user':
        formattedMessage = log.targetCode
          ? `${actor} 审核通过了 ${log.targetCode} 的账号`
          : `${actor} 审核通过了一个账号`
        break
      case 'reject_user':
        formattedMessage = log.targetCode
          ? `${actor} 拒绝了 ${log.targetCode} 的注册`
          : `${actor} 拒绝了一个注册申请`
        break
      case 'disable_user':
        formattedMessage = log.targetCode
          ? `${actor} 禁用了 ${log.targetCode} 的账号`
          : `${actor} 禁用了账号`
        break
      case 'enable_user':
        formattedMessage = log.targetCode
          ? `${actor} 启用了 ${log.targetCode} 的账号`
          : `${actor} 启用了账号`
        break
      case 'update_user':
        formattedMessage = `${actor} 修改了账号信息`
        break
      case 'register':
        formattedMessage = `${actor} 注册了账号`
        break
      case 'update_setting':
        if (log.targetCode === 'qianfan_order_url_template') {
          formattedMessage = `${actor} 修改了千帆订单链接模板`
        } else {
          formattedMessage = `${actor} 修改了系统设置`
        }
        break
      case 'export_reimbursement_excel':
        formattedMessage = `${actor} 导出了一次报销表`
        break
      case 'export_image_read_failed':
        formattedMessage = `${actor} 导出报销表时，有图片没读出来`
        break
      case 'bind_order_goods':
        formattedMessage = `${actor} 在扫码工作台绑定了订单和货品`
        break
      case 'bind_goods':
        formattedMessage = `${actor} 在扫码工作台绑定了货品`
        break
      case 'create_goods':
        formattedMessage = `${actor} 登记了新货品`
        break
      case 'sync_bracelet':
      case 'auto_sync_bracelet':
        formattedMessage = `${actor} 同步了货品信息`
        break
      case 'create_cost_adjustment':
        formattedMessage = `${actor} 做了成本调整`
        break
      case 'create_role':
        formattedMessage = `${actor} 新建了角色`
        break
      case 'update_role':
        formattedMessage = `${actor} 修改了角色权限`
        break
      case 'update_user_roles':
        formattedMessage = `${actor} 调整了用户角色`
        break
      default:
        formattedMessage = `${actor} 进行了操作（${log.action}）`
    }
  }

  const targetLabel = log.targetCode
    ? `${log.targetType || '记录'} ${log.targetCode}`
    : log.targetType || ''

  return {
    id: log.id,
    action: log.action,
    summary: formattedMessage,
    formattedMessage,
    operatorName: log.operatorName,
    targetCode: log.targetCode,
    targetType: log.targetType,
    targetLabel,
    createdAt: log.createdAt,
  }
}
