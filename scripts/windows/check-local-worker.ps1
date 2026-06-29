# Check local Worker processes, env, remote status, recent logs
param(
  [string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [string]$StatusUrl = 'http://8.137.126.18/account/api/local-worker/status'
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host '=== Local Worker diagnostics ==='
Write-Host "ProjectRoot: $ProjectRoot"

$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match '@jade-account/worker|apps/worker|apps\\worker' }
Write-Host "Worker node processes: $($procs.Count)"
foreach ($p in $procs) {
  $cmd = $p.CommandLine
  if ($cmd.Length -gt 120) { $cmd = $cmd.Substring(0, 120) + '...' }
  Write-Host "  PID=$($p.ProcessId) $cmd"
}

$envPath = Join-Path (Join-Path (Join-Path $ProjectRoot 'apps') 'worker') '.env'
Write-Host "worker env exists: $(Test-Path $envPath)"
if (Test-Path $envPath) {
  Get-Content $envPath -Encoding UTF8 |
    Where-Object { $_ -match '^(SERVER_WS_URL|WORKER_ID|SCANNER_API_URL|FILE_BASE_DIR)=' } |
    ForEach-Object { Write-Host "  $_" }
}

Push-Location $ProjectRoot
try {
  Write-Host ''
  Write-Host '--- npm run worker:status ---'
  npm run worker:status
} finally { Pop-Location }

try {
  $secret = Join-Path (Join-Path $ProjectRoot 'secrets') 'initial-admin-password.txt'
  $pwd = 'admin123'
  if (Test-Path $secret) {
    $text = Get-Content $secret -Raw -Encoding UTF8
    if ($text -match ':\s*(.+)$') { $pwd = $Matches[1].Trim() }
  }
  $loginUrl = $StatusUrl -replace '/api/local-worker/status', '/api/auth/login'
  $loginBody = @{ username = 'admin'; password = $pwd } | ConvertTo-Json
  $login = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType 'application/json; charset=utf-8'
  $headers = @{ Authorization = "Bearer $($login.data.token)" }
  $st = Invoke-RestMethod -Uri $StatusUrl -Headers $headers
  Write-Host ''
  Write-Host '--- Remote worker status ---'
  $st.data | ConvertTo-Json -Depth 4
} catch {
  Write-Host ''
  Write-Host "Remote status failed: $($_.Exception.Message)"
}

$logDir = Join-Path (Join-Path (Join-Path $ProjectRoot 'apps') 'worker') 'logs'
if (Test-Path $logDir) {
  $latest = Get-ChildItem $logDir -Filter 'worker-*.log' | Sort-Object Name -Descending | Select-Object -First 1
  if ($latest) {
    Write-Host ''
    Write-Host "--- Recent log: $($latest.Name) ---"
    Get-Content $latest.FullName -Tail 15 -Encoding UTF8
  }
}
