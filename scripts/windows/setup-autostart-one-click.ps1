# One-click autostart setup
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$ProjectRoot = Get-ProjectRoot
$isAdmin = Test-IsAdministrator

Write-Host ''
Write-Host '=== Jade Accounting Autostart Setup ==='
Write-Host ''

if (-not $isAdmin) {
  $shortcut = New-AdminDesktopShortcut -ShortcutName 'JadeAutostart' -TargetScript 'scripts\windows\setup-autostart-one-click.ps1' -ProjectRoot $ProjectRoot
  $rootBat = Join-Path $ProjectRoot '以管理员安装开机自启.bat'
  $scriptFull = Join-Path $ProjectRoot 'scripts\windows\setup-autostart-one-click.ps1'
  @"
@echo off
chcp 65001 >nul
cd /d "$ProjectRoot"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"$scriptFull\"\"' -Verb RunAs"
"@ | Set-Content -Path $rootBat -Encoding UTF8
  Write-Host 'Not running as Administrator.'
  Write-Host 'Please double-click ONE of these (allow admin when prompted):'
  Write-Host "  $rootBat"
  Write-Host "  $shortcut"
  exit 0
}

Write-Host 'Administrator detected. Installing tasks...'
& "$PSScriptRoot\install-worker-autostart.ps1"
& "$PSScriptRoot\install-scanner-autostart.ps1"
& "$PSScriptRoot\status-local-services.ps1"
Write-Host 'Done.'
