import { prisma } from '../lib/prisma'
import { toNumber } from '../lib/utils'

/** 启动时作废遗留试用数据，避免污染正式统计 */
export async function cleanupLegacyTrialData() {
  const trialExpenses = await prisma.expense.findMany({
    where: { isTrialRun: true, isVoided: false },
    select: { id: true },
  })
  if (trialExpenses.length) {
    await prisma.expense.updateMany({
      where: { id: { in: trialExpenses.map((e) => e.id) } },
      data: {
        isVoided: true,
        voidReason: 'legacy trial data auto voided',
        voidedAt: new Date(),
      },
    })
    console.log(`[startup] 已作废 ${trialExpenses.length} 笔遗留试用支出`)
  }

  const trialSales = await prisma.sale.findMany({
    where: { isTrialRun: true, status: 'sold' },
  })
  for (const sale of trialSales) {
    await prisma.refund.create({
      data: {
        saleId: sale.id,
        braceletId: sale.braceletId,
        braceletCode: sale.braceletCode,
        refundAmount: toNumber(sale.saleAmount),
        refundReason: 'legacy trial data auto refunded',
        refundedAt: new Date(),
        createdBy: sale.createdBy,
      },
    })
    await prisma.sale.update({ where: { id: sale.id }, data: { status: 'refunded' } })
    await prisma.bracelet.update({
      where: { id: sale.braceletId },
      data: { scannerStatus: 'returned_available' },
    }).catch(() => {})
  }
  if (trialSales.length) {
    console.log(`[startup] 已退款 ${trialSales.length} 笔遗留试用销售`)
  }

  await prisma.systemSetting.updateMany({
    where: { settingKey: 'trial_mode_enabled' },
    data: { settingValue: 'false' },
  }).catch(() => {})
}
