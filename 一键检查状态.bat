@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\check-autostart.mjs
node scripts\check-backup-status.mjs
pause
