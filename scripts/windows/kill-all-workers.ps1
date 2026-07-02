# 停止本机所有记账 Worker（含 deploy 目录、tsx dev:worker 残留）
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-ConsoleUtf8
Write-Host '=== 停止全部记账 Worker ==='

function Test-ProcessListening([int]$procId) {
  if ($procId -le 0) { return $false }
  $out = netstat -ano 2>$null | Select-String "LISTENING\s+$procId\s*$"
  return $null -ne $out -and $out.Count -gt 0
}

function Test-WorkerProcessTree([int]$procId) {
  $cur = $procId
  for ($i = 0; $i -lt 8 -and $cur -gt 0; $i++) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$cur" -ErrorAction SilentlyContinue
    if (-not $p) { break }
    $cmd = [string]$p.CommandLine
    if ($cmd -match '@jade-account/worker|dev:worker|dev-entry\.ts|一键启动本地Worker|本地Worker') {
      return $true
    }
    $cur = [int]$p.ParentProcessId
  }
  return $false
}

$killPatterns = @(
  'apps\\worker\\dist\\index\.js',
  'apps/worker/dist/index.js',
  'apps\\worker\\src\\index',
  'apps/worker/src/index',
  'apps\\worker\\src\\dev-entry',
  'apps/worker/src/dev-entry',
  '@jade-account/worker',
  'dev-entry\.ts',
  'worker/dev-entry',
  'jade-account/worker',
  'jizhangxitong-deploy',
  'deploy-d20c161',
  '(?<![\\/\\\\]server[\\/\\\\])dist[\\/\\\\]index\.js'
)

$stopped = 0
foreach ($procName in @('node.exe', 'cmd.exe')) {
  Get-CimInstance Win32_Process -Filter "name='$procName'" -ErrorAction SilentlyContinue |
    ForEach-Object {
      $cmd = [string]$_.CommandLine
      if (-not $cmd) { return }
      $isWorker = $false
      foreach ($p in $killPatterns) {
        if ($cmd -match $p) { $isWorker = $true; break }
      }
      if (-not $isWorker -and $cmd -match 'tsx\\dist\\cli\.mjs" watch src/index\.ts') {
        if (Test-WorkerProcessTree $_.ProcessId) {
          $isWorker = $true
        } elseif (-not (Test-ProcessListening $_.ProcessId)) {
          # Worker 不监听端口；Server dev 会监听 3001 等
          $isWorker = $true
        }
      }
      if (-not $isWorker -and $procName -eq 'cmd.exe' -and $cmd -match 'node dist/index\.js') {
        if ($cmd -match '本地Worker|WORKER_WINDOW|apps\\worker|apps/worker') { $isWorker = $true }
      }
      if ($isWorker) {
        Write-Host "Stopping PID=$($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped++
      }
    }
}

$lockDir = Join-Path $env:USERPROFILE '.jade-accounting'
if (Test-Path $lockDir) {
  Get-ChildItem $lockDir -Filter 'worker-*.lock' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "Stopped $stopped process(es). Only start ONE Worker via 一键启动本地Worker.bat"
