@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Reklama - Menu glowne
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\menu.ps1"
if errorlevel 1 (
  echo.
  echo Cos poszlo nie tak przy otwieraniu menu.
  echo Sprobuj kliknac ten plik jeszcze raz.
  echo.
  pause
)
