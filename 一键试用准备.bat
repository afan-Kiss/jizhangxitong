@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== 试用前准备：系统检查 + 真实链路试跑 =====
echo.
call npm run trial:prep
if errorlevel 1 (
  echo 部分检查未通过，仍继续试跑...
)
call npm run trial:run
pause
