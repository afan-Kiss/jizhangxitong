# 备份本地图片目录 + 生成 manifest
param(
  [string]$SourceDir = 'D:\jewelry-account-files',
  [string]$BackupRoot = 'D:\jewelry-account-backups',
  [int]$KeepDays = 30,
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = 'Stop'
$dateTag = Get-Date -Format 'yyyy-MM-dd'
$dest = Join-Path $BackupRoot $dateTag

if (Test-Path $dest) {
  $dest = Join-Path $BackupRoot "$dateTag-$(Get-Date -Format 'HHmmss')"
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "备份到: $dest"

$failed = @()
$fileCount = 0
$totalSize = 0

if (Test-Path $SourceDir) {
  robocopy $SourceDir (Join-Path $dest 'files') /E /R:1 /W:1 /NP /NDL /NFL | Out-Null
  if ($LASTEXITCODE -ge 8) { $failed += "robocopy exit $LASTEXITCODE" }
  Get-ChildItem (Join-Path $dest 'files') -Recurse -File | ForEach-Object {
    $fileCount++
    $totalSize += $_.Length
  }
} else {
  $failed += "源目录不存在: $SourceDir"
}

$dbPath = Join-Path $ProjectRoot 'apps\server\prisma\data\accounting.db'
if (Test-Path $dbPath) {
  Copy-Item $dbPath (Join-Path $dest 'accounting.db') -Force
  Write-Host "已复制 SQLite: accounting.db"
} else {
  Set-Content (Join-Path $dest 'database-backup-note.txt') @"
开发环境数据库文件未找到。
生产 MySQL/PostgreSQL 请使用:
  mysqldump -u user -p jade_accounting > backup.sql
  或 pg_dump ...
"@
}

$manifest = @{
  backupTime = (Get-Date).ToString('o')
  sourceDir = $SourceDir
  destination = $dest
  fileCount = $fileCount
  totalSizeBytes = $totalSize
  failedFiles = $failed
  keepDays = $KeepDays
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $dest 'backup-manifest.json') -Encoding UTF8

Write-Host ""
Write-Host "=== 尝试备份云端生产数据库（经本地 Worker）==="
try {
  Push-Location $ProjectRoot
  node scripts/backup-prod-db-via-worker.mjs
  if ($LASTEXITCODE -eq 0) {
    Write-Host "生产数据库已备份到 D:\jewelry-account-backups\*-prod\"
  } elseif ($LASTEXITCODE -eq 2) {
    Write-Host "跳过生产库备份：本地 Worker 未连接（可先运行一键启动本地Worker.bat）"
  } else {
    $failed += "prod-db-backup exit $LASTEXITCODE"
  }
} catch {
  $failed += "prod-db-backup: $($_.Exception.Message)"
} finally {
  Pop-Location
}

# 保留策略
if (Test-Path $BackupRoot) {
  Get-ChildItem $BackupRoot -Directory | Where-Object {
    $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays)
  } | ForEach-Object {
    Write-Host "删除过期备份: $($_.FullName)"
    Remove-Item $_.FullName -Recurse -Force
  }
}

Write-Host "完成。文件数=$fileCount 大小=$([math]::Round($totalSize/1MB,2)) MB"
Set-Content -Path (Join-Path $PSScriptRoot '.last-backup-path.txt') -Value $dest -Encoding UTF8
Write-Host "BACKUP_DEST=$dest"
