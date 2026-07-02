import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { EXPENSE_BUSINESS_LABELS } from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { generateNo, localDateString } from '../lib/utils'
import { sumMoney, toMoneyNumber } from '../lib/money'
import { AuthRequest } from '../middleware/auth'
import { resolveUsersBrief } from './audit.service'
import { buildWhere, type ExpenseFilter } from './expense.service'

const EXPORT_COLUMNS = [
  { header: '日期', key: 'occurredAt', width: 12 },
  { header: '支出编号', key: 'expenseNo', width: 22 },
  { header: '支出类型', key: 'expenseType', width: 14 },
  { header: '业务类型', key: 'businessTypeLabel', width: 14 },
  { header: '金额', key: 'amount', width: 12 },
  { header: '付款来源', key: 'paySource', width: 14 },
  { header: '关联订单号', key: 'externalOrderNo', width: 20 },
  { header: '物流单号', key: 'logisticsNo', width: 18 },
  { header: '货品编号', key: 'braceletCode', width: 14 },
  { header: '是否作废', key: 'isVoidedLabel', width: 10 },
  { header: '是否需要凭证', key: 'needsAttachmentLabel', width: 12 },
  { header: '创建人', key: 'createdByName', width: 12 },
  { header: '备注', key: 'remark', width: 24 },
] as const

function sanitizeFileName(startDate: string, endDate: string, exportNo: string, exportType: string) {
  const safe = (s: string) => s.replace(/[^\dA-Za-z\u4e00-\u9fff_-]/g, '')
  return `${safe(exportType)}_${safe(startDate)}_${safe(endDate)}_${exportNo}.xlsx`
}

function assertExportPath(filePath: string) {
  const exportRoot = path.resolve(config.exportDir)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(exportRoot + path.sep) && resolved !== exportRoot) {
    throw new Error('导出路径无效')
  }
  return resolved
}

export async function queryExpensesForExport(filter: ExpenseFilter) {
  const where = buildWhere(filter)
  return prisma.expense.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
}

function resolveExportDateRange(filter: ExpenseFilter) {
  const start = filter.startDate || localDateString(new Date())
  const end = filter.endDate || start
  return { start, end }
}

async function buildExpenseWorkbook(
  expenses: Awaited<ReturnType<typeof queryExpensesForExport>>,
  exportType: string,
) {
  const userMap = await resolveUsersBrief(expenses.map((e) => e.createdBy))
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '项目资金支出记录系统'
  const sheet = workbook.addWorksheet('支出明细')
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  sheet.getRow(1).font = { bold: true }

  for (const expense of expenses) {
    const amount = toMoneyNumber(expense.amount)
    const row = sheet.addRow({
      occurredAt: localDateString(expense.occurredAt),
      expenseNo: expense.expenseNo,
      expenseType: expense.expenseType,
      businessTypeLabel: EXPENSE_BUSINESS_LABELS[expense.businessType as keyof typeof EXPENSE_BUSINESS_LABELS]
        || expense.businessType
        || '',
      amount,
      paySource: expense.paySource,
      externalOrderNo: expense.externalOrderNo || '',
      logisticsNo: expense.logisticsNo || '',
      braceletCode: expense.braceletCode || '',
      isVoidedLabel: expense.isVoided ? '是' : '否',
      needsAttachmentLabel: expense.needsAttachment ? '是' : '否',
      createdByName: userMap.get(expense.createdBy)?.displayName
        || userMap.get(expense.createdBy)?.username
        || '未知',
      remark: expense.remark || '',
    })
    row.getCell('amount').numFmt = '0.00'
  }

  const totalRow = sheet.addRow({
    occurredAt: '',
    expenseNo: '',
    expenseType: '',
    businessTypeLabel: '合计',
    amount: sumMoney(expenses.map((e) => e.amount)),
    paySource: '',
    externalOrderNo: '',
    logisticsNo: '',
    braceletCode: '',
    isVoidedLabel: '',
    needsAttachmentLabel: '',
    createdByName: '',
    remark: exportType,
  })
  totalRow.font = { bold: true }
  totalRow.getCell('amount').numFmt = '0.00'

  return workbook
}

export async function createExpenseExport(
  filter: ExpenseFilter,
  operator: AuthRequest['user'],
  exportType = '项目资金支出明细',
) {
  const normalizedFilter: ExpenseFilter = {
    ...filter,
    isVoided: filter.isVoided ?? false,
    excludeTrial: true,
  }
  const expenses = await queryExpensesForExport(normalizedFilter)
  const { start, end } = resolveExportDateRange(normalizedFilter)
  const exportNo = generateNo('EXP')
  const fileName = sanitizeFileName(start, end, exportNo, exportType)
  const filePath = assertExportPath(path.join(config.exportDir, fileName))
  await fs.mkdir(config.exportDir, { recursive: true })

  const workbook = await buildExpenseWorkbook(expenses, exportType)
  await workbook.xlsx.writeFile(filePath)

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + config.exportTokenTtlMinutes * 60 * 1000)
  const task = await prisma.exportTask.create({
    data: {
      exportNo,
      exportType: 'expense_excel',
      filtersJson: JSON.stringify({ ...normalizedFilter, exportType }),
      status: 'completed',
      filePath,
      downloadToken: token,
      downloadExpiresAt: expiresAt,
      createdBy: operator!.userId,
      finishedAt: new Date(),
    },
  })

  const totalAmount = sumMoney(expenses.map((e) => e.amount))
  return {
    exportId: task.id,
    exportNo,
    recordCount: expenses.length,
    totalAmount,
    startDate: start,
    endDate: end,
    downloadUrl: `/api/expenses/export/${task.id}/download?token=${token}`,
  }
}

export async function downloadExpenseExport(exportId: number, token: string) {
  const task = await prisma.exportTask.findUnique({ where: { id: exportId } })
  if (!task || task.exportType !== 'expense_excel') {
    throw new Error('导出任务不存在')
  }
  if (task.status !== 'completed' || !task.filePath || !task.downloadToken) {
    throw new Error('导出文件尚未准备好')
  }
  if (task.downloadToken !== token) {
    throw new Error('下载链接无效或已过期')
  }
  if (task.downloadExpiresAt && task.downloadExpiresAt.getTime() < Date.now()) {
    throw new Error('下载链接已过期，请重新导出')
  }
  const filePath = assertExportPath(task.filePath)
  const buffer = await fs.readFile(filePath)
  const fileName = path.basename(filePath)
  return { buffer, fileName, exportNo: task.exportNo }
}

export async function createBiDrilldownExport(
  params: {
    type?: string
    range?: string
    startDate?: string
    endDate?: string
    q?: string
  },
  operator: AuthRequest['user'],
) {
  const { resolveDateRange } = await import('../lib/date-range')
  const resolved = resolveDateRange(params.range, params.startDate, params.endDate)
  const filter: ExpenseFilter = {
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    isVoided: false,
  }
  if (params.type === 'missing-attachment') filter.needsAttachment = true
  if (params.type === 'linked-order') {
    // buildWhere 不直接支持 linked-order；导出时额外过滤
  }
  const expenses = await queryExpensesForExport(filter)
  const q = params.q?.trim().toLowerCase() || ''
  const filtered = expenses.filter((e) => {
    if (params.type === 'linked-order' && !e.externalOrderNo?.trim()) return false
    if (params.type === 'unlinked-order' && e.externalOrderNo?.trim()) return false
    if (!q) return true
    const hay = [
      e.externalOrderNo,
      e.expenseType,
      e.paySource,
      e.remark,
      e.expenseNo,
      e.braceletCode,
    ].map((v) => String(v ?? '').toLowerCase()).join(' ')
    return hay.includes(q)
  })

  const exportNo = generateNo('EXP')
  const fileName = sanitizeFileName(resolved.startDate, resolved.endDate, exportNo, 'BI下钻导出')
  const filePath = assertExportPath(path.join(config.exportDir, fileName))
  await fs.mkdir(config.exportDir, { recursive: true })
  const workbook = await buildExpenseWorkbook(filtered, `BI下钻:${params.type || 'expenses'}`)
  await workbook.xlsx.writeFile(filePath)

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + config.exportTokenTtlMinutes * 60 * 1000)
  const task = await prisma.exportTask.create({
    data: {
      exportNo,
      exportType: 'bi_drilldown_excel',
      filtersJson: JSON.stringify({ ...params, startDate: resolved.startDate, endDate: resolved.endDate }),
      status: 'completed',
      filePath,
      downloadToken: token,
      downloadExpiresAt: expiresAt,
      createdBy: operator!.userId,
      finishedAt: new Date(),
    },
  })

  return {
    exportId: task.id,
    exportNo,
    recordCount: filtered.length,
    totalAmount: sumMoney(filtered.map((e) => e.amount)),
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    downloadUrl: `/api/bi/drilldown/export/${task.id}/download?token=${token}`,
  }
}

export async function downloadBiDrilldownExport(exportId: number, token: string) {
  const task = await prisma.exportTask.findUnique({ where: { id: exportId } })
  if (!task || task.exportType !== 'bi_drilldown_excel') {
    throw new Error('导出任务不存在')
  }
  if (task.status !== 'completed' || !task.filePath || !task.downloadToken) {
    throw new Error('导出文件尚未准备好')
  }
  if (task.downloadToken !== token) {
    throw new Error('下载链接无效或已过期')
  }
  if (task.downloadExpiresAt && task.downloadExpiresAt.getTime() < Date.now()) {
    throw new Error('下载链接已过期，请重新导出')
  }
  const filePath = assertExportPath(task.filePath)
  const buffer = await fs.readFile(filePath)
  return { buffer, fileName: path.basename(filePath), exportNo: task.exportNo }
}

export { EXPORT_COLUMNS }
