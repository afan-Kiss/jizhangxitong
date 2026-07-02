@echo off
chcp 65001 >nul
title 项目资金支出记录系统 - 启动本地Worker
cd /d "%~dp0"
echo === 项目资金支出记录系统 - 本地Worker ===
echo 启动后请保留标题为「项目资金支出记录系统 - 本地Worker」的窗口，不要关闭。
echo 同一系统只允许运行一个 Worker，请勿重复打开。
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\run-utf8.ps1" -ScriptPath "scripts\windows\start-local-worker.ps1"
if %ERRORLEVEL% equ 0 (
  echo.
  echo 本地 Worker 已连接，图片可正常上传。
  timeout /t 5 /nobreak >nul
) else (
  echo.
  echo Worker 启动或连接失败，请查看上方日志。
  timeout /t 15 /nobreak >nul
)
exit /b %ERRORLEVEL%
