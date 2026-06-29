/**
 * 备份状态检查（中文大白话）
 */
import fs from 'fs/promises'
import path from 'path'

const BACKUP_ROOT = 'D:/jewelry-account-backups'

async function main() {
  console.log('\n=== 备份状态检查 ===\n')

  try {
    await fs.access(BACKUP_ROOT)
  } catch {
    console.log('[从未备份] 备份目录还不存在，该备份了，别等硬盘先开口。')
    console.log('请双击「一键备份本地图片.bat」。\n')
    return
  }

  const dirs = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  if (!dirs.length) {
    console.log('[从未备份] 备份目录是空的，请双击「一键备份本地图片.bat」。\n')
    return
  }

  let latest = null
  let latestTime = 0
  for (const name of dirs) {
    const full = path.join(BACKUP_ROOT, name)
    const st = await fs.stat(full)
    if (st.mtimeMs > latestTime) {
      latestTime = st.mtimeMs
      latest = { name, full, mtime: st.mtime }
    }
  }

  const days = Math.floor((Date.now() - latestTime) / 86400000)
  let fileCount = 0
  let sizeMb = 0
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(latest.full, 'backup-manifest.json'), 'utf-8'))
    fileCount = manifest.fileCount || 0
    sizeMb = Math.round((manifest.totalSizeBytes || 0) / 1024 / 1024 * 100) / 100
  } catch { /* ignore */ }

  console.log(`最近备份: ${latest.full}`)
  console.log(`备份时间: ${latest.mtime.toLocaleString('zh-CN')} (${days} 天前)`)
  console.log(`文件数: ${fileCount}  大小: ${sizeMb} MB`)

  if (days > 7) {
    console.log('\n[该备份了] 已超过 7 天未备份，别等硬盘先开口。')
    console.log('请双击「一键备份本地图片.bat」。')
  } else {
    console.log('\n[备份正常] 最近备份在 7 天内，继续保持。')
  }
  console.log('')
}

main().catch(console.error)
