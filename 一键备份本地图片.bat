@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\backup-local-files.ps1"
if exist "scripts\windows\.last-backup-path.txt" (
  set /p BACKUP_DIR=<scripts\windows\.last-backup-path.txt
  start "" "%BACKUP_DIR%"
)
pause
