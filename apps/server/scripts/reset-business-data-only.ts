/**
 * 清除业务/测试流水，保留全部用户与基础配置（Role、Permission、SystemSetting、ConfigOption 等）
 */
import { prisma } from '../src/lib/prisma'
import { assertSafeDatabaseUrl } from '../src/lib/prod-db-guard'

assertSafeDatabaseUrl()

async function deleteBusinessData() {
  await prisma.expenseAttachment.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.costAdjustment.deleteMany()
  await prisma.financeLedger.deleteMany()
  await prisma.exportTask.deleteMany()
  await prisma.scanBinding.deleteMany()
  await prisma.scanOrderDraft.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.file.deleteMany()
  await prisma.bracelet.deleteMany()
  await prisma.operationLog.deleteMany()
  await prisma.localWorkerConnection.deleteMany()
}

async function printSummary() {
  const [users, expenses, sales, bracelets, ledger, files, logs] = await Promise.all([
    prisma.user.count(),
    prisma.expense.count(),
    prisma.sale.count(),
    prisma.bracelet.count(),
    prisma.financeLedger.count(),
    prisma.file.count(),
    prisma.operationLog.count(),
  ])
  const userList = await prisma.user.findMany({
    select: { username: true, name: true, status: true },
    orderBy: { id: 'asc' },
  })
  console.log('--- 清理结果 ---')
  console.log(`用户数量（未改动）: ${users}`)
  userList.forEach((u) => console.log(`  - ${u.username} (${u.name}) ${u.status}`))
  console.log(`支出数量: ${expenses}`)
  console.log(`销售数量: ${sales}`)
  console.log(`货品数量: ${bracelets}`)
  console.log(`财务分录数量: ${ledger}`)
  console.log(`文件数量: ${files}`)
  console.log(`操作日志数量: ${logs}`)
}

async function main() {
  console.log('\n=== 清除业务数据，保留全部用户 ===\n')
  await deleteBusinessData()
  await printSummary()
  console.log('\n完成。用户账号与密码均未改动。\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
