@echo off
setlocal
title Image Express Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    if exist "%~dp0install.bat" (
        echo Running install.bat to set everything up...
        call "%~dp0install.bat"
        exit /b %ERRORLEVEL%
    )
    echo Please install Node.js 24 from https://nodejs.org/ and double-click this file again.
    echo Or run install.bat instead to set everything up from scratch.
    pause
    exit /b 1
)

if not exist "%~dp0package.json" (
    echo [ERROR] package.json not found. This folder does not look like an Image Express install.
    echo Run install.bat first, or clone the repository again.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\" (
    echo [LAUNCH] First run — installing dependencies...
    node "%~dp0scripts\ensure-deps.mjs" --force
    if errorlevel 1 (
        echo Dependency install failed. See messages above.
        pause
        exit /b 1
    )
)

node "%~dp0scripts\launch.mjs"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo Launcher exited with code %EXITCODE%.
    echo Tip: run "npm run update" to refresh code and libraries, then try again.
)
pause
exit /b %EXITCODE%
