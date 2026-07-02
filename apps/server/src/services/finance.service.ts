import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import {
  displayExpensePurpose,
} from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { generateNo, localDateString, validateCustomDateRange } from '../lib/utils'
import { sumMoney, toMoneyNumber } from '../lib/money'
import { AuthRequest } from '../middleware/auth'
import { createFileAccessTokenWithTtl } from '../lib/file-access-token'
import {
  buildWhere,
  getExpenseSummary,
  type ExpenseFilter,
} from './expense.service'

const DEFAULT_SHARE_TTL_DAYS = 7
const ALLOWED_SHARE_TTL_DAYS = [1, 7, 30] as const

export type FinanceShareConfig = {
  includeDetails: boolean
  includeCategorySummary: boolean
  includeHandlerSummary: boolean
  includePaymentSourceSummary: boolean
  includeVoucherLinks: boolean
  includeRemarks: boolean
  includeOrderLogistics: boolean
}

function defaultShareConfig(): FinanceShareConfig {
  return {
    includeDetails: true,
    includeCategorySummary: true,
    includeHandlerSummary: true,
    includePaymentSourceSummary: true,
    includeVoucherLinks: true,
    includeRemarks: true,
    includeOrderLogistics: true,
  }
}

function normalizeShareTtlDays(days?: number): number {
  const n = Number(days)
  if ((ALLOWED_SHARE_TTL_DAYS as readonly number[]).includes(n)) return n
  return DEFAULT_SHARE_TTL_DAYS
}

function parseShareConfig(json: string): FinanceShareConfig {
  try {
    return { ...defaultShareConfig(), ...JSON.parse(json) }
  } catch {
    return defaultShareConfig()
  }
}

function shareToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

function publicBaseUrl(req?: { headers?: { 'x-forwarded-proto'?: string; host?: string } }): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  const proto = req?.headers?.['x-forwarded-proto'] || 'http'
  const host = req?.headers?.host || 'localhost:3001'
  return `${proto}://${host}`
}

export async function createFinanceShareLink(
  input: {
    title?: string
    startDate: string
    endDate: string
    includeDetails?: boolean
    includeCategorySummary?: boolean
    includeHandlerSummary?: boolean
    includePaymentSourceSummary?: boolean
    includeVoucherLinks?: boolean
    includeRemarks?: boolean
    includeOrderLogistics?: boolean
    expiresInDays?: number
  },
  operator: NonNullable<AuthRequest['user']>,
  req?: { headers?: { 'x-forwarded-proto'?: string; host?: string } },
) {
  validateCustomDateRange(input.startDate, input.endDate)
  const token = shareToken()
  const ttlDays = normalizeShareTtlDays(input.expiresInDays)
  const cfg: FinanceShareConfig = {
    ...defaultShareConfig(),
    includeDetails: input.includeDetails !== false,
    includeCategorySummary: input.includeCategorySummary !== false,
    includeHandlerSummary: input.includeHandlerSummary !== false,
    includePaymentSourceSummary: input.includePaymentSourceSummary !== false,
    includeVoucherLinks: input.includeVoucherLinks !== false,
    includeRemarks: input.includeRemarks !== false,
    includeOrderLogistics: input.includeOrderLogistics !== false,
  }
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  await prisma.financeShareLink.create({
    data: {
      token,
      title: input.title?.trim() || '项目资金支出对账表',
      startDate: input.startDate,
      endDate: input.endDate,
      configJson: JSON.stringify(cfg),
      createdBy: operator.userId,
      expiresAt,
    },
  })
  const base = publicBaseUrl(req)
  const sharePath = `/account/finance-share/${token}`
  return {
    ok: true,
    token,
    shareUrl: `${base}${sharePath}`,
    expiresAt: expiresAt.toISOString(),
    expiresInDays: ttlDays,
  }
}

async function loadShareExpenses(startDate: string, endDate: string) {
  const filter: ExpenseFilter = {
    startDate,
    endDate,
    isVoided: false,
    excludeTrial: true,
  }
  return prisma.expense.findMany({
    where: buildWhere(filter),
    include: { attachments: { include: { file: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
}

function fileViewPath(fileId: number, accessToken: string): string {
  return `/account/api/files/${fileId}/view?accessToken=${encodeURIComponent(accessToken)}`
}

async function mapExpenseRow(
  expense: Awaited<ReturnType<typeof loadShareExpenses>>[number],
  creatorId: number,
  baseUrl: string,
  cfg: FinanceShareConfig,
  linkExpiresAt?: Date | null,
) {
  const attachmentCount = expense.attachments.length
  const fileTokenTtlMs = linkExpiresAt
    ? Math.max(linkExpiresAt.getTime() - Date.now(), 60_000)
    : DEFAULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000
  const voucherLinks: string[] = []
  if (cfg.includeVoucherLinks && attachmentCount) {
    for (const att of expense.attachments) {
      const { token } = createFileAccessTokenWithTtl(creatorId, att.fileId, fileTokenTtlMs)
      voucherLinks.push(`${baseUrl}${fileViewPath(att.fileId, token)}`)
    }
  }
  const linkParts: string[] = []
  if (cfg.includeOrderLogistics) {
    if (expense.externalOrderNo) linkParts.push(`订单 ${expense.externalOrderNo}`)
    if (expense.logisticsNo) linkParts.push(`物流 ${expense.logisticsNo}`)
    if (expense.braceletCode) linkParts.push(`货品 ${expense.braceletCode}`)
  }
  return {
    id: expense.id,
    occurredAt: localDateString(expense.occurredAt),
    expenseType: expense.expenseType,
    expensePurpose: displayExpensePurpose(expense),
    amount: toMoneyNumber(expense.amount),
    operatorName: expense.reimbursementPerson || '未标记',
    paySource: expense.paySource,
    externalOrderNo: cfg.includeOrderLogistics ? (expense.externalOrderNo || '') : '',
    logisticsNo: cfg.includeOrderLogistics ? (expense.logisticsNo || '') : '',
    linkText: linkParts.join(' / ') || '—',
    attachmentCount,
    voucherLabel: attachmentCount ? `有 ${attachmentCount} 张` : '无凭证',
    voucherLinks,
    remark: cfg.includeRemarks ? (expense.remark || '') : '',
  }
}

export async function getFinanceShareByToken(
  token: string,
  req?: { headers?: { 'x-forwarded-proto'?: string; host?: string } },
) {
  const link = await prisma.financeShareLink.findUnique({ where: { token } })
  if (!link) throw new Error('对账链接不存在或已失效')
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    throw new Error('对账链接已过期')
  }
  const cfg = parseShareConfig(link.configJson)
  const summary = await getExpenseSummary('custom', link.startDate, link.endDate)
  const expenses = await loadShareExpenses(link.startDate, link.endDate)
  const baseUrl = publicBaseUrl(req)

  const byTypeRows = Object.entries(summary.byType || {}).map(([name, amount]) => ({
    name,
    amount: Number(amount),
    count: summary.byTypeCount?.[name] || 0,
    ratio: summary.totalAmount > 0 ? Number(amount) / summary.totalAmount : 0,
  }))

  const byOperatorRows = Object.entries(summary.byOperator || {}).map(([name, amount]) => ({
    name,
    amount: Number(amount),
    count: expenses.filter((e) => (e.reimbursementPerson?.trim() || '未标记') === name).length,
  }))

  const byPaySourceRows = Object.entries(summary.byPaySource || {}).map(([name, amount]) => ({
    name,
    amount: Number(amount),
    count: expenses.filter((e) => e.paySource === name).length,
  }))

  const details = cfg.includeDetails
    ? await Promise.all(
      expenses.map((e) => mapExpenseRow(e, link.createdBy, baseUrl, cfg, link.expiresAt)),
    )
    : []

  return {
    title: link.title,
    startDate: link.startDate,
    endDate: link.endDate,
    generatedAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() || null,
    summary: {
      totalAmount: summary.totalAmount,
      totalCount: summary.totalCount,
      needsAttachmentCount: summary.needsAttachmentCount,
      withVoucherCount: summary.withVoucherCount,
      voucherCompleteRate: summary.voucherCompleteRate,
      linkedCount: summary.linkedCount,
      unlinkedOrderLogisticsCount: summary.unlinkedOrderLogisticsCount,
    },
    byType: cfg.includeCategorySummary ? byTypeRows : [],
    byOperator: cfg.includeHandlerSummary ? byOperatorRows : [],
    byPaySource: cfg.includePaymentSourceSummary ? byPaySourceRows : [],
    details,
    config: cfg,
    token: link.token,
  }
}

function assertExportPath(filePath: string) {
  const exportRoot = path.resolve(config.exportDir)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(exportRoot + path.sep) && resolved !== exportRoot) {
    throw new Error('导出路径无效')
  }
  return resolved
}

export async function buildFinanceReportWorkbook(
  startDate: string,
  endDate: string,
  title: string,
  options?: { baseUrl?: string },
) {
  const summary = await getExpenseSummary('custom', startDate, endDate)
  const expenses = await prisma.expense.findMany({
    where: buildWhere({
      startDate,
      endDate,
      isVoided: false,
      excludeTrial: true,
    }),
    include: { attachments: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  })
  const baseUrl = options?.baseUrl?.replace(/\/$/, '') || ''

  const workbook = new ExcelJS.Workbook()
  workbook.creator = '项目资金支出记录系统'

  const summarySheet = workbook.addWorksheet('对账汇总')
  summarySheet.addRow(['项目资金支出对账表', title])
  summarySheet.addRow(['时间范围', `${startDate} 至 ${endDate}`])
  summarySheet.addRow(['支出总额', summary.totalAmount])
  summarySheet.addRow(['支出笔数', summary.totalCount])
  summarySheet.addRow(['待补凭证', summary.needsAttachmentCount])
  summarySheet.addRow(['有凭证笔数', summary.withVoucherCount])
  summarySheet.addRow(['凭证完整率', summary.voucherCompleteRate])
  summarySheet.getColumn(1).width = 18
  summarySheet.getColumn(2).width = 24

  const detailSheet = workbook.addWorksheet('支出明细')
  detailSheet.columns = [
    { header: '日期', key: 'date', width: 12 },
    { header: '分类', key: 'type', width: 14 },
    { header: '支出用途', key: 'purpose', width: 12 },
    { header: '金额', key: 'amount', width: 12 },
    { header: '经手人', key: 'operator', width: 10 },
    { header: '付款来源', key: 'paySource', width: 14 },
    { header: '订单号', key: 'orderNo', width: 18 },
    { header: '物流单号', key: 'logisticsNo', width: 18 },
    { header: '关联货品', key: 'link', width: 16 },
    { header: '凭证数量', key: 'attCount', width: 10 },
    { header: '凭证链接', key: 'voucherLinks', width: 48 },
    { header: '备注', key: 'remark', width: 24 },
  ]
  detailSheet.getRow(1).font = { bold: true }
  for (const e of expenses) {
    const linkParts: string[] = []
    if (e.externalOrderNo) linkParts.push(e.externalOrderNo)
    if (e.logisticsNo) linkParts.push(e.logisticsNo)
    if (e.braceletCode) linkParts.push(e.braceletCode)
    const attCount = e.attachments.length
    const voucherLinks: string[] = []
    if (baseUrl && attCount) {
      for (const att of e.attachments) {
        const { token } = createFileAccessTokenWithTtl(
          e.createdBy,
          att.fileId,
          DEFAULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
        )
        voucherLinks.push(`${baseUrl}${fileViewPath(att.fileId, token)}`)
      }
    }
    const row = detailSheet.addRow({
      date: localDateString(e.occurredAt),
      type: e.expenseType,
      purpose: displayExpensePurpose(e),
      amount: toMoneyNumber(e.amount),
      operator: e.reimbursementPerson || '',
      paySource: e.paySource,
      orderNo: e.externalOrderNo || '',
      logisticsNo: e.logisticsNo || '',
      link: e.braceletCode || '',
      attCount,
      voucherLinks: voucherLinks.join('\n'),
      remark: e.remark || '',
    })
    row.getCell('amount').numFmt = '0.00'
    row.getCell('voucherLinks').alignment = { wrapText: true, vertical: 'top' }
  }
  const totalDetail = detailSheet.addRow({
    date: '',
    type: '合计',
    purpose: '',
    amount: sumMoney(expenses.map((e) => e.amount)),
    operator: '',
    paySource: '',
    orderNo: '',
    logisticsNo: '',
    link: '',
    attCount: '',
    voucherLinks: '',
    remark: '',
  })
  totalDetail.font = { bold: true }
  totalDetail.getCell('amount').numFmt = '0.00'

  const typeSheet = workbook.addWorksheet('分类汇总')
  typeSheet.columns = [
    { header: '分类', key: 'name', width: 16 },
    { header: '金额', key: 'amount', width: 14 },
    { header: '笔数', key: 'count', width: 10 },
    { header: '占比', key: 'ratio', width: 10 },
  ]
  typeSheet.getRow(1).font = { bold: true }
  for (const [name, amount] of Object.entries(summary.byType || {})) {
    const amt = Number(amount)
    const row = typeSheet.addRow({
      name,
      amount: amt,
      count: summary.byTypeCount?.[name] || 0,
      ratio: summary.totalAmount > 0 ? amt / summary.totalAmount : 0,
    })
    row.getCell('amount').numFmt = '0.00'
    row.getCell('ratio').numFmt = '0.00%'
  }

  const mixSheet = workbook.addWorksheet('经手人与付款来源汇总')
  mixSheet.columns = [
    { header: '类型', key: 'kind', width: 14 },
    { header: '名称', key: 'name', width: 16 },
    { header: '金额', key: 'amount', width: 14 },
    { header: '笔数', key: 'count', width: 10 },
  ]
  mixSheet.getRow(1).font = { bold: true }
  for (const [name, amount] of Object.entries(summary.byOperator || {})) {
    const row = mixSheet.addRow({
      kind: '经手人',
      name,
      amount: Number(amount),
      count: expenses.filter((e) => (e.reimbursementPerson?.trim() || '未标记') === name).length,
    })
    row.getCell('amount').numFmt = '0.00'
  }
  for (const [name, amount] of Object.entries(summary.byPaySource || {})) {
    const row = mixSheet.addRow({
      kind: '付款来源',
      name,
      amount: Number(amount),
      count: expenses.filter((e) => e.paySource === name).length,
    })
    row.getCell('amount').numFmt = '0.00'
  }

  return workbook
}

export async function exportFinanceExcel(
  params: {
    startDate: string
    endDate: string
    title?: string
    token?: string
  },
  req?: { headers?: { 'x-forwarded-proto'?: string; host?: string } },
) {
  let startDate = params.startDate
  let endDate = params.endDate
  let title = params.title || '项目资金支出对账表'

  if (params.token) {
    const link = await prisma.financeShareLink.findUnique({ where: { token: params.token } })
    if (!link) throw new Error('对账链接不存在')
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) throw new Error('对账链接已过期')
    startDate = link.startDate
    endDate = link.endDate
    title = link.title
  }

  if (!startDate || !endDate) throw new Error('请提供时间范围')
  validateCustomDateRange(startDate, endDate)

  const exportNo = generateNo('FIN')
  const fileName = `项目资金对账_${startDate}_${endDate}_${exportNo}.xlsx`
  const filePath = assertExportPath(path.join(config.exportDir, fileName))
  await fs.mkdir(config.exportDir, { recursive: true })

  const workbook = await buildFinanceReportWorkbook(startDate, endDate, title, {
    baseUrl: publicBaseUrl(req),
  })
  await workbook.xlsx.writeFile(filePath)
  const buffer = await fs.readFile(filePath)
  return { buffer, fileName }
}
