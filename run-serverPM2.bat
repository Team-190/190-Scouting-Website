@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT_DIR=%CD%"
set "NGINX_DIR=C:\nginx"

if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if not "%~1"=="" goto :usage_error

where npm >nul 2>nul
if errorlevel 1 (
    echo npm is required but not found in PATH.
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo node is required but not found in PATH.
    exit /b 1
)

where pm2 >nul 2>nul
if errorlevel 1 (
    echo pm2 is required but not found in PATH.
    exit /b 1
)

set "NGINX_EXE=%NGINX_DIR%\nginx.exe"
if not exist "!NGINX_EXE!" (
    echo nginx executable not found at !NGINX_EXE!
    exit /b 1
)

for /f "tokens=1,2" %%A in ('node -e "const c=require('./runtime/constants'); process.stdout.write(c.ports.backend+' '+c.ports.frontend)"') do (
    set "BACKEND_PORT=%%A"
    set "FRONTEND_PORT=%%B"
)

if not defined BACKEND_PORT (
    echo Failed to load runtime constants from runtime/constants.js
    exit /b 1
)

set "VITE_TESTING=0"

set "CURRENT_BRANCH=unknown"
for /f %%A in ('git -C "%ROOT_DIR%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%A"

call :start_runtime
if errorlevel 1 exit /b 1

exit /b 0

:start_runtime
call :ensure_dependencies "backend" "backend"
if errorlevel 1 exit /b 1

call :ensure_dependencies "frontend" "frontend"
if errorlevel 1 exit /b 1

echo Building frontend for production...
pushd "%ROOT_DIR%\frontend"
call npm run build
set "BUILD_EXIT=!ERRORLEVEL!"
popd
if not "!BUILD_EXIT!"=="0" exit /b !BUILD_EXIT!

echo Starting server runtime: branch=%CURRENT_BRANCH% mode=production backend_port=%BACKEND_PORT% frontend_port=%FRONTEND_PORT%

REM Stop any existing pm2 backend process
echo Checking for existing pm2 backend process...
pm2 list | find /I "backend" >nul 2>nul
if errorlevel 0 (
    echo Stopping existing pm2 backend process...
    pm2 stop backend >nul 2>nul
    pm2 delete backend >nul 2>nul
)

REM Check if nginx is running and reload, otherwise start it
echo Checking nginx status...
tasklist /FI "IMAGENAME eq nginx.exe" 2>nul | find /I "nginx.exe" >nul 2>nul
if errorlevel 0 (
    echo Reloading nginx...
    "!NGINX_EXE!" -s reload
) else (
    echo Starting nginx...
    start "Nginx Server" "!NGINX_EXE!"
    timeout /t 2 /nobreak
)

REM Start backend with pm2
echo Starting backend with pm2...
pushd "%ROOT_DIR%\backend"
pm2 start "index.js" --name "backend" --cwd "%ROOT_DIR%\backend"
set "PM2_EXIT=!ERRORLEVEL!"
popd
if not "!PM2_EXIT!"=="0" (
    echo Failed to start backend with pm2.
    exit /b !PM2_EXIT!
)

echo Server runtime started successfully.
exit /b 0

:ensure_dependencies
set "DEP_PATH=%~1"
set "DEP_LABEL=%~2"
if not exist "%ROOT_DIR%\%DEP_PATH%\node_modules" (
    echo Installing %DEP_LABEL% dependencies...
    pushd "%ROOT_DIR%\%DEP_PATH%"
    call npm install
    set "DEP_EXIT=!ERRORLEVEL!"
    popd
    if not "!DEP_EXIT!"=="0" exit /b !DEP_EXIT!
)
exit /b 0

:usage
echo Usage: .\run-server.bat
echo.
echo Runs the current branch in server production mode.
echo - Backend: npm run start
echo - Frontend: npm run build ^& npm run preview
exit /b 0

:usage_error
call :usage
exit /b 1