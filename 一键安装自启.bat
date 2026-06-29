@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 如未弹出管理员窗口，请改双击：以管理员安装开机自启-提权.bat
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\setup-autostart-one-click.ps1"
