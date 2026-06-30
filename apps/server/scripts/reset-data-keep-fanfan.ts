import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const FANFAN_USERNAME = 'fanfan'
const FANFAN_PASSWORD = process.env.FANFAN_PASSWORD || 'fanfan123456'

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

async function ensureFanfanAdmin() {
  const adminRole = await prisma.role.findUnique({ where: { name: '管理员' } })
  if (!adminRole) throw new Error('未找到管理员角色，请先 npm run db:seed')

  const hash = await bcrypt.hash(FANFAN_PASSWORD, 10)
  const fanfan = await prisma.user.upsert({
    where: { username: FANFAN_USERNAME },
    create: {
      username: FANFAN_USERNAME,
      password: hash,
      name: '管理员',
      status: 'active',
      isActive: true,
      approvedAt: new Date(),
    },
    update: {
      password: hash,
      name: '管理员',
      status: 'active',
      isActive: true,
      approvedAt: new Date(),
      rejectedAt: null,
      rejectedByUserId: null,
    },
  })

  await prisma.userRole.deleteMany({ where: { userId: fanfan.id } })
  await prisma.userRole.create({ data: { userId: fanfan.id, roleId: adminRole.id } })
  return fanfan
}

async function removeOtherUsers(fanfanId: number) {
  const others = await prisma.user.findMany({ where: { id: { not: fanfanId } } })
  for (const u of others) {
    await prisma.userRole.deleteMany({ where: { userId: u.id } })
  }
  await prisma.user.deleteMany({ where: { id: { not: fanfanId } } })
}

async function printSummary() {
  const [users, expenses, sales, bracelets, ledger, files] = await Promise.all([
    prisma.user.count(),
    prisma.expense.count(),
    prisma.sale.count(),
    prisma.bracelet.count(),
    prisma.financeLedger.count(),
    prisma.file.count(),
  ])
  console.log('--- 清理结果 ---')
  console.log(`保留用户数量: ${users}`)
  console.log(`支出数量: ${expenses}`)
  console.log(`销售数量: ${sales}`)
  console.log(`货品数量: ${bracelets}`)
  console.log(`财务分录数量: ${ledger}`)
  console.log(`文件数量: ${files}`)
}

async function main() {
  console.log('\n=== 清除测试数据，只保留 fanfan 管理员 ===\n')
  await deleteBusinessData()
  const fanfan = await ensureFanfanAdmin()
  await removeOtherUsers(fanfan.id)
  await printSummary()
  console.log(`\nfanfan 默认密码: ${FANFAN_PASSWORD}\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
