@echo off
chcp 65001 >nul
title 项目资金支出记录系统 - 修复本地Worker
cd /d "%~dp0"
echo === 项目资金支出记录系统 - 修复本地 Worker ===
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\run-utf8.ps1" -ScriptPath "scripts\windows\restart-local-worker.ps1"
if %ERRORLEVEL% equ 0 (
  echo.
  echo 修复完成：本地 Worker 已连接，图片可正常上传。
  timeout /t 5 /nobreak >nul
) else (
  echo.
  echo 修复未成功，请查看诊断输出。
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\run-utf8.ps1" -ScriptPath "scripts\windows\check-local-worker.ps1"
  timeout /t 20 /nobreak >nul
)
exit /b %ERRORLEVEL%
