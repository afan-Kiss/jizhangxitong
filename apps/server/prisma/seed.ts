import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'
import { DEFAULT_SETTINGS, EXPENSE_TYPES, PAY_SOURCES } from '@jade-account/shared'
import { seedPermissions } from '../src/routes/settings.routes'

async function seedConfigOptions(category: string, values: readonly string[]) {
  let order = 0
  for (const value of values) {
    const existing = await prisma.configOption.findFirst({ where: { category, value } })
    if (existing) {
      await prisma.configOption.update({
        where: { id: existing.id },
        data: { label: value, sortOrder: order },
      })
    } else {
      await prisma.configOption.create({
        data: { category, value, label: value, sortOrder: order },
      })
    }
    order++
  }
}

async function main() {
  await seedPermissions()

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { settingKey: key },
      create: { settingKey: key, settingValue: value, valueType: 'string' },
      update: {},
    })
  }

  await seedConfigOptions('expense_type', EXPENSE_TYPES)
  await seedConfigOptions('pay_source', PAY_SOURCES)

  const allPerms = await prisma.permission.findMany()
  const adminRole = await prisma.role.upsert({
    where: { name: '管理员' },
    create: { name: '管理员', description: '全部权限' },
    update: {},
  })

  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      create: { roleId: adminRole.id, permissionId: perm.id },
      update: {},
    })
  }

  const password = await bcrypt.hash('fanfan9724', 10)
  const adminUser = await prisma.user.upsert({
    where: { username: 'fanfan' },
    create: { username: 'fanfan', password, name: '管理员', status: 'active', isActive: true, approvedAt: new Date() },
    update: { status: 'active', isActive: true },
  })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    create: { userId: adminUser.id, roleId: adminRole.id },
    update: {},
  })

  console.log('Seed completed. Default login: fanfan / fanfan9724')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
