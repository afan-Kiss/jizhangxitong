/**
 * 生产数据库准备（不破坏本地 SQLite）
 */
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { readEnvFile, getEnvValue } from './lib/env-utils.mjs'
import { ROOT, fetchJson } from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENV = path.join(ROOT, 'apps/server/.env')

async function main() {
  console.log('\n========== 生产数据库准备 db:prepare-prod ==========\n')

  const env = await readEnvFile(SERVER_ENV)
  if (!env) {
    console.log('未找到 apps/server/.env，请先复制 .env.example')
    process.exit(1)
  }

  const dbUrl = getEnvValue(env, 'DATABASE_URL') || ''
  const isSqlite = dbUrl.startsWith('file:') || dbUrl.includes('sqlite')

  if (isSqlite || !dbUrl) {
    console.log('当前 DATABASE_URL 为 SQLite 开发模式，适合本地开发。')
    console.log('上生产前请将 DATABASE_URL 改为 MySQL/PostgreSQL 后再运行本命令。')
    console.log('示例见 apps/server/.env.example')
    process.exit(0)
  }

  const isMysql = dbUrl.startsWith('mysql')
  const isPg = dbUrl.startsWith('postgresql')
  if (!isMysql && !isPg) {
    console.log(`无法识别的 DATABASE_URL 类型: ${dbUrl.slice(0, 30)}...`)
    process.exit(1)
  }

  console.log(`检测到生产数据库: ${isMysql ? 'MySQL' : 'PostgreSQL'}`)
  console.log('正在 prisma db push...')
  execSync('npm run db:push -w @jade-account/server', { cwd: ROOT, stdio: 'inherit' })

  console.log('正在 seed...')
  execSync('npm run db:seed -w @jade-account/server', { cwd: ROOT, stdio: 'inherit' })

  console.log('正在测试登录...')
  try {
    const res = await fetchJson('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    if (res.res.ok) {
      console.log('登录测试: admin/admin123 可用（生产环境请立即 npm run setup:admin）')
    } else {
      console.log('登录测试: 默认密码不可用，可能已 setup:admin，请查 secrets/initial-admin-password.txt')
    }
  } catch {
    console.log('登录测试: 服务端未运行，请先 npm run start:prod 后再验证')
  }

  console.log('\ndb:prepare-prod 完成\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
