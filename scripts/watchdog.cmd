@echo off
REM Nio Service Monitor - Watchdog
REM 检查 18888 端口，没人在听就启动 monitor

set MONITOR_DIR=C:\Users\lby10\.openclaw\workspace\scripts\service-monitor
set LOG=%TEMP%\nio-watchdog.log

echo [%DATE% %TIME%] Watchdog check started >> "%LOG%"

REM Check if port 18888 is listening
netstat -ano | findstr ":18888" | findstr "LISTENING" >nul
if %ERRORLEVEL% == 0 (
    echo [%DATE% %TIME%] Port 18888 is listening, all good >> "%LOG%"
    exit /b 0
)

REM Port not listening, start monitor
echo [%DATE% %TIME%] Port 18888 NOT listening, starting monitor... >> "%LOG%"
cd /d "%MONITOR_DIR%"
start "Nio Monitor" /min node server.js
echo [%DATE% %TIME%] Monitor start command dispatched >> "%LOG%"

exit /b 0