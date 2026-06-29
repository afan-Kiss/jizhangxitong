# 删除 Worker 开机自启计划任务
$TaskName = 'JadeAccounting-LocalWorker'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "已删除计划任务: $TaskName (如存在)"
