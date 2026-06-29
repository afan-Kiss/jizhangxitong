# Weekly backup reminder / auto backup - Monday 9:00
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$ProjectRoot = Get-ProjectRoot
$TaskName = 'JadeAccounting-WeeklyBackup'
$BackupScript = Join-Path $PSScriptRoot 'backup-local-files.ps1'
$isAdmin = Test-IsAdministrator

if (-not $isAdmin) {
  $shortcut = New-AdminDesktopShortcut -ShortcutName '安装和田玉系统每周备份' -TargetScript 'scripts\windows\install-backup-reminder.ps1' -ProjectRoot $ProjectRoot
  Write-Host '需要管理员权限注册每周备份任务。'
  Write-Host "请双击桌面快捷方式: $shortcut"
  Read-Host '按回车键关闭'
  exit 0
}

$ps = (Get-Command powershell).Source
$action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BackupScript`"" -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "已注册每周一 9:00 自动备份任务: $TaskName"
Read-Host '按回车键关闭'
