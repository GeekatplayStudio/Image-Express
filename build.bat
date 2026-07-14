@echo off
setlocal enabledelayedexpansion
title Image Express - Build Menu

echo ===================================================
echo            Image Express Builder Script
echo ===================================================
echo.

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] node_modules directory not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Exiting.
        pause
        exit /b %errorlevel%
    )
)

echo Please select what you want to build:
echo 1. Build Desktop Application Installers (Creates macOS/Windows/Linux installers)
echo 2. Build Web Application Production Assets (Prepares Next.js build)
echo 3. Exit
echo.

set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo [INFO] Building Desktop Installers...
    call npm run desktop:build
) else if "%choice%"=="2" (
    echo [INFO] Building Web Production Assets...
    call npm run build
) else if "%choice%"=="3" (
    echo Exiting.
    exit /b 0
) else (
    echo Invalid choice. Exiting.
    pause
)
