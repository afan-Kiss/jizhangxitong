@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\start-local-worker.ps1"
if %ERRORLEVEL% equ 0 (
  echo.
  echo 本地电脑已连接，可以正常读取扫码枪和图片。
  timeout /t 5 /nobreak >nul
) else (
  echo.
  echo Worker 启动或连接失败，请查看上方日志。
  timeout /t 15 /nobreak >nul
)
exit /b %ERRORLEVEL%
