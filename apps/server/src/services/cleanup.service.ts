import { prisma } from '../lib/prisma'
import { voidExpense } from './expense.service'
import { refundSale } from './sale.service'
import { workerHub } from '../websocket/worker-hub'
import { AuthRequest } from '../middleware/auth'
import { toNumber } from '../lib/utils'

const TEST_TEXT_MARKERS = [
  'test_auto_check',
  'test_auto_check_multi_images',
  'test-accounting-flow',
  'test-project-expense-only',
  '自动联调测试',
]

function isTestText(text?: string | null) {
  if (!text) return false
  return TEST_TEXT_MARKERS.some((m) => text.includes(m))
}

/** 仅匹配自动化测试产生的支出，不误伤用户真实记录 */
export function isAcceptanceTestExpense(expense: {
  remark?: string | null
  expenseSummary?: string | null
  externalOrderNo?: string | null
}) {
  if (isTestText(expense.remark) || isTestText(expense.expenseSummary)) return true
  const remark = String(expense.remark || '')
  if (/^FUND-\d+(-default-pay|-reject-staff)?$/i.test(remark.trim())) return true
  if (/^TEST-\d+/.test(String(expense.externalOrderNo || ''))) return true
  return false
}

export interface CleanupResult {
  expensesVoided: number[]
  expensesSkipped: Array<{ id: number; reason: string }>
  salesRefunded: number[]
  salesSkipped: Array<{ id: number; reason: string }>
  filesDeleted: number[]
  filesSkipped: Array<{ id: number; reason: string }>
  localFilesDeleted: string[]
  localFilesFailed: Array<{ path: string; reason: string }>
}

export async function cleanupAcceptanceTestData(operator: AuthRequest['user']): Promise<CleanupResult> {
  const result: CleanupResult = {
    expensesVoided: [],
    expensesSkipped: [],
    salesRefunded: [],
    salesSkipped: [],
    filesDeleted: [],
    filesSkipped: [],
    localFilesDeleted: [],
    localFilesFailed: [],
  }

  const allExpenses = await prisma.expense.findMany({
    include: { attachments: { include: { file: true } } },
  })

  for (const expense of allExpenses) {
    if (!isAcceptanceTestExpense(expense)) {
      continue
    }
    if (expense.isVoided) {
      result.expensesSkipped.push({ id: expense.id, reason: '已作废' })
    } else {
      await voidExpense(expense.id, 'acceptance test cleanup', operator)
      result.expensesVoided.push(expense.id)
    }

    for (const att of expense.attachments) {
      const file = att.file
      if (!file) continue
      await prisma.expenseAttachment.delete({ where: { id: att.id } }).catch(() => {})
      await tryDeleteFileRecord(file.id, file.localPath, file.thumbPath, result)
    }
  }

  const testSales = await prisma.sale.findMany({
    where: { customerRemark: { contains: 'test_auto_check' } },
  })

  for (const sale of testSales) {
    if (!isTestText(sale.customerRemark)) {
      result.salesSkipped.push({ id: sale.id, reason: '不含测试标记，跳过' })
      continue
    }
    if (sale.status === 'refunded') {
      result.salesSkipped.push({ id: sale.id, reason: '已退款/作废' })
      continue
    }
    await refundSale(
      sale.id,
      {
        refundAmount: toNumber(sale.saleAmount),
        refundReason: 'acceptance test cleanup',
      },
      operator,
    )
    result.salesRefunded.push(sale.id)
  }

  const orphanFiles = await prisma.file.findMany({
    where: {
      OR: [
        { originalName: { contains: 'acceptance' } },
        { originalName: { contains: 'test_auto' } },
      ],
      attachments: { none: {} },
    },
  })

  for (const file of orphanFiles) {
    await tryDeleteFileRecord(file.id, file.localPath, file.thumbPath, result)
  }

  return result
}

async function tryDeleteFileRecord(
  fileId: number,
  localPath: string,
  thumbPath: string | null,
  result: CleanupResult,
) {
  if (workerHub.isOnline()) {
    try {
      await workerHub.deleteLocalFile(localPath, thumbPath || undefined)
      result.localFilesDeleted.push(localPath)
      if (thumbPath) result.localFilesDeleted.push(thumbPath)
    } catch (err) {
      result.localFilesFailed.push({ path: localPath, reason: (err as Error).message })
    }
  } else {
    result.filesSkipped.push({ id: fileId, reason: 'Worker 离线，仅删除元数据' })
  }

  await prisma.file.delete({ where: { id: fileId } }).then(() => {
    result.filesDeleted.push(fileId)
  }).catch(() => {
    result.filesSkipped.push({ id: fileId, reason: '元数据删除失败' })
  })
}
