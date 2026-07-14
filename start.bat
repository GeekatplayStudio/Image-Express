@echo off
setlocal enabledelayedexpansion
title Image Express - Start Menu

echo ===================================================
echo           Image Express Starter Script
echo ===================================================
echo.

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] node_modules directory not found.
    set /p install_choice="Would you like to run 'npm install' first? (Y/N): "
    if /i "!install_choice!"=="Y" (
        echo [INFO] Installing dependencies...
        call npm install
        if %errorlevel% neq 0 (
            echo [ERROR] npm install failed. Exiting.
            pause
            exit /b %errorlevel%
        )
    ) else (
        echo [WARNING] Proceeding without installing dependencies. This may fail.
    )
)

echo.
echo Please select how you want to start the project:
echo 1. Start Desktop App in Development Mode (Recommended for testing desktop features)
echo 2. Start Desktop App in Production Mode (Builds first, then runs desktop shell)
echo 3. Start Web App in Development Mode (Runs on http://localhost:3000)
echo 4. Start Web App in Production Mode (Runs on http://localhost:3000 after build)
echo 5. Run Super Installer / Setup (Configure ComfyUI, Ollama, Models)
echo 6. Exit
echo.

set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" (
    echo [INFO] Starting Desktop App in Development Mode...
    call npm run desktop:dev
) else if "%choice%"=="2" (
    echo [INFO] Starting Desktop App in Production Mode...
    call npm run desktop:start
) else if "%choice%"=="3" (
    echo [INFO] Starting Web App in Development Mode...
    call npm run dev
) else if "%choice%"=="4" (
    echo [INFO] Starting Web App in Production Mode...
    call npm run build && call npm run start
) else if "%choice%"=="5" (
    echo [INFO] Starting Super Installer Setup...
    call npm run install:super
) else if "%choice%"=="6" (
    echo Exiting.
    exit /b 0
) else (
    echo Invalid choice. Exiting.
    pause
)
