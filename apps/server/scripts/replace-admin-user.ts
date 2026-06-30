import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const USERNAME = (process.env.ADMIN_USERNAME || 'fanfan').trim()
const PASSWORD = process.env.ADMIN_PASSWORD || ''
const DELETE_ADMIN = process.env.DELETE_ADMIN !== 'false'

async function main() {
  if (!PASSWORD) {
    console.error('请设置 ADMIN_PASSWORD 环境变量')
    process.exit(1)
  }

  const adminRole = await prisma.role.findUnique({ where: { name: '管理员' } })
  if (!adminRole) {
    console.error('未找到「管理员」角色，请先执行 npm run db:seed')
    process.exit(1)
  }

  const hash = await bcrypt.hash(PASSWORD, 10)
  const user = await prisma.user.upsert({
    where: { username: USERNAME },
    create: { username: USERNAME, password: hash, name: '管理员' },
    update: { password: hash, name: '管理员', isActive: true },
  })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    create: { userId: user.id, roleId: adminRole.id },
    update: {},
  })

  const permCount = await prisma.rolePermission.count({ where: { roleId: adminRole.id } })
  console.log(`已设置管理员账号: ${USERNAME}（角色权限 ${permCount} 项）`)

  const oldAdmin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (oldAdmin && DELETE_ADMIN) {
    if (oldAdmin.id === user.id) {
      console.log('admin 与目标账号相同，跳过删除')
    } else {
      await prisma.user.delete({ where: { id: oldAdmin.id } })
      console.log('已删除 admin 用户')
    }
  } else if (oldAdmin) {
    console.log('保留 admin 用户（DELETE_ADMIN=false）')
  }

  const ok = await bcrypt.compare(PASSWORD, hash)
  if (!ok) throw new Error('密码哈希验证失败')
  console.log('密码验证通过')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
