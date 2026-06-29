import ExcelJS from 'exceljs'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { FILE_TYPE_LABELS } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { formatDateMD, generateNo, toNumber } from '../lib/utils'
import { buildWhere, ExpenseFilter } from './expense.service'
import { readFilesForExport } from './file.service'
import { writeOperationLog } from './operation-log.service'
import { AuthRequest } from '../middleware/auth'
import { isTrialModeEnabled } from './trial-mode.service'

interface ExportRow {
  isMain: boolean
  seq?: number
  date: string
  person: string
  type: string
  summary: string
  amount?: number
  remark: string
  fileId?: number
  fileType?: string
  expenseId: number
}

function buildSummary(expense: {
  expenseSummary?: string | null
  braceletCode?: string | null
  expenseType: string
  remark?: string | null
}): string {
  if (expense.expenseSummary) return expense.expenseSummary
  if (expense.braceletCode) return `镯子 ${expense.braceletCode} - ${expense.expenseType}`
  const remarkPart = expense.remark?.slice(0, 20) || ''
  return `${expense.expenseType}${remarkPart ? ` ${remarkPart}` : ''}`
}

function buildRemark(expense: {
  remark?: string | null
  braceletCode?: string | null
  expenseType: string
}, suffix?: string): string {
  const parts: string[] = []
  if (suffix) parts.push(suffix)
  if (expense.remark) parts.push(expense.remark)
  if (expense.braceletCode) parts.push(`镯子编号：${expense.braceletCode}`)
  if (expense.expenseType === '客户补偿' || expense.expenseType === '售后补偿') {
    parts.push('客户补偿/售后原因')
  }
  return parts.join('；')
}

export async function previewReimbursementExport(filter: ExpenseFilter) {
  const trialMode = await isTrialModeEnabled()
  const where = buildWhere({
    ...filter,
    isVoided: false,
    ...(trialMode ? { isTrialRun: true } : { excludeTrial: true }),
  })
  const expenses = await prisma.expense.findMany({
    where,
    include: { attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { occurredAt: 'asc' },
  })

  let missingImageCount = 0
  const preview = expenses.map((e) => {
    const hasImage = e.attachments.length > 0
    if (!hasImage) missingImageCount++
    return {
      id: e.id,
      occurredAt: e.occurredAt,
      reimbursementPerson: e.reimbursementPerson,
      expenseType: e.expenseType,
      summary: buildSummary(e),
      amount: toNumber(e.amount),
      imageCount: e.attachments.length,
      remark: e.remark,
      hasImage,
    }
  })

  return { preview, missingImageCount, total: expenses.length }
}

export async function createReimbursementExport(
  filter: ExpenseFilter,
  operator: AuthRequest['user'],
) {
  const exportNo = generateNo('EXP')
  const trialMode = await isTrialModeEnabled()
  const task = await prisma.exportTask.create({
    data: {
      exportNo,
      exportType: 'reimbursement_excel',
      filtersJson: JSON.stringify(filter),
      status: 'running',
      isTrialRun: trialMode,
      createdBy: operator!.userId,
    },
  })

  try {
    const where = buildWhere({
      ...filter,
      isVoided: false,
      ...(trialMode ? { isTrialRun: true } : { excludeTrial: true }),
    })
    const expenses = await prisma.expense.findMany({
      where,
      include: { attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { occurredAt: 'asc' },
    })

    const rows: ExportRow[] = []
    let seq = 1
    const fileIds: number[] = []

    for (const expense of expenses) {
      const creator = await prisma.user.findUnique({ where: { id: expense.createdBy } })
      const person = expense.reimbursementPerson || creator?.name || ''
      const dateStr = formatDateMD(expense.occurredAt)
      const summary = buildSummary(expense)
      const attachments = expense.attachments

      if (attachments.length === 0) {
        rows.push({
          isMain: true,
          seq,
          date: dateStr,
          person,
          type: expense.expenseType,
          summary,
          amount: toNumber(expense.amount),
          remark: buildRemark(expense),
          expenseId: expense.id,
        })
        seq++
        continue
      }

      const paymentFirst = attachments.find((a) => a.fileType === 'payment_screenshot') || attachments[0]
      rows.push({
        isMain: true,
        seq,
        date: dateStr,
        person,
        type: expense.expenseType,
        summary,
        amount: toNumber(expense.amount),
        remark: buildRemark(expense),
        fileId: paymentFirst.fileId,
        fileType: paymentFirst.fileType,
        expenseId: expense.id,
      })
      fileIds.push(paymentFirst.fileId)
      seq++

      const extra = attachments.filter((a) => a.fileId !== paymentFirst.fileId)
      for (const att of extra) {
        const label = FILE_TYPE_LABELS[att.fileType] || '其他凭证'
        rows.push({
          isMain: false,
          date: '',
          person: '',
          type: '',
          summary: '',
          remark: buildRemark(expense, `附图：${label}`),
          fileId: att.fileId,
          fileType: att.fileType,
          expenseId: expense.id,
        })
        fileIds.push(att.fileId)
      }
    }

    const uniqueFileIds = [...new Set(fileIds)]
    const fileMap = new Map<number, { buffer: Buffer; mimeType: string }>()

    if (uniqueFileIds.length > 0) {
      const files = await readFilesForExport(uniqueFileIds)
      for (const f of files) {
        fileMap.set(f.fileId, {
          buffer: Buffer.from(f.buffer, 'base64'),
          mimeType: f.mimeType,
        })
      }
    }

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('日常物料报销明细')

    sheet.columns = [
      { header: '序号', key: 'seq', width: 8 },
      { header: '日期', key: 'date', width: 12 },
      { header: '报销人', key: 'person', width: 12 },
      { header: '类型', key: 'type', width: 14 },
      { header: '摘要', key: 'summary', width: 30 },
      { header: '报账金额', key: 'amount', width: 12 },
      { header: '付款截图', key: 'image', width: 28 },
      { header: '备注', key: 'remark', width: 40 },
    ]

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 24

    let rowIndex = 2
    const amountRows: number[] = []

    for (const row of rows) {
      const excelRow = sheet.getRow(rowIndex)
      excelRow.getCell(1).value = row.isMain ? row.seq : ''
      excelRow.getCell(2).value = row.date
      excelRow.getCell(3).value = row.person
      excelRow.getCell(4).value = row.type
      excelRow.getCell(5).value = row.summary
      if (row.isMain && row.amount !== undefined) {
        excelRow.getCell(6).value = row.amount
        excelRow.getCell(6).numFmt = '0.00'
        amountRows.push(rowIndex)
      }
      excelRow.getCell(8).value = row.remark
      excelRow.height = 100
      excelRow.alignment = { vertical: 'middle', wrapText: true }

      if (row.fileId && fileMap.has(row.fileId)) {
        const img = fileMap.get(row.fileId)!
        const extension = img.mimeType.includes('png') ? 'png' : 'jpeg'
        const imageId = workbook.addImage({
          buffer: img.buffer as unknown as ExcelJS.Buffer,
          extension,
        })
        sheet.addImage(imageId, {
          tl: { col: 6, row: rowIndex - 1 },
          ext: { width: 150, height: 100 },
        })
      } else if (row.isMain) {
        excelRow.getCell(7).value = '缺少付款截图'
      }

      for (let c = 1; c <= 8; c++) {
        excelRow.getCell(c).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      }

      rowIndex++
    }

    const totalRowIndex = rowIndex
    const totalRow = sheet.getRow(totalRowIndex)
    totalRow.getCell(5).value = '合计'
    totalRow.getCell(5).font = { bold: true }
    if (amountRows.length > 0) {
      const refs = amountRows.map((r) => `F${r}`).join('+')
      totalRow.getCell(6).value = { formula: refs }
      totalRow.getCell(6).numFmt = '0.00'
    } else {
      totalRow.getCell(6).value = 0
    }
    totalRow.height = 24
    for (let c = 1; c <= 8; c++) {
      totalRow.getCell(c).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const startDate = filter.startDate || 'unknown'
    const endDate = filter.endDate || 'unknown'
    const fileName = `和田玉报销明细_${startDate}_${endDate}.xlsx`
    const filePath = path.join(config.exportDir, fileName)
    await fs.mkdir(config.exportDir, { recursive: true })
    await workbook.xlsx.writeFile(filePath)

    const token = uuidv4()
    const expiresAt = new Date(Date.now() + config.exportTokenTtlMinutes * 60 * 1000)

    await prisma.exportTask.update({
      where: { id: task.id },
      data: {
        status: 'success',
        filePath,
        downloadToken: token,
        downloadExpiresAt: expiresAt,
        finishedAt: new Date(),
      },
    })

    await writeOperationLog({
      module: 'export',
      action: 'export_reimbursement_excel',
      targetType: 'export_task',
      targetId: task.id,
      targetCode: exportNo,
      afterJson: { fileName, filter },
      operator,
    })

    return {
      exportId: task.id,
      downloadUrl: `/api/exports/${task.id}/download?token=${token}`,
      fileName,
      expiresAt: expiresAt.toISOString(),
    }
  } catch (err) {
    await prisma.exportTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        errorMessage: (err as Error).message,
        finishedAt: new Date(),
      },
    })
    throw err
  }
}

export async function getExportTask(id: number) {
  return prisma.exportTask.findUnique({ where: { id } })
}

export async function downloadExport(id: number, token: string) {
  const task = await prisma.exportTask.findUnique({ where: { id } })
  if (!task || task.downloadToken !== token) throw new Error('下载链接无效')
  if (!task.downloadExpiresAt || task.downloadExpiresAt < new Date()) throw new Error('下载链接已过期')
  if (!task.filePath) throw new Error('文件不存在')
  const buffer = await fs.readFile(task.filePath)
  const fileName = path.basename(task.filePath)
  return { buffer, fileName }
}
