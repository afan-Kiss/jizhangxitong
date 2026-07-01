import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { assertSafeDatabaseUrl } from '../src/lib/prod-db-guard'

assertSafeDatabaseUrl()

const FANFAN_USERNAME = 'fanfan'
/** 仅新建 fanfan 时使用；已存在则绝不改密码 */
const FANFAN_PASSWORD_FOR_CREATE = process.env.FANFAN_PASSWORD || 'fanfan123456'

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

  const existing = await prisma.user.findUnique({ where: { username: FANFAN_USERNAME } })

  const fanfan = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          isActive: true,
          approvedAt: existing.approvedAt || new Date(),
          rejectedAt: null,
          rejectedByUserId: null,
        },
      })
    : await prisma.user.create({
        data: {
          username: FANFAN_USERNAME,
          password: await bcrypt.hash(FANFAN_PASSWORD_FOR_CREATE, 10),
          name: '管理员',
          status: 'active',
          isActive: true,
          approvedAt: new Date(),
        },
      })

  await prisma.userRole.deleteMany({ where: { userId: fanfan.id } })
  await prisma.userRole.create({ data: { userId: fanfan.id, roleId: adminRole.id } })
  return { fanfan, created: !existing }
}

async function removeOtherUsers(fanfanId: number) {
  const others = await prisma.user.findMany({ where: { id: { not: fanfanId } } })
  for (const u of others) {
    await prisma.userRole.deleteMany({ where: { userId: u.id } })
  }
  await prisma.user.deleteMany({ where: { id: { not: fanfanId } } })
}

async function printSummary() {
  const [users, expenses, sales, bracelets, ledger, files, logs, fanfan] = await Promise.all([
    prisma.user.count(),
    prisma.expense.count(),
    prisma.sale.count(),
    prisma.bracelet.count(),
    prisma.financeLedger.count(),
    prisma.file.count(),
    prisma.operationLog.count(),
    prisma.user.findUnique({ where: { username: FANFAN_USERNAME } }),
  ])
  console.log('--- 清理结果 ---')
  console.log(`保留用户数量: ${users}`)
  console.log(`fanfan 状态: ${fanfan?.status || 'missing'} / active=${fanfan?.isActive}`)
  console.log(`支出数量: ${expenses}`)
  console.log(`销售数量: ${sales}`)
  console.log(`货品数量: ${bracelets}`)
  console.log(`财务分录数量: ${ledger}`)
  console.log(`文件数量: ${files}`)
  console.log(`操作日志数量: ${logs}`)
}

async function main() {
  console.log('\n=== 清除测试数据，只保留 fanfan 管理员 ===\n')
  await deleteBusinessData()
  const { fanfan, created } = await ensureFanfanAdmin()
  await removeOtherUsers(fanfan.id)
  await printSummary()
  if (created) {
    console.log(`\n已新建 fanfan，初始密码: ${FANFAN_PASSWORD_FOR_CREATE}\n`)
  } else {
    console.log('\nfanfan 已存在，密码未改动。\n')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
