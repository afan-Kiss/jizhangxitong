/**
 * 备份状态检查（中文大白话）
 */
import fs from 'fs/promises'
import path from 'path'

const BACKUP_ROOT = 'D:/jewelry-account-backups'

async function readManifest(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'backup-manifest.json'), 'utf-8'))
  } catch {
    return null
  }
}

async function latestDirMatching(matcher) {
  let latest = null
  let latestTime = 0
  const dirs = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && matcher(d.name))
  for (const entry of dirs) {
    const full = path.join(BACKUP_ROOT, entry.name)
    const st = await fs.stat(full)
    if (st.mtimeMs > latestTime) {
      latestTime = st.mtimeMs
      latest = { name: entry.name, full, mtime: st.mtime }
    }
  }
  return latest ? { ...latest, mtimeMs: latestTime } : null
}

function printBackupBlock(title, latest, manifest) {
  if (!latest) {
    console.log(`[${title}] 还没有备份`)
    return { days: Infinity }
  }
  const days = Math.floor((Date.now() - latest.mtimeMs) / 86400000)
  const fileCount = manifest?.fileCount || 0
  const sizeMb = Math.round(((manifest?.totalSizeBytes || manifest?.fileSizeBytes || 0) / 1024 / 1024) * 100) / 100
  console.log(`最近备份: ${latest.full}`)
  console.log(`备份时间: ${latest.mtime.toLocaleString('zh-CN')} (${days} 天前)`)
  if (manifest?.source === 'production') {
    console.log(`类型: 云端生产库  有效支出: ${manifest.expenseCount ?? '?'} 条`)
    console.log(`数据库大小: ${sizeMb} MB`)
  } else {
    console.log(`文件数: ${fileCount}  大小: ${sizeMb} MB`)
  }
  return { days }
}

async function main() {
  console.log('\n=== 备份状态检查 ===\n')

  try {
    await fs.access(BACKUP_ROOT)
  } catch {
    console.log('[从未备份] 备份目录还不存在，该备份了。')
    console.log('请双击「一键备份本地图片.bat」或「一键备份生产数据库.bat」。\n')
    return
  }

  const localLatest = await latestDirMatching((name) => !name.endsWith('-prod'))
  const prodLatest = await latestDirMatching((name) => name.endsWith('-prod'))

  console.log('--- 本地图片备份 ---')
  const localManifest = localLatest ? await readManifest(localLatest.full) : null
  const local = printBackupBlock('本地图片', localLatest, localManifest)

  console.log('\n--- 云端生产库备份（经 Worker）---')
  const prodManifest = prodLatest ? await readManifest(prodLatest.full) : null
  const prod = printBackupBlock('生产库', prodLatest, prodManifest)

  const worstDays = Math.max(local.days ?? 0, prod.days ?? 0)
  console.log('')
  if (!prodLatest) {
    console.log('[建议] 生产库尚未备份到公司电脑，请打开 Worker 后运行「一键备份生产数据库.bat」。')
  } else if (prod.days > 1) {
    console.log('[建议] 生产库备份已超过 1 天，部署前或每天下班前建议再备份一次。')
  }

  if (worstDays > 7) {
    console.log('\n[该备份了] 已超过 7 天未做本地图片备份，请双击「一键备份本地图片.bat」。')
  } else if (localLatest && prodLatest) {
    console.log('\n[备份正常] 本地图片与生产库备份均在可接受范围内。')
  }
  console.log('')
}

main().catch(console.error)
