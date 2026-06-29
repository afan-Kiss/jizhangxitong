/**
 * 重置默认 admin/admin123 为强密码
 */
import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROOT, fetchJson, login as doLogin } from './lib/services.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PASSWORD_FILE = path.join(ROOT, 'secrets/initial-admin-password.txt')

async function main() {
  console.log('\n========== 管理员密码 setup:admin ==========\n')

  execSync('npx tsx apps/server/scripts/setup-admin.ts', { cwd: ROOT, stdio: 'inherit' })

  let newPassword = null
  try {
    const text = await fs.readFile(PASSWORD_FILE, 'utf-8')
    const m = text.match(/密码:\s*(.+)/)
    newPassword = m?.[1]?.trim()
  } catch { /* skip */ }

  if (newPassword) {
    const oldTry = await fetchJson('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    const oldBlocked = !oldTry.res.ok
    console.log(`旧密码 admin123 登录: ${oldBlocked ? '已失效 ✓' : '仍可登录 ✗'}`)

    const newTry = await fetchJson('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: newPassword }),
    })
    console.log(`新密码登录: ${newTry.res.ok ? '成功 ✓' : '失败 ✗'}`)
  } else {
    console.log('密码文件未更新或 admin 已不是默认密码，跳过登录验证')
  }

  console.log('\nsetup:admin 完成\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
