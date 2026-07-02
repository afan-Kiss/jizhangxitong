# 重启本地 Worker（杀重复进程 + 启动 + 等待 online）
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-ConsoleUtf8
$startScript = Join-Path $PSScriptRoot 'start-local-worker.ps1'
& $startScript -ProjectRoot $ProjectRoot -WaitSeconds 30
exit $LASTEXITCODE
