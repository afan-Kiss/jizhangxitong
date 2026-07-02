# Start local Worker and wait until remote reports online=true
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [int]$WaitSeconds = 45,
  [string]$StatusUrl = 'http://8.137.126.18/account/api/local-worker/status'
)

$WORKER_WINDOW_TITLE = '项目资金支出记录系统 - 本地Worker'
$WORKER_DISPLAY_NAME = '项目资金支出记录系统-本地Worker'

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-ConsoleUtf8

function Stop-AllAccountingWorkers {
  $killScript = Join-Path $PSScriptRoot 'kill-all-workers.ps1'
  if (Test-Path $killScript) {
    & $killScript
    return
  }
}

function Sync-WorkerTokenFromRemote {
  param([string]$Root)
  $syncScript = Join-Path (Join-Path (Join-Path $Root 'deploy') 'aliyun') 'sync-worker-env.py'
  if (-not (Test-Path $syncScript)) { return }
  try {
    & python $syncScript
    if ($LASTEXITCODE -eq 0) { Write-Host 'Synced WORKER_WS_TOKEN from remote server' }
  } catch {
    Write-Host "WARN: token sync skipped ($($_.Exception.Message))"
  }
}

function Ensure-WorkerEnv {
  param([string]$Root)
  $workerDir = Join-Path (Join-Path $Root 'apps') 'worker'
  $envPath = Join-Path $workerDir '.env'
  $example = Join-Path $workerDir '.env.example'
  if (-not (Test-Path $envPath)) {
    if (Test-Path $example) {
      Copy-Item $example $envPath
      Write-Host 'Created apps/worker/.env from example'
    } else {
      throw 'Missing apps/worker/.env'
    }
  }
  Sync-WorkerTokenFromRemote -Root $Root
  $content = Get-Content $envPath -Raw -Encoding UTF8
  $changed = $false
  if ($content -notmatch 'SERVER_WS_URL=ws://8\.137\.126\.18/account/ws/worker') {
    if ($content -match 'SERVER_WS_URL=') {
      $content = $content -replace 'SERVER_WS_URL=.*', 'SERVER_WS_URL=ws://8.137.126.18/account/ws/worker'
    } else {
      $content += "`nSERVER_WS_URL=ws://8.137.126.18/account/ws/worker`n"
    }
    $changed = $true
  }
  $expectedWorkerName = "WORKER_NAME=$WORKER_DISPLAY_NAME"
  if ($content -notmatch [regex]::Escape($expectedWorkerName)) {
    if ($content -match 'WORKER_NAME=') {
      $content = $content -replace 'WORKER_NAME=.*', $expectedWorkerName
    } else {
      $content += "`n$expectedWorkerName`n"
    }
    $changed = $true
  }
  if ($content -match '(?m)^SCANNER_API_URL=') {
    $content = ($content -split "`n" | Where-Object { $_ -notmatch '^SCANNER_API_URL=' }) -join "`n"
    $changed = $true
  }
  if ($changed) {
    Set-Content -Path $envPath -Value $content.TrimEnd() -Encoding UTF8
    Write-Host 'Updated worker env (SERVER_WS_URL / WORKER_NAME / etc.)'
  }
}

function Wait-WorkerOnline {
  param(
    [string]$Root,
    [int]$MaxSeconds
  )
  Push-Location $Root
  try {
    $env:WAIT_SECONDS = "$MaxSeconds"
    $out = node scripts/check-worker-remote-online.mjs 2>&1
    if ($LASTEXITCODE -eq 0) {
      return ($out | ConvertFrom-Json)
    }
    return $null
  } finally {
    Pop-Location
    Remove-Item Env:WAIT_SECONDS -ErrorAction SilentlyContinue
  }
}

function Show-RecentWorkerLogs {
  param([string]$Root)
  $logDir = Join-Path (Join-Path (Join-Path $Root 'apps') 'worker') 'logs'
  if (-not (Test-Path $logDir)) { return }
  $latest = Get-ChildItem $logDir -Filter 'worker-*.log' | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latest) { return }
  Write-Host ''
  Write-Host "--- Recent Worker log: $($latest.Name) ---"
  Get-Content $latest.FullName -Tail 20 -Encoding UTF8
}

Write-Host "ProjectRoot: $ProjectRoot"
Stop-AllAccountingWorkers

$lockDir = Join-Path $env:USERPROFILE '.jade-accounting'
if (Test-Path $lockDir) {
  Get-ChildItem $lockDir -Filter 'worker-*.lock' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

Ensure-WorkerEnv -Root $ProjectRoot

$logDir = Join-Path (Join-Path (Join-Path $ProjectRoot 'apps') 'worker') 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host 'Building Worker...'
Push-Location $ProjectRoot
try {
  npm run build -w @jade-account/shared
  if ($LASTEXITCODE -ne 0) { throw 'shared build failed' }
  npm run build -w @jade-account/worker
  if ($LASTEXITCODE -ne 0) { throw 'Worker build failed' }
} finally { Pop-Location }

Write-Host 'Starting Worker (visible window)...'
$workerDir = Join-Path (Join-Path $ProjectRoot 'apps') 'worker'
$innerCmd = "chcp 65001>nul & title $WORKER_WINDOW_TITLE & echo. & echo [$WORKER_WINDOW_TITLE] & echo 用途：连接云端「项目资金支出记录系统」，处理本地图片上传。 & echo 同一系统只允许运行一个 Worker 窗口，请勿重复打开。 & echo. & node dist/index.js"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $innerCmd -WorkingDirectory $workerDir

Write-Host "Waiting for online=true (max ${WaitSeconds}s)..."
$status = Wait-WorkerOnline -Root $ProjectRoot -MaxSeconds $WaitSeconds

Write-Host ''
Write-Host '--- npm run worker:status (optional) ---'
Push-Location $ProjectRoot
try {
  $job = Start-Job -ScriptBlock { param($r) Set-Location $r; npm run worker:status 2>&1 } -ArgumentList $ProjectRoot
  Wait-Job $job -Timeout 15 | Out-Null
  Receive-Job $job 2>$null | Write-Host
  Remove-Job $job -Force -ErrorAction SilentlyContinue
} finally { Pop-Location }

if ($status) {
  Write-Host ''
  Write-Host 'OK: Local worker connected. Image upload is available.'
  Write-Host "workerId=$($status.workerId) lastSeenAt=$($status.lastSeenAt)"
  exit 0
}

Show-RecentWorkerLogs -Root $ProjectRoot
Write-Host ''
Write-Host 'FAIL: Worker not online within timeout. Check apps/worker/.env and network.'
exit 1
