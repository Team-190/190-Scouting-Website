@echo off
setlocal enabledelayedexpansion

set NGINX_EXE=E:\Websites\nginx-1.29.8\nginx.exe
set NGINX_CONF=E:\Websites\nginx-1.29.8\conf\nginx.conf
set NGINX_PREFIX=E:\Websites\nginx-1.29.8

REM Build frontend
echo.
echo ======== Building Frontend ========
cd /d "%~dp0frontend"
call npm run build
if !errorlevel! neq 0 (
    echo.
    echo ERROR: Frontend build failed!
    exit /b 1
)

REM Start backend with pm2 if not already running
echo.
echo ======== Checking PM2 Backend Status ========
cd /d "%~dp0backend"

REM Check if the 190Backend app is already running in pm2
call pm2 list | find "190Backend" >nul 2>&1
if !errorlevel! neq 0 (
    echo Starting backend with PM2...
    call pm2 start index.js --name "190Backend"
) else (
    echo Backend already running in PM2
)

REM Start or reload nginx
echo.
echo ======== Checking Nginx Status ========
tasklist /FI "IMAGENAME eq nginx.exe" 2>nul | find /I /N "nginx.exe">nul
if !errorlevel! equ 0 (
    echo nginx is running. Reloading...
    call "!NGINX_EXE!" -s reload
    if !errorlevel! equ 0 (
        echo nginx reloaded successfully
    ) else (
        echo WARNING: nginx reload may have failed
    )
) else (
    echo nginx is not running. Starting...
    start /b "nginx" "!NGINX_EXE!" -p "!NGINX_PREFIX!" -c "!NGINX_CONF!"
    timeout /t 2 /nobreak
    echo nginx started successfully
)

echo.
echo ======== All Tasks Complete ========
endlocal
