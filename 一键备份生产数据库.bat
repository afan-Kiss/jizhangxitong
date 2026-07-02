@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === 生产数据库备份（经本地 Worker）===
echo 请确保「本地Worker」窗口已连接阿里云
echo.
node scripts/backup-prod-db-via-worker.mjs
if errorlevel 2 (
  echo.
  echo Worker 未连接，请先运行「一键启动本地Worker.bat」
)
pause
