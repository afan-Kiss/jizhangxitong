import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/prisma'

function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}

async function main() {
  const root = path.join(__dirname, '../../..')
  const secretsDir = path.join(root, 'secrets')
  const passwordFile = path.join(secretsDir, 'initial-admin-password.txt')
  const markerFile = path.join(secretsDir, '.admin-setup-done')

  await fs.mkdir(secretsDir, { recursive: true })

  const markerExists = await fs.access(markerFile).then(() => true).catch(() => false)
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } })
  if (!admin) {
    console.log('未找到 admin 用户，请先 npm run db:seed')
    process.exit(1)
  }

  const isDefault = await bcrypt.compare('admin123', admin.password)
  if (!isDefault) {
    console.log('admin 密码已不是默认 admin123，跳过修改')
    if (!markerExists) await fs.writeFile(markerFile, new Date().toISOString(), 'utf-8')
    return
  }

  if (markerExists) {
    console.log('检测到 setup:admin 已执行过，但密码仍为默认值，将重新生成')
  }

  const newPassword = generatePassword(16)
  const hash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: admin.id }, data: { password: hash } })

  const stillDefault = await bcrypt.compare('admin123', hash)
  const newOk = await bcrypt.compare(newPassword, hash)
  if (stillDefault || !newOk) throw new Error('密码更新验证失败')

  const content = [
    '和田玉镯子记账系统 - 管理员初始密码',
    `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    '用户名: admin',
    `密码: ${newPassword}`,
    '',
    '请登录后立即在系统中修改密码。',
    '此文件仅保存在本地，不会上传到 Git。',
  ].join('\n')
  await fs.writeFile(passwordFile, content, 'utf-8')
  await fs.writeFile(markerFile, new Date().toISOString(), 'utf-8')

  console.log('已生成新 admin 密码并写入 secrets/initial-admin-password.txt')
  console.log(`新密码（仅显示一次）: ${newPassword}`)
  console.log('旧密码 admin123 已失效')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
