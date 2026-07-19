@echo off
setlocal
title Image Express Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js 24 from https://nodejs.org/ and double-click this file again.
    echo Or run install.bat instead to set everything up from scratch.
    pause
    exit /b 1
)

node scripts\launch.mjs

echo.
pause
