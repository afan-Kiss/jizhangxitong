/**
 * 备份数据库并清空全部业务测试数据，保留用户/角色/权限/系统配置。
 */
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { prisma } from '../src/lib/prisma'
import { assertSafeDatabaseUrl } from '../src/lib/prod-db-guard'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

if (!process.env.ALLOW_PROD_DATA_RESET) {
  assertSafeDatabaseUrl()
}

function resolveDbPath(): string {
  const url = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '')
  const candidates: string[] = []
  const fileMatch = url.match(/^file:(.+)$/i)
  if (fileMatch) {
    const raw = fileMatch[1].replace(/^\/+([A-Za-z]:)/, '$1')
    candidates.push(path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw))
  }
  candidates.push(path.resolve(process.cwd(), 'prisma/data/accounting.db'))
  candidates.push(path.resolve(process.cwd(), 'data/accounting.db'))
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`数据库不存在，已尝试: ${[...new Set(candidates)].join(' | ')}`)
}

function gitHead(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

async function backupDatabase(dbPath: string): Promise<string> {
  const root = path.resolve(process.cwd(), '../..')
  const backupDir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(root, 'data', 'backups')
  await fs.promises.mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const head = gitHead()
  const backupName = `accounting-${stamp}-${head}.db`
  const backupPath = path.join(backupDir, backupName)
  await fs.promises.copyFile(dbPath, backupPath)
  return backupPath
}

async function deleteBusinessData() {
  await prisma.expenseAttachment.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.financeShareLink.deleteMany()
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
  const [users, expenses, sales, bracelets, shareLinks, files, logs, settings] = await Promise.all([
    prisma.user.count(),
    prisma.expense.count(),
    prisma.sale.count(),
    prisma.bracelet.count(),
    prisma.financeShareLink.count(),
    prisma.file.count(),
    prisma.operationLog.count(),
    prisma.systemSetting.count(),
  ])
  const userList = await prisma.user.findMany({
    select: { username: true, name: true, status: true },
    orderBy: { id: 'asc' },
  })
  console.log('--- 清理结果 ---')
  console.log(`用户（保留）: ${users}`)
  userList.forEach((u) => console.log(`  - ${u.username} (${u.name}) ${u.status}`))
  console.log(`系统配置项（保留）: ${settings}`)
  console.log(`支出: ${expenses} | 销售: ${sales} | 货品: ${bracelets}`)
  console.log(`财务外链: ${shareLinks} | 文件: ${files} | 操作日志: ${logs}`)
}

async function main() {
  const dbPath = resolveDbPath()
  if (!fs.existsSync(dbPath)) throw new Error(`数据库不存在: ${dbPath}`)

  console.log('\n=== 备份并清空业务数据 ===\n')
  console.log(`数据库: ${dbPath}`)

  const backupPath = await backupDatabase(dbPath)
  console.log(`已备份: ${backupPath}`)

  await deleteBusinessData()
  await printSummary()
  console.log('\n完成。账号、角色、权限、SystemSetting 均未改动。\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
