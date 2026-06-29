# 注册本地 Worker 开机自启（当前用户登录后）
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)
$ErrorActionPreference = 'Stop'
$TaskName = 'JadeAccounting-LocalWorker'
$LogDir = Join-Path $ProjectRoot 'apps\worker\logs'
$WorkerDir = Join-Path $ProjectRoot 'apps\worker'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$npmCmd = (Get-Command npm -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) { throw '未找到 npm，请先安装 Node.js' }

$action = New-ScheduledTaskAction -Execute $npmCmd -Argument 'run dev' -WorkingDirectory $WorkerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "Registered scheduled task: $TaskName"
} catch {
  Write-Warning "Failed to register task (run PowerShell as Administrator): $($_.Exception.Message)"
  exit 1
}
Write-Host "工作目录: $WorkerDir"
Write-Host "日志目录: $LogDir"
Write-Host "卸载: scripts\windows\uninstall-worker-autostart.ps1"
