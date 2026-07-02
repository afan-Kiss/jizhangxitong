import { isAcceptanceTestExpense, isAcceptanceTestLedgerEntry, isAcceptanceTestSale } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { voidExpense } from './expense.service'
import { refundSale } from './sale.service'
import { workerHub } from '../websocket/worker-hub'
import { AuthRequest } from '../middleware/auth'
import { toNumber } from '../lib/utils'

export { isAcceptanceTestExpense } from '@jade-account/shared'

export interface CleanupResult {
  expensesVoided: number[]
  expensesSkipped: Array<{ id: number; reason: string }>
  salesRefunded: number[]
  salesSkipped: Array<{ id: number; reason: string }>
  filesDeleted: number[]
  filesSkipped: Array<{ id: number; reason: string }>
  localFilesDeleted: string[]
  localFilesFailed: Array<{ path: string; reason: string }>
  ledgerEntriesDeleted: number[]
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
    ledgerEntriesDeleted: [],
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

  const allSales = await prisma.sale.findMany()
  for (const sale of allSales) {
    if (!isAcceptanceTestSale(sale)) {
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
        { originalName: { contains: 'acceptance-test' } },
      ],
      attachments: { none: {} },
    },
  })

  for (const file of orphanFiles) {
    await tryDeleteFileRecord(file.id, file.localPath, file.thumbPath, result)
  }

  await cleanupTestLedgerEntries(result)

  return result
}

async function cleanupTestLedgerEntries(result: CleanupResult) {
  const rows = await prisma.financeLedger.findMany({
    select: { id: true, refType: true, refId: true, entryType: true, expenseId: true },
  })

  for (const row of rows) {
    let shouldDelete = isAcceptanceTestLedgerEntry(row)

    if (row.expenseId) {
      const expense = await prisma.expense.findUnique({ where: { id: row.expenseId } })
      if (expense && isAcceptanceTestExpense(expense)) shouldDelete = true
      if (!expense && isAcceptanceTestLedgerEntry(row)) shouldDelete = true
    }

    if (shouldDelete) {
      await prisma.financeLedger.delete({ where: { id: row.id } })
      result.ledgerEntriesDeleted.push(row.id)
    }
  }
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
