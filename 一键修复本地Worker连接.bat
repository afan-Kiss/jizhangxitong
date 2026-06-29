@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 一键修复本地 Worker 连接 ===
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\restart-local-worker.ps1"
if %ERRORLEVEL% equ 0 (
  echo.
  echo 修复完成：本地电脑已连接，可以正常读取扫码枪和图片。
  timeout /t 5 /nobreak >nul
) else (
  echo.
  echo 修复未成功，请查看诊断输出。
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\check-local-worker.ps1"
  timeout /t 20 /nobreak >nul
)
exit /b %ERRORLEVEL%
