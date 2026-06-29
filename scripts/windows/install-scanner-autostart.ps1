# 注册扫码枪系统 API 开机自启（如尚未配置）
param(
  [string]$ScannerRoot = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '..\扫码枪登记出入库系统')
)

$ErrorActionPreference = 'Stop'
$TaskName = 'JadeAccounting-ScannerAPI'
$ServerDir = Join-Path $ScannerRoot 'apps\server'

if (-not (Test-Path $ServerDir)) {
  Write-Warning "扫码枪项目不存在: $ServerDir"
  exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "计划任务已存在: $TaskName，跳过"
  exit 0
}

$npmCmd = (Get-Command npm -ErrorAction SilentlyContinue).Source
$action = New-ScheduledTaskAction -Execute $npmCmd -Argument 'run dev' -WorkingDirectory $ServerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Write-Host "已注册扫码枪 API 自启: $TaskName"
Write-Host "目录: $ServerDir"
