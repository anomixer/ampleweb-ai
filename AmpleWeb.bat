@echo off
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed.
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

:: Check ROMs
set "ROM_DIR=public\roms"
set "NEED_ROMS=1"
if exist "%ROM_DIR%\*.zip" set "NEED_ROMS=0"

if "%NEED_ROMS%"=="1" (
    echo.
    echo [!] ROMs not found in %ROM_DIR%.
    echo Launching ROM Downloader...
    powershell -ExecutionPolicy Bypass -File download_roms.ps1
)

:: Start dev server
node server.js
