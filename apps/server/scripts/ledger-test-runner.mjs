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
