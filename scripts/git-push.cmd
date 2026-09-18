@echo off
REM Nio Service Monitor - Git push helper
REM Pushes local changes to GitHub repository

setlocal

set REPO_DIR=C:\Users\lby10\.openclaw\workspace\scripts\service-monitor
set REMOTE_URL=https://github.com/lby10301/service-monitor.git

echo ================================================
echo   Git Push - Nio Service Monitor
echo ================================================
echo.

cd /d "%REPO_DIR%"

REM Check git installed
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] git not installed. Install from https://git-scm.com/
    pause
    exit /b 1
)

REM Check remote configured
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [INFO] Adding remote origin...
    git remote add origin %REMOTE_URL%
)

REM Show status
echo Current status:
git status -s
echo.

REM Confirm
set /p CONFIRM=Push all changes? (y/N):
if /i not "%CONFIRM%"=="y" goto :cancel

REM Stage and commit
echo.
echo Adding files...
git add .

REM Check token file not staged
git status --porcelain | findstr /C:"monitor.token" >nul 2>&1
if not errorlevel 1 (
    echo [ERROR] monitor.token is staged! Aborting for safety.
    echo Remove it with: git rm --cached monitor.token
    pause
    exit /b 1
)

set /p MSG=Commit message (default: update monitor):
if "%MSG%"=="" set MSG=update monitor

echo.
echo Committing...
git commit -m "%MSG%"
if errorlevel 1 (
    echo [WARN] Nothing to commit or commit failed.
)

echo.
echo Pushing to %REMOTE_URL%...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Check:
    echo   1. PAT stored in secrets store (GITHUB_PAT_NAME)
    echo   2. Network connection
    echo   3. Repository exists: %REMOTE_URL%
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Push complete!
echo   https://github.com/lby10301/service-monitor
echo ================================================
echo.
pause
exit /b 0

:cancel
echo Cancelled.
pause
exit /b 0