/**
 * 测试/验收用：在 apps/server 目录执行 core-ledger 操作
 * 用法: node scripts/ledger-test-runner.mjs <action> [jsonArgs]
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./data/accounting.db'

const action = process.argv[2]
const rawArgs = process.argv[3] || '{}'
const args = JSON.parse(rawArgs)

import { prisma } from '../dist/lib/prisma.js'
import {
  syncSaleLedger,
  syncExpenseLedger,
  countLedgerEntriesForSale,
  countLedgerEntriesForExpense,
  aggregateProfitFromLedger,
} from '../dist/finance/core-ledger.js'

async function main() {
  switch (action) {
    case 'sync-sale-repeated': {
      const { saleId, times = 3 } = args
      const counts = []
      for (let i = 0; i < times; i++) {
        await syncSaleLedger(saleId)
        counts.push(await countLedgerEntriesForSale(saleId))
      }
      console.log(JSON.stringify(counts))
      break
    }
    case 'sync-expense-repeated': {
      const { expenseId, times = 3 } = args
      const counts = []
      for (let i = 0; i < times; i++) {
        await syncExpenseLedger(expenseId)
        counts.push(await countLedgerEntriesForExpense(expenseId))
      }
      console.log(JSON.stringify(counts))
      break
    }
    case 'aggregate-profit': {
      const agg = await aggregateProfitFromLedger(args.saleId)
      console.log(JSON.stringify(agg))
      break
    }
    case 'set-inbound-cost': {
      await prisma.bracelet.update({
        where: { id: args.braceletId },
        data: { inboundCost: args.inboundCost },
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }
    case 'inject-orphan-ledger': {
      const row = await prisma.financeLedger.create({
        data: {
          entryType: 'customer_payment',
          refType: 'expense',
          refId: String(args.refId || `orphan-${Date.now()}`),
          expenseId: args.expenseId ?? null,
          category: 'compensation',
          amount: args.amount ?? 9.99,
          occurredAt: args.date ? new Date(`${args.date}T12:00:00`) : new Date(),
        },
      })
      console.log(JSON.stringify({ id: row.id, refId: row.refId }))
      break
    }
    case 'inject-duplicate-expense-ledger': {
      const expenseId = args.expenseId
      const date = args.date || new Date().toISOString().slice(0, 10)
      const ids = []
      for (let i = 0; i < 2; i++) {
        const row = await prisma.financeLedger.create({
          data: {
            entryType: i === 0 ? 'customer_payment' : 'customer_payment_dup',
            refType: 'expense',
            refId: `${expenseId}-dup-${i}`,
            expenseId,
            category: 'compensation',
            amount: args.amount ?? 5.55,
            occurredAt: new Date(`${date}T12:00:00`),
          },
        })
        ids.push(row.id)
      }
      console.log(JSON.stringify({ ids }))
      break
    }
    case 'cleanup-ledger-by-ref': {
      const deleted = await prisma.financeLedger.deleteMany({
        where: { refId: String(args.refId) },
      })
      console.log(JSON.stringify({ deleted: deleted.count }))
      break
    }
    case 'cleanup-ledger-by-ids': {
      const deleted = await prisma.financeLedger.deleteMany({
        where: { id: { in: args.ids || [] } },
      })
      console.log(JSON.stringify({ deleted: deleted.count }))
      break
    }
    default:
      throw new Error(`unknown action: ${action}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
