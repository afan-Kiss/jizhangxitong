/**
 * 系统一键体检 - 输出 Markdown + HTML 报告
 */
import fs from 'fs/promises'
import path from 'path'
import { execSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  ROOT, SERVER, fetchJson, getAdminPassword, login,
} from './lib/services.mjs'
import { readEnvFile, getEnvValue, isWeakJwtSecret, isWeakWorkerToken } from './lib/env-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function runPs(scriptName) {
  try {
    const r = spawnSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(ROOT, 'scripts/windows', scriptName),
    ], { encoding: 'utf-8', cwd: ROOT })
    return (r.stdout || '') + (r.stderr || '')
  } catch (e) {
    return String(e.message)
  }
}

async function tcpOk(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
    return res.status < 500
  } catch {
    return port === 3001 ? false : false
  }
}

async function main() {
  const items = []
  const add = (level, title, detail) => items.push({ level, title, detail })

  // 1. Server
  try {
    const h = await fetchJson(`${SERVER}/api/health`)
    add('ok', '记账服务端', h.res.ok ? '运行正常，可以登录和使用' : `异常: ${h.text}`)
  } catch {
    add('warn', '记账服务端', '未启动或无法访问，请运行 npm run dev:server')
  }

  // 2. Worker
  try {
    const token = await login()
    const w = await fetchJson(`${SERVER}/api/local-worker/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    add(w.json.data?.online ? 'ok' : 'warn', '本地 Worker',
      w.json.data?.online ? '本地电脑已连接，可以查看和保存图片' : '未连接，图片上传/导出可能失败')
  } catch (e) {
    add('warn', '本地 Worker', `无法验证: ${e.message}`)
  }

  // 3. 本地图片目录
  try {
    await fs.access('D:/jewelry-account-files')
    add('ok', '本地图片目录', 'D:/jewelry-account-files 存在')
  } catch {
    add('warn', '本地图片目录', '目录不存在，Worker 首次运行会自动创建')
  }

  // 5. Database
  const env = await readEnvFile(path.join(ROOT, 'apps/server/.env'))
  const dbUrl = env ? getEnvValue(env, 'DATABASE_URL') : ''
  if (!dbUrl || dbUrl.startsWith('file:')) {
    add('info', '数据库', '当前使用 SQLite，只适合本地开发；上阿里云请换 MySQL/PostgreSQL')
  } else {
    add('ok', '数据库', `已配置生产数据库 (${dbUrl.split(':')[0]})`)
  }

  // 6. Autostart
  try {
    const { spawnSync } = await import('child_process')
    const r = spawnSync('node', [path.join(ROOT, 'scripts/check-autostart.mjs')], { encoding: 'utf-8', cwd: ROOT })
    const out = r.stdout || ''
    if (out.includes('已配置好')) {
      add('ok', '开机自启', 'Worker 和扫码枪自启已配置且服务在运行')
    } else if (out.includes('未配置')) {
      add('warn', '开机自启', '尚未配置。请双击「一键安装自启.bat」或桌面「安装和田玉记账系统自启」')
    } else if (out.includes('配置了但没启动') || out.includes('启动了但接口不通')) {
      add('warn', '开机自启', '任务已注册但服务未就绪')
    } else {
      add('info', '开机自启', '请运行 check-autostart 查看详情')
    }
  } catch {
    add('info', '开机自启', '无法检测')
  }

  // 7. Backup
  try {
    const { spawnSync } = await import('child_process')
    const r = spawnSync('node', [path.join(ROOT, 'scripts/check-backup-status.mjs')], { encoding: 'utf-8', cwd: ROOT })
    const backupOut = r.stdout || ''
    if (backupOut.includes('备份正常')) {
      add('ok', '本地备份', backupOut.match(/最近备份:.+/)?.[0] || '最近 7 天内有备份')
    } else if (backupOut.includes('该备份了') || backupOut.includes('从未备份')) {
      add('warn', '本地备份', '超过 7 天未备份或从未备份，请双击「一键备份本地图片.bat」')
    } else {
      add('info', '本地备份', '请查看 backup 目录')
    }
  } catch {
    add('info', '本地备份', '无法检测')
  }

  // 8. Default password
  try {
    const old = await fetchJson(`${SERVER}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    add(old.res.ok ? 'danger' : 'ok', '默认密码',
      old.res.ok ? '仍在使用 admin/admin123，请运行 setup:admin 或查看 secrets 文件' : '默认密码 admin123 已失效，更安全')
  } catch {
    add('info', '默认密码', '服务端未运行，无法检测')
  }

  // 9. Secrets
  const jwt = env ? getEnvValue(env, 'JWT_SECRET') : ''
  const wt = env ? getEnvValue(env, 'WORKER_WS_TOKEN') : ''
  if (isWeakJwtSecret(jwt) || isWeakWorkerToken(wt)) {
    add('warn', '生产密钥', 'JWT 或 Worker Token 仍是弱密钥，请运行 npm run setup:secrets')
  } else {
    add('ok', '生产密钥', 'JWT_SECRET 和 WORKER_WS_TOKEN 已设置为强密钥')
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportDir = path.join(ROOT, 'reports')
  await fs.mkdir(reportDir, { recursive: true })
  const mdPath = path.join(reportDir, `health-check-${ts}.md`)
  const htmlPath = path.join(reportDir, `health-check-${ts}.html`)

  const levelLabel = { ok: '正常', warn: '注意', danger: '风险', info: '说明' }
  const mdLines = [
    '# 和田玉记账系统 - 一键体检报告',
    '',
    `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
  ]
  for (const it of items) {
    mdLines.push(`## ${it.title} [${levelLabel[it.level] || it.level}]`)
    mdLines.push('')
    mdLines.push(it.detail)
    mdLines.push('')
  }

  const htmlBody = items.map((it) => {
    const color = { ok: '#2e7d32', warn: '#ed6c02', danger: '#d32f2f', info: '#1565c0' }[it.level] || '#333'
    return `<section style="margin:16px 0;padding:12px;border-left:4px solid ${color};background:#fafafa"><h3>${it.title}</h3><p>${it.detail}</p></section>`
  }).join('\n')

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>系统体检</title></head><body style="font-family:sans-serif;max-width:720px;margin:24px auto"><h1>和田玉记账系统体检</h1><p>${new Date().toLocaleString('zh-CN')}</p>${htmlBody}</body></html>`

  await fs.writeFile(mdPath, mdLines.join('\n'), 'utf-8')
  await fs.writeFile(htmlPath, html, 'utf-8')

  console.log('\n========== 系统体检 ==========\n')
  for (const it of items) {
    console.log(`[${levelLabel[it.level]}] ${it.title}: ${it.detail}`)
  }
  console.log(`\n报告已保存:\n  ${mdPath}\n  ${htmlPath}\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
