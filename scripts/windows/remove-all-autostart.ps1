# Remove all JadeAccounting scheduled tasks
$ErrorActionPreference = 'SilentlyContinue'

$tasks = @(
  'JadeAccounting-LocalWorker',
  'JadeAccounting-ScannerAPI',
  'JadeAccounting-WeeklyBackup'
)

Write-Host ''
Write-Host '=== 卸载本项目计划任务 ==='
Write-Host ''

foreach ($name in $tasks) {
  $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "已删除: $name"
  } else {
    Write-Host "跳过(不存在): $name"
  }
}

Write-Host ''
Write-Host '卸载完成。'
Read-Host '按回车键关闭'
