@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Reklama Gateway - Wylacz autostart
echo Wylaczam autostart...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-autostart.ps1"
echo.
pause
