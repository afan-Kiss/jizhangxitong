import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'
import { AuthRequest } from '../middleware/auth'
import { writeOperationLog } from './operation-log.service'
import { findBraceletByExactCode, presentBracelet } from './bracelet.service'
import { calculateSaleCost } from './sale.service'

const STATUS_LABELS: Record<string, string> = {
  in_stock: '在库',
  sold: '已售',
  processing: '加工中',
  customer_hold: '客户留货',
  returned: '退回中',
  returned_available: '退回中',
}

export function presentGoods(bracelet: {
  id: number
  braceletCode: string
  name?: string | null
  category?: string | null
  scannerStatus?: string | null
  costTotal?: unknown
  inboundCost?: unknown
  certificateNo?: string | null
  createdAt: Date
  updatedAt: Date
}, extra?: { salePrice?: number; soldAt?: Date | null }) {
  const status = bracelet.scannerStatus || 'in_stock'
  return {
    id: bracelet.id,
    code: bracelet.braceletCode,
    name: bracelet.name || bracelet.certificateNo || bracelet.braceletCode,
    category: bracelet.category || '和田玉',
    status,
    statusLabel: STATUS_LABELS[status] || status,
    costTotal: toNumber(bracelet.costTotal as string | number),
    inboundCost: toNumber(bracelet.inboundCost as string | number),
    salePrice: extra?.salePrice ?? null,
    soldAt: extra?.soldAt ?? null,
    createdAt: bracelet.createdAt,
    updatedAt: bracelet.updatedAt,
  }
}

export async function refreshBraceletCostTotal(braceletId: number) {
  const agg = await prisma.expense.aggregate({
    where: { braceletId, isVoided: false },
    _sum: { amount: true },
  })
  const expenseSum = toNumber(agg._sum.amount)
  const bracelet = await prisma.bracelet.findUnique({ where: { id: braceletId } })
  if (!bracelet) return null
  const costTotal = expenseSum + toNumber(bracelet.inboundCost)
  return prisma.bracelet.update({
    where: { id: braceletId },
    data: { costTotal },
  })
}

export async function createGoodsFromScan(
  input: { code: string; name?: string; category?: string; status?: string },
  operator: AuthRequest['user'],
) {
  const code = input.code.trim().toUpperCase()
  if (!code) throw new Error('货品编码不能为空')

  const existing = await findBraceletByExactCode(code)
  if (existing) throw new Error('这个编码已经有货品了')

  const bracelet = await prisma.bracelet.create({
    data: {
      braceletCode: code,
      certificateNo: code,
      barcodeValue: code,
      name: input.name?.trim() || code,
      category: input.category || '和田玉',
      scannerStatus: input.status || 'in_stock',
      inboundCost: 0,
      costTotal: 0,
    },
  })

  await writeOperationLog({
    module: 'goods',
    action: 'create_goods',
    targetType: 'bracelet',
    targetId: bracelet.id,
    targetCode: bracelet.braceletCode,
    afterJson: presentGoods(bracelet),
    operator,
  })

  return presentGoods(bracelet)
}

export async function getGoodsById(id: number) {
  const bracelet = await prisma.bracelet.findUnique({ where: { id } })
  if (!bracelet) return null
  const lastSale = await prisma.sale.findFirst({
    where: { braceletId: id, status: 'sold' },
    orderBy: { soldAt: 'desc' },
  })
  return presentGoods(bracelet, {
    salePrice: lastSale ? toNumber(lastSale.saleAmount) : undefined,
    soldAt: lastSale?.soldAt ?? null,
  })
}

export async function getGoodsByCode(code: string) {
  const bracelet = await findBraceletByExactCode(code)
  if (!bracelet) return null
  return getGoodsById(bracelet.id)
}

export async function getGoodsCostDetail(braceletId: number) {
  const goods = await getGoodsById(braceletId)
  if (!goods) throw new Error('没找到这个货品')
  const expenses = await prisma.expense.findMany({
    where: { braceletId, isVoided: false },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  })
  let saleCost
  try {
    saleCost = await calculateSaleCost(braceletId)
  } catch {
    saleCost = null
  }
  return { goods, expenses, saleCost }
}

export { presentBracelet }
