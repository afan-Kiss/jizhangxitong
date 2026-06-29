# Start local Worker and wait until remote reports online=true
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [int]$WaitSeconds = 30,
  [string]$StatusUrl = 'http://8.137.126.18/account/api/local-worker/status'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Stop-DuplicateWorkers {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '@jade-account/worker|apps/worker|apps\\worker' } |
    ForEach-Object {
      Write-Host "Stopping duplicate Worker PID=$($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep -Seconds 1
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
  if ($content -notmatch 'SCANNER_API_URL=http://127\.0\.0\.1:7789') {
    if ($content -match 'SCANNER_API_URL=') {
      $content = $content -replace 'SCANNER_API_URL=.*', 'SCANNER_API_URL=http://127.0.0.1:7789'
    } else {
      $content += "`nSCANNER_API_URL=http://127.0.0.1:7789`n"
    }
    $changed = $true
  }
  if ($changed) {
    Set-Content -Path $envPath -Value $content.TrimEnd() -Encoding UTF8
    Write-Host 'Updated SERVER_WS_URL / SCANNER_API_URL in worker env file'
  }
}

function Get-AdminPassword {
  param([string]$Root)
  $secret = Join-Path (Join-Path $Root 'secrets') 'initial-admin-password.txt'
  if (Test-Path $secret) {
    $text = Get-Content $secret -Raw -Encoding UTF8
    if ($text -match '密码:\s*(.+)') { return $Matches[1].Trim() }
    if ($text -match ':\s*(.+)$') { return $Matches[1].Trim() }
  }
  return 'admin123'
}

function Wait-WorkerOnline {
  param(
    [string]$StatusUrl,
    [string]$Password,
    [int]$MaxSeconds
  )
  $loginUrl = $StatusUrl -replace '/api/local-worker/status', '/api/auth/login'
  $loginBody = @{ username = 'admin'; password = $Password } | ConvertTo-Json
  $token = $null
  for ($i = 0; $i -lt 10; $i++) {
    try {
      $login = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType 'application/json; charset=utf-8'
      if ($login.data.token) { $token = $login.data.token; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $token) { throw 'Cannot login to remote server for worker status' }

  $headers = @{ Authorization = "Bearer $token" }
  for ($i = 0; $i -lt $MaxSeconds; $i++) {
    try {
      $st = Invoke-RestMethod -Uri $StatusUrl -Headers $headers
      if ($st.data.online -eq $true) { return $st.data }
      Start-Sleep -Seconds 1
    } catch { Start-Sleep -Seconds 1 }
  }
  return $null
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
Stop-DuplicateWorkers
Ensure-WorkerEnv -Root $ProjectRoot

$logDir = Join-Path (Join-Path (Join-Path $ProjectRoot 'apps') 'worker') 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir 'worker-start.log'
$errLog = Join-Path $logDir 'worker-start.err.log'

Write-Host 'Starting Worker...'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev:worker' -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog

Write-Host "Waiting for online=true (max ${WaitSeconds}s)..."
$password = Get-AdminPassword -Root $ProjectRoot
$status = Wait-WorkerOnline -StatusUrl $StatusUrl -Password $password -MaxSeconds $WaitSeconds

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
  Write-Host 'OK: Local worker connected. Scanner and images are available.'
  Write-Host "workerId=$($status.workerId) lastSeenAt=$($status.lastSeenAt)"
  exit 0
}

Show-RecentWorkerLogs -Root $ProjectRoot
Write-Host ''
Write-Host 'FAIL: Worker not online within timeout. Check apps/worker env and network.'
exit 1
