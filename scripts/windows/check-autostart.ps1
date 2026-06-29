# Check autostart status in plain language
$ErrorActionPreference = 'SilentlyContinue'
. "$PSScriptRoot\_common.ps1"

$ProjectRoot = Get-ProjectRoot
$workerTaskName = 'JadeAccounting-LocalWorker'
$scannerTaskName = 'JadeAccounting-ScannerAPI'

function Test-TcpPort([int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $Port)
    $c.Close()
    return $true
  } catch { return $false }
}

Write-Host ''
Write-Host '=== 开机自启检查 ==='
Write-Host ''

$workerTask = Get-ScheduledTask -TaskName $workerTaskName -ErrorAction SilentlyContinue
$scannerTask = Get-ScheduledTask -TaskName $scannerTaskName -ErrorAction SilentlyContinue

if (-not $workerTask -and -not $scannerTask) {
  Write-Host '[未配置] 还没有注册开机自启计划任务。'
  Write-Host '请双击项目根目录的「一键安装自启.bat」，或桌面上的「安装和田玉记账系统自启」。'
} else {
  if ($workerTask) {
    Write-Host "[Worker 自启] 计划任务已注册，状态: $($workerTask.State)"
  } else {
    Write-Host '[Worker 自启] 未注册'
  }
  if ($scannerTask) {
    Write-Host "[扫码枪自启] 计划任务已注册，状态: $($scannerTask.State)"
  } else {
    Write-Host '[扫码枪自启] 未注册'
  }
}

$serverOk = Test-TcpPort 3001
$scannerOk = Test-TcpPort 7789
Write-Host ''
Write-Host "记账服务端 (3001): $(if ($serverOk) { '正在运行' } else { '未运行' })"
Write-Host "扫码枪 API (7789): $(if ($scannerOk) { '正在运行' } else { '未运行' })"

if ($workerTask -and -not $serverOk) {
  Write-Host ''
  Write-Host '[配置了但没启动] 自启任务已注册，但 Worker 依赖的服务端目前未运行。'
  Write-Host '可手动运行 npm run dev:server 和 npm run dev:worker，或重启电脑后再检查。'
}

if ($scannerTask -and -not $scannerOk) {
  Write-Host ''
  Write-Host '[启动了但接口不通] 扫码枪自启已配置，但 7789 端口目前不可访问。'
  Write-Host '请确认扫码枪登记系统项目存在且 npm 可用。'
}

if ($workerTask -and $scannerTask -and $serverOk -and $scannerOk) {
  Write-Host ''
  Write-Host '[已配置好] 自启任务已注册，当前服务也在运行，一切正常。'
}

Write-Host ''
