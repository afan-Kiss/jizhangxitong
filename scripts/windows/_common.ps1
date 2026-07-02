# Shared helpers for Windows scripts
param()

function Initialize-ConsoleUtf8 {
  try { chcp 65001 | Out-Null } catch { }
  $utf8 = [System.Text.Encoding]::UTF8
  [Console]::InputEncoding = $utf8
  [Console]::OutputEncoding = $utf8
  $global:OutputEncoding = $utf8
}

function Get-ProjectRoot {
  return (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-AdminDesktopShortcut {
  param(
    [string]$ShortcutName,
    [string]$TargetScript,
    [string]$ProjectRoot
  )
  $desktop = [Environment]::GetFolderPath('Desktop')
  $batPath = Join-Path $desktop "$ShortcutName.bat"
  $lnkPath = Join-Path $desktop "安装和田玉记账系统自启.lnk"
  $scriptFull = Join-Path $ProjectRoot $TargetScript
  $content = @"
@echo off
chcp 65001 >nul
cd /d "$ProjectRoot"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"$scriptFull\"\"' -Verb RunAs"
"@
  Set-Content -Path $batPath -Value $content -Encoding UTF8
  try {
    $WshShell = New-Object -ComObject WScript.Shell
    $sc = $WshShell.CreateShortcut($lnkPath)
    $sc.TargetPath = $batPath
    $sc.WorkingDirectory = $ProjectRoot
    $sc.Save()
    return $lnkPath
  } catch {
    return $batPath
  }
}

# dot-sourced, no Export-ModuleMember needed
