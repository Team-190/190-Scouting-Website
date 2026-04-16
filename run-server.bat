@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT_DIR=%CD%"

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
call :stop_runtime

call :launch_runtime "Server Backend Runtime" "%ROOT_DIR%\backend" "npm run start"
if errorlevel 1 exit /b 1
call :launch_runtime "Server Frontend Runtime" "%ROOT_DIR%\frontend" "npm run preview"
if errorlevel 1 exit /b 1

exit /b 0

:launch_runtime
set "RUNTIME_TITLE=%~1"
set "RUNTIME_DIR=%~2"
set "RUNTIME_CMD=%~3"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -WorkingDirectory '%RUNTIME_DIR%' -ArgumentList '/k','title %RUNTIME_TITLE% && %RUNTIME_CMD%' -WindowStyle Normal | Out-Null"
set "LAUNCH_EXIT=!ERRORLEVEL!"
if not "!LAUNCH_EXIT!"=="0" (
    echo Failed to launch %RUNTIME_TITLE%.
    exit /b !LAUNCH_EXIT!
)
exit /b 0

:stop_runtime
taskkill /FI "WINDOWTITLE eq Server Backend Runtime*" /F /T >nul 2>nul
taskkill /FI "WINDOWTITLE eq Server Frontend Runtime*" /F /T >nul 2>nul
call :kill_runtime_by_cmdline "Server Backend Runtime"
call :kill_runtime_by_cmdline "Server Frontend Runtime"
exit /b 0

:kill_runtime_by_cmdline
set "RUNTIME_MATCH=%~1"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" ^| Where-Object { $_.CommandLine -like '*%RUNTIME_MATCH%*' } ^| ForEach-Object { $_.ProcessId }"') do (
    taskkill /PID %%P /T /F >nul 2>nul
)
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