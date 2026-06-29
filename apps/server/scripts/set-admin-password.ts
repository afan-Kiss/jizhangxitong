import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

const password = process.env.ADMIN_PASSWORD
if (!password) {
  console.error('缺少 ADMIN_PASSWORD')
  process.exit(1)
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!admin) {
    console.error('未找到 admin')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: admin.id }, data: { password: hash } })
  console.log('本地 admin 密码已更新')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
