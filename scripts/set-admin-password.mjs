/**
 * 设置 admin 密码（本地或指定 ADMIN_PASSWORD）
 * 用法: ADMIN_PASSWORD=your-secret node scripts/set-admin-password.mjs
 */
import bcrypt from 'bcryptjs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const password = process.env.ADMIN_PASSWORD || process.argv[2]

if (!password) {
  console.error('请设置 ADMIN_PASSWORD 或传入密码参数')
  process.exit(1)
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:./apps/server/prisma/data/accounting.db' } },
})

async function main() {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!admin) {
    console.error('未找到 admin，请先 db:seed')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: admin.id }, data: { password: hash } })

  const secretsDir = path.join(ROOT, 'secrets')
  await fs.mkdir(secretsDir, { recursive: true })
  await fs.writeFile(
    path.join(secretsDir, 'initial-admin-password.txt'),
    [
      '和田玉镯子记账系统 - 管理员密码',
      `更新时间: ${new Date().toLocaleString('zh-CN')}`,
      '用户名: admin',
      `密码: ${password}`,
      '',
    ].join('\n'),
    'utf-8',
  )
  console.log('admin 密码已更新')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
