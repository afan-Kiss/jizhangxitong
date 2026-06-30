/**
 * 财务核心收口 — 所有「钱」的计算与 ledger 写入唯一入口
 */
import {
  isEffectiveSale,
  EFFECTIVE_SALES_RULE_HINT,
  isConfirmedRefund,
  PROFIT_DEDUCTING_EXPENSE_TYPES,
  isProfitDeductingExpense,
  countsTowardBraceletCost,
} from '@jade-account/shared'
import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'
import { getSettingNumber } from '../services/settings.service'

export { EFFECTIVE_SALES_RULE_HINT, isConfirmedRefund }

const CERT_EXPENSE_TYPES = ['证书鉴定费']
const PACKAGE_EXPENSE_TYPES = ['包装耗材']
const EXPRESS_EXPENSE_TYPES = ['物流保险', '顺丰快递费']

export type LedgerBreakdownItem = {
  type: string
  amount: number
  refId: string
}

/** 统一财务返回结构 */
export type FinanceResult = {
  income: number
  cost: number
  refund: number
  compensation: number
  netProfit: number
  breakdown: LedgerBreakdownItem[]
}

export type SaleProfitInput = {
  id?: number
  saleAmount: unknown
  totalCostSnapshot: unknown
  grossProfit?: unknown
  finalProfit?: unknown
  compensationAmount?: unknown
  status?: string
  refunds?: { id?: number; refundAmount: unknown; status?: string | null }[]
  expenses?: {
    id?: number
    expenseType: string
    amount: unknown
    isVoided?: boolean
    businessType?: string | null
    saleId?: number | null
  }[]
}

export const PROFIT_DEDUCT_EXPENSE_INCLUDE = {
  where: {
    isVoided: false,
    OR: [
      { expenseType: { in: [...PROFIT_DEDUCTING_EXPENSE_TYPES] } },
      {
        businessType: {
          in: ['customer_refund', 'customer_compensation', 'after_sale_compensation', 'platform_fee'],
        },
      },
    ],
  },
}

/** @deprecated use PROFIT_DEDUCT_EXPENSE_INCLUDE */
export const COMPENSATION_EXPENSE_INCLUDE = PROFIT_DEDUCT_EXPENSE_INCLUDE

function confirmedRefundSum(refunds?: SaleProfitInput['refunds']): number {
  return (refunds || [])
    .filter((r) => isConfirmedRefund(r.status))
    .reduce((s, r) => s + toNumber(r.refundAmount as string | number), 0)
}

function resolveCompensationDeduction(sale: SaleProfitInput): {
  total: number
  items: LedgerBreakdownItem[]
} {
  if (sale.expenses?.length) {
    const items: LedgerBreakdownItem[] = []
    let total = 0
    for (const e of sale.expenses) {
      if (e.isVoided || !isProfitDeductingExpense(e)) continue
      const amt = toNumber(e.amount as string | number)
      total += amt
      items.push({
        type: e.businessType || e.expenseType || 'compensation',
        amount: amt,
        refId: String(e.id ?? `expense-${e.expenseType}`),
      })
    }
    return { total, items }
  }
  const fallback = toNumber(sale.compensationAmount as string | number)
  return {
    total: fallback,
    items: fallback > 0 ? [{ type: 'compensation', amount: fallback, refId: 'snapshot' }] : [],
  }
}

/** 单笔销售/货品利润 — 唯一计算入口 */
export function calculateProfit(sale: SaleProfitInput): FinanceResult {
  const income = toNumber(sale.saleAmount as string | number)
  const cost = toNumber(sale.totalCostSnapshot as string | number)
  const gross = sale.grossProfit != null
    ? toNumber(sale.grossProfit as string | number)
    : income - cost
  const refund = confirmedRefundSum(sale.refunds)
  const { total: compensation, items: compItems } = resolveCompensationDeduction(sale)
  const netProfit = gross - refund - compensation

  const breakdown: LedgerBreakdownItem[] = [
    { type: 'income', amount: income, refId: String(sale.id ?? 'sale') },
    { type: 'cost', amount: cost, refId: String(sale.id ?? 'sale') },
  ]
  for (const r of sale.refunds || []) {
    if (!isConfirmedRefund(r.status)) continue
    breakdown.push({
      type: 'refund',
      amount: toNumber(r.refundAmount as string | number),
      refId: String(r.id ?? 'refund'),
    })
  }
  breakdown.push(...compItems)

  return { income, cost, refund, compensation, netProfit, breakdown }
}

/** 兼容旧 API — 映射到 calculateProfit */
export function saleProfitRow(sale: SaleProfitInput & { status: string }) {
  const fin = calculateProfit(sale)
  const margin = fin.income > 0 ? (fin.netProfit / fin.income) * 100 : 0
  return {
    saleAmount: fin.income,
    cost: fin.cost,
    grossProfit: fin.income - fin.cost,
    refundAmount: fin.refund,
    compensationAmount: fin.compensation,
    customerPaymentDeduction: fin.compensation,
    profit: fin.netProfit,
    profitMargin: Math.round(margin * 100) / 100,
    finance: fin,
  }
}

export type ExpenseImpactInput = {
  expenseType: string
  businessType?: string | null
  amount: unknown
  saleId?: number | null
  isVoided?: boolean
}

/** 支出对利润/成本的影响 */
export function calculateExpenseImpact(expense: ExpenseImpactInput) {
  if (expense.isVoided) {
    return { affectsProfit: false, affectsCost: false, category: 'void' as const, amount: 0 }
  }
  const affectsProfit = isProfitDeductingExpense(expense)
  const affectsCost = countsTowardBraceletCost(expense)
  let category: 'compensation' | 'cost' | 'expense' = 'expense'
  if (affectsProfit) category = 'compensation'
  else if (affectsCost) category = 'cost'
  const amount = toNumber(expense.amount as string | number)
  return { affectsProfit, affectsCost, category, amount }
}

export type EffectiveSaleInput = {
  status: string
  afterSaleStatus?: string | null
  saleAmount?: unknown
  refunds?: { refundAmount: unknown; status?: string | null }[]
}

/** 有效成交聚合 */
export function calculateEffectiveSales(sales: EffectiveSaleInput[]) {
  let amount = 0
  let count = 0
  for (const s of sales) {
    if (!isEffectiveSale(s.status, s.afterSaleStatus)) continue
    const income = toNumber(s.saleAmount as string | number)
    const refund = confirmedRefundSum(s.refunds)
    amount += income - refund
    count += 1
  }
  return { effectiveSaleAmount: amount, effectiveOrderCount: count }
}

/**
 * 销售时总成本 — 唯一成本计算入口
 * 口径：入库成本 + 绑定货品且计入成本的支出 + 成本调整 + 必要默认费用（不重复）
 */
export async function calculateSaleCost(braceletId: number) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id: braceletId } })
  if (!bracelet) throw new Error('镯子不存在')

  const expenses = await prisma.expense.findMany({
    where: { braceletId, isVoided: false },
  })
  const expenseCost = expenses
    .filter((e) => countsTowardBraceletCost(e))
    .reduce((s, e) => s + toNumber(e.amount), 0)

  const inboundCost = toNumber(bracelet.inboundCost)
  const adjustments = await prisma.costAdjustment.findMany({ where: { braceletId } })
  const costAdjustment = adjustments.reduce((s, a) => s + toNumber(a.amount), 0)

  const hasExpenseType = (types: string[]) =>
    expenses.some((e) => types.includes(e.expenseType))

  const certificateFee = hasExpenseType(CERT_EXPENSE_TYPES)
    ? 0
    : await getSettingNumber('default_certificate_fee', 3)
  const packageFee = hasExpenseType(PACKAGE_EXPENSE_TYPES)
    ? 0
    : await getSettingNumber('default_package_fee', 10)
  const expressFee = hasExpenseType(EXPRESS_EXPENSE_TYPES)
    ? 0
    : await getSettingNumber('default_sf_express_fee', 18)

  const braceletCostTotal = inboundCost + expenseCost
  if (Math.abs(toNumber(bracelet.costTotal) - braceletCostTotal) > 0.001) {
    await prisma.bracelet.update({
      where: { id: braceletId },
      data: { costTotal: braceletCostTotal },
    })
  }

  const totalCost = braceletCostTotal + costAdjustment + certificateFee + packageFee + expressFee

  return {
    inboundCost,
    expenseCost,
    certificateFee,
    packageFee,
    expressFee,
    costAdjustment,
    totalCost,
  }
}

type LedgerWriteInput = {
  entryType: string
  refType: string
  refId: string
  saleId?: number | null
  braceletId?: number | null
  expenseId?: number | null
  category: string
  amount: number
  occurredAt: Date
  metadata?: Record<string, unknown>
}

type LedgerDb = Pick<typeof prisma, 'financeLedger' | 'sale' | 'expense'>

async function upsertLedgerEntry(input: LedgerWriteInput, db: LedgerDb = prisma) {
  const data = {
    entryType: input.entryType,
    refType: input.refType,
    refId: input.refId,
    saleId: input.saleId ?? null,
    braceletId: input.braceletId ?? null,
    expenseId: input.expenseId ?? null,
    category: input.category,
    amount: input.amount,
    occurredAt: input.occurredAt,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  }
  return db.financeLedger.upsert({
    where: {
      finance_ledger_ref_unique: {
        refType: input.refType,
        refId: input.refId,
        entryType: input.entryType,
      },
    },
    create: data,
    update: data,
  })
}

async function syncSaleLedgerCore(saleId: number, db: LedgerDb = prisma) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { refunds: true, expenses: { where: { isVoided: false } } },
  })
  if (!sale || sale.isTrialRun) return

  await db.financeLedger.deleteMany({ where: { saleId } })

  const fin = calculateProfit({
    id: sale.id,
    saleAmount: sale.saleAmount,
    totalCostSnapshot: sale.totalCostSnapshot,
    grossProfit: sale.grossProfit,
    refunds: sale.refunds,
    expenses: sale.expenses,
  })

  if (sale.status === 'sold' || sale.status === 'refunded') {
    await upsertLedgerEntry({
      entryType: 'sale_income',
      refType: 'sale',
      refId: String(saleId),
      saleId,
      braceletId: sale.braceletId,
      category: 'income',
      amount: fin.income,
      occurredAt: sale.soldAt,
    }, db)
    await upsertLedgerEntry({
      entryType: 'sale_cost',
      refType: 'sale',
      refId: `${saleId}:cost`,
      saleId,
      braceletId: sale.braceletId,
      category: 'cost',
      amount: fin.cost,
      occurredAt: sale.soldAt,
    }, db)
  }

  for (const r of sale.refunds) {
    if (!isConfirmedRefund(r.status)) continue
    await upsertLedgerEntry({
      entryType: 'refund',
      refType: 'refund',
      refId: String(r.id),
      saleId,
      braceletId: sale.braceletId,
      category: 'refund',
      amount: toNumber(r.refundAmount),
      occurredAt: r.refundedAt,
    }, db)
  }

  for (const e of sale.expenses) {
    if (!isProfitDeductingExpense(e)) continue
    await upsertLedgerEntry({
      entryType: 'customer_payment',
      refType: 'expense',
      refId: String(e.id),
      saleId,
      braceletId: e.braceletId,
      expenseId: e.id,
      category: 'compensation',
      amount: toNumber(e.amount),
      occurredAt: e.occurredAt,
      metadata: { expenseType: e.expenseType, businessType: e.businessType },
    }, db)
  }

  await db.sale.update({
    where: { id: saleId },
    data: { compensationAmount: fin.compensation, finalProfit: fin.netProfit },
  })
}

export async function syncSaleLedger(saleId: number) {
  await syncSaleLedgerCore(saleId)
}

/** 同步单笔支出分录 */
export async function syncExpenseLedger(expenseId: number) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } })
  if (!expense) return

  if (expense.isVoided) {
    await prisma.financeLedger.deleteMany({
      where: { refType: 'expense', refId: String(expenseId) },
    })
    if (expense.saleId) await syncSaleLedger(expense.saleId)
    return
  }

  const impact = calculateExpenseImpact(expense)
  if (impact.affectsProfit && !expense.saleId) {
    await upsertLedgerEntry({
      entryType: 'customer_payment',
      refType: 'expense',
      refId: String(expenseId),
      saleId: expense.saleId,
      braceletId: expense.braceletId,
      expenseId,
      category: 'compensation',
      amount: impact.amount,
      occurredAt: expense.occurredAt,
      metadata: { expenseType: expense.expenseType, businessType: expense.businessType },
    })
  } else if (!impact.affectsProfit) {
    await prisma.financeLedger.deleteMany({
      where: { refType: 'expense', refId: String(expenseId) },
    })
  }

  if (expense.saleId) {
    await syncSaleLedger(expense.saleId)
  }
}

/** 同步退款分录 */
export async function syncRefundLedger(refundId: number) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } })
  if (!refund) return
  await syncSaleLedger(refund.saleId)
}

async function countOrphanExpenses() {
  return prisma.expense.findMany({
    where: {
      isVoided: false,
      saleId: null,
      OR: [
        { businessType: { in: ['customer_refund', 'customer_compensation', 'after_sale_compensation', 'platform_fee'] } },
        { expenseType: { in: [...PROFIT_DEDUCTING_EXPENSE_TYPES] } },
      ],
    },
    select: { id: true },
  })
}

function estimateLedgerEntries(saleCount: number, orphanCount: number) {
  // 每笔销售至少 income + cost；orphan 支出各 1 条
  return saleCount * 2 + orphanCount
}

export type RebuildLedgerOptions = {
  dryRun?: boolean
  force?: boolean
}

export type RebuildLedgerResult = {
  dryRun: boolean
  sales: number
  orphanExpenses: number
  entriesBefore: number
  entriesAfter: number
  estimatedEntries?: number
  durationMs: number
}

/** 全量重建 finance_ledger */
export async function rebuildLedger(options: RebuildLedgerOptions = {}): Promise<RebuildLedgerResult> {
  const started = Date.now()
  const dryRun = options.dryRun === true
  const entriesBefore = await prisma.financeLedger.count()

  const sales = await prisma.sale.findMany({
    where: { isTrialRun: false },
    select: { id: true },
  })
  const orphanExpenses = await countOrphanExpenses()
  const estimatedEntries = estimateLedgerEntries(sales.length, orphanExpenses.length)

  if (dryRun) {
    return {
      dryRun: true,
      sales: sales.length,
      orphanExpenses: orphanExpenses.length,
      entriesBefore,
      entriesAfter: entriesBefore,
      estimatedEntries,
      durationMs: Date.now() - started,
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.financeLedger.deleteMany()
      for (const s of sales) {
        await syncSaleLedgerCore(s.id, tx)
      }
      for (const e of orphanExpenses) {
        const expense = await tx.expense.findUnique({ where: { id: e.id } })
        if (!expense || expense.isVoided) continue
        const impact = calculateExpenseImpact(expense)
        if (impact.affectsProfit) {
          await upsertLedgerEntry({
            entryType: 'customer_payment',
            refType: 'expense',
            refId: String(e.id),
            braceletId: expense.braceletId,
            expenseId: e.id,
            category: 'compensation',
            amount: impact.amount,
            occurredAt: expense.occurredAt,
            metadata: { expenseType: expense.expenseType, businessType: expense.businessType },
          }, tx)
        }
      }
    }, { timeout: 120000 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[rebuildLedger] failed:', msg)
    throw new Error(`rebuildLedger 失败: ${msg}`)
  }

  const entriesAfter = await prisma.financeLedger.count()
  const hasSourceData = sales.length > 0 || orphanExpenses.length > 0
  if (hasSourceData && entriesAfter === 0) {
    throw new Error('rebuildLedger 校验失败: 有销售/支出但 finance_ledger 为空')
  }

  return {
    dryRun: false,
    sales: sales.length,
    orphanExpenses: orphanExpenses.length,
    entriesBefore,
    entriesAfter,
    durationMs: Date.now() - started,
  }
}

/** 从 ledger 聚合销售利润（对账用） */
export async function aggregateProfitFromLedger(saleId: number): Promise<FinanceResult | null> {
  const rows = await prisma.financeLedger.findMany({ where: { saleId } })
  if (!rows.length) return null

  let income = 0
  let cost = 0
  let refund = 0
  let compensation = 0
  const breakdown: LedgerBreakdownItem[] = []

  for (const row of rows) {
    const amt = toNumber(row.amount)
    breakdown.push({ type: row.category, amount: amt, refId: row.refId })
    switch (row.category) {
      case 'income': income += amt; break
      case 'cost': cost += amt; break
      case 'refund': refund += amt; break
      case 'compensation': compensation += amt; break
      default: break
    }
  }

  const gross = income - cost
  return {
    income,
    cost,
    refund,
    compensation,
    netProfit: gross - refund - compensation,
    breakdown,
  }
}

/** 统计某销售在 ledger 中的分录数（测试/对账） */
export async function countLedgerEntriesForSale(saleId: number) {
  return prisma.financeLedger.count({ where: { saleId } })
}

/** 统计某支出在 ledger 中的分录数（测试/对账） */
export async function countLedgerEntriesForExpense(expenseId: number) {
  return prisma.financeLedger.count({
    where: { refType: 'expense', refId: String(expenseId) },
  })
}
