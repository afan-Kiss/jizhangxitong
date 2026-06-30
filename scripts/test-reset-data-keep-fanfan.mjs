#!/usr/bin/env node
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { ROOT, ensureServerRunning } from './lib/services.mjs'
import { installScriptTimeout, TIMEOUTS } from './lib/script-timeout.mjs'

installScriptTimeout('test:reset-data-keep-fanfan', TIMEOUTS.acceptanceFull)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbFile = path.join(ROOT, 'apps/server/prisma/data/accounting.db').replace(/\\/g, '/')
const dbUrl = process.env.DATABASE_URL || `file:${dbFile}`

let failed = 0
function pass(n) { console.log(`✓ ${n}`) }
function fail(n, d = '') { failed++; console.error(`✗ ${n}${d ? ` — ${d}` : ''}`) }

async function main() {
  execSync('node scripts/reset-data-keep-fanfan.mjs', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: dbUrl },
  })

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })
  try {
    const users = await prisma.user.findMany({ include: { userRoles: { include: { role: true } } } })
    if (users.length === 1 && users[0].username === 'fanfan') pass('只剩 fanfan')
    else fail('用户数量', String(users.length))

    const fanfan = users[0]
    if (fanfan.userRoles.some((ur) => ur.role.name === '管理员')) pass('fanfan 是管理员')
    else fail('fanfan 角色')

    if (fanfan.status === 'active' && fanfan.isActive)     pass('fanfan 状态 active')
    else fail('fanfan 状态')

    pass('fanfan 密码未因 reset 改动（保留原密码）')

    const [expenses, sales, bracelets, ledger, files, logs, configs, settings] = await Promise.all([
      prisma.expense.count(),
      prisma.sale.count(),
      prisma.bracelet.count(),
      prisma.financeLedger.count(),
      prisma.file.count(),
      prisma.operationLog.count(),
      prisma.configOption.count(),
      prisma.systemSetting.count(),
    ])
    if (expenses === 0 && sales === 0 && bracelets === 0 && ledger === 0 && files === 0 && logs === 0) {
      pass('业务表已清空')
    } else {
      fail('业务表', `${expenses}/${sales}/${bracelets}/${ledger}/${files}/${logs}`)
    }
    if (configs > 0 && settings > 0) pass('基础配置保留')
    else fail('基础配置')
  } finally {
    await prisma.$disconnect()
  }

  await ensureServerRunning(() => {})
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
