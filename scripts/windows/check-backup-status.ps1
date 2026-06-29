# Check last backup status
$ErrorActionPreference = 'SilentlyContinue'

$BackupRoot = 'D:\jewelry-account-backups'

Write-Host ''
Write-Host '=== 备份状态检查 ==='
Write-Host ''

if (-not (Test-Path $BackupRoot)) {
  Write-Host '[从未备份] 备份目录还不存在，建议尽快备份一次。'
  Write-Host '请双击「一键备份本地图片.bat」。'
  Write-Host ''
  exit 0
}

$dirs = Get-ChildItem $BackupRoot -Directory | Sort-Object LastWriteTime -Descending
if (-not $dirs -or $dirs.Count -eq 0) {
  Write-Host '[从未备份] 备份目录是空的，该备份了，别等硬盘先开口。'
  exit 0
}

$latest = $dirs[0]
$days = ((Get-Date) - $latest.LastWriteTime).Days
$manifest = Join-Path $latest.FullName 'backup-manifest.json'
$sizeMb = 0
$fileCount = 0

if (Test-Path $manifest) {
  try {
    $m = Get-Content $manifest -Raw | ConvertFrom-Json
    $sizeMb = [math]::Round($m.totalSizeBytes / 1MB, 2)
    $fileCount = $m.fileCount
  } catch { }
}

Write-Host "最近备份: $($latest.FullName)"
Write-Host "备份时间: $($latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm')) ($days 天前)"
Write-Host "文件数: $fileCount  大小: ${sizeMb} MB"

if ($days -gt 7) {
  Write-Host ''
  Write-Host '[该备份了] 已超过 7 天未备份，别等硬盘先开口。'
  Write-Host '请双击「一键备份本地图片.bat」。'
} else {
  Write-Host ''
  Write-Host '[备份正常] 最近备份在 7 天内，继续保持。'
}

Write-Host ''
