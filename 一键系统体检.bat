@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\system-health-check.mjs
for %%f in (reports\health-check-*.html) do (
  start "" "%%f"
  goto :done
)
:done
pause
