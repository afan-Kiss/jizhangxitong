# Check local services status
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [int]$ServerPort = 3001,
  [string]$FileBase = 'D:\jewelry-account-files'
)

function Test-TcpPort([int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $Port)
    $c.Close()
    return $true
  } catch { return $false }
}

Write-Host '=== Local Services Status ==='
$serverOk = Test-TcpPort $ServerPort
$fileOk = Test-Path $FileBase

Write-Host "Accounting server ($ServerPort): $(if ($serverOk) { 'OK' } else { 'DOWN' })"
Write-Host "File base dir: $(if ($fileOk) { 'EXISTS' } else { 'MISSING' }) $FileBase"

$workerTask = Get-ScheduledTask -TaskName 'JadeAccounting-LocalWorker' -ErrorAction SilentlyContinue
Write-Host "Worker autostart task: $(if ($workerTask) { $workerTask.State } else { 'NOT INSTALLED' })"

$logDir = Join-Path $ProjectRoot 'apps\worker\logs'
if (Test-Path $logDir) {
  $latest = Get-ChildItem $logDir -Filter 'worker-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) {
    Write-Host "`nRecent worker log ($($latest.Name)):"
    Get-Content $latest.FullName -Tail 8
  }
}

Push-Location (Join-Path $ProjectRoot 'apps\worker')
npm run status 2>$null
Pop-Location
