@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT_DIR=%CD%"

if /i "%~1"=="--help" goto :usage
if /i "%~1"=="-h" goto :usage
if "%~1"=="" goto :usage_error
if "%~2"=="" goto :usage_error
if not "%~3"=="" goto :usage_error

set "BRANCH_INPUT=%~1"
set "MODE=%~2"

if /i "%MODE%"=="prod" set "MODE=production"

if /i "%BRANCH_INPUT%"=="main" (
    set "TARGET_BRANCH=main"
    set "BRANCH_LABEL=main"
) else if /i "%BRANCH_INPUT%"=="dev" (
    set "TARGET_BRANCH=development"
    set "BRANCH_LABEL=dev"
) else if /i "%BRANCH_INPUT%"=="development" (
    set "TARGET_BRANCH=development"
    set "BRANCH_LABEL=dev"
) else (
    echo Invalid branch "%~1". Use main or dev.
    goto :usage_error
)

if /i not "%MODE%"=="production" if /i not "%MODE%"=="dev" (
    echo Invalid mode "%~2". Use production or dev.
    goto :usage_error
)

where git >nul 2>nul
if errorlevel 1 (
    echo git is required but not found in PATH.
    exit /b 1
)

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

for /f "tokens=1,2,3" %%A in ('node -e "const c=require('./runtime/constants'); process.stdout.write(c.ports.backend+' '+c.ports.frontend+' '+c.server.gitPollIntervalSeconds)"') do (
    set "BACKEND_PORT=%%A"
    set "FRONTEND_PORT=%%B"
    set "POLL_INTERVAL_SECONDS=%%C"
)

if not defined BACKEND_PORT (
    echo Failed to load runtime constants from runtime/constants.js
    exit /b 1
)

if not defined POLL_INTERVAL_SECONDS set "POLL_INTERVAL_SECONDS=10"

set "VITE_TESTING=0"
set "DIRTY_WARNING_SHOWN=0"

for /f %%A in ('git -C "%ROOT_DIR%" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%A"
if defined CURRENT_BRANCH (
    if /i not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
        echo Switching branch from %CURRENT_BRANCH% to %TARGET_BRANCH%...
        git -C "%ROOT_DIR%" checkout %TARGET_BRANCH%
        if errorlevel 1 exit /b 1
    )
)

call :start_runtime
if errorlevel 1 exit /b 1

:poll_loop
timeout /t %POLL_INTERVAL_SECONDS% >nul
call :check_for_updates
goto :poll_loop

:start_runtime
call :ensure_dependencies "backend" "backend"
if errorlevel 1 exit /b 1

call :ensure_dependencies "frontend" "frontend"
if errorlevel 1 exit /b 1

if /i "%MODE%"=="production" (
    echo Building frontend for production...
    pushd "%ROOT_DIR%\frontend"
    call npm run build
    set "BUILD_EXIT=!ERRORLEVEL!"
    popd
    if not "!BUILD_EXIT!"=="0" exit /b !BUILD_EXIT!
)

echo Starting server runtime: branch=%BRANCH_LABEL% mode=%MODE% backend_port=%BACKEND_PORT% frontend_port=%FRONTEND_PORT%
call :stop_runtime

call :launch_runtime "MAMS Server Backend Runtime" "%ROOT_DIR%\backend" "npm run start"
if errorlevel 1 exit /b 1
if /i "%MODE%"=="production" (
    call :launch_runtime "MAMS Server Frontend Runtime" "%ROOT_DIR%\frontend" "npm run preview"
) else (
    call :launch_runtime "MAMS Server Frontend Runtime" "%ROOT_DIR%\frontend" "npm run dev"
)
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

:restart_runtime
echo Restarting runtime...
call :start_runtime
exit /b %ERRORLEVEL%

:stop_runtime
taskkill /FI "WINDOWTITLE eq MAMS Server Backend Runtime*" /F /T >nul 2>nul
taskkill /FI "WINDOWTITLE eq MAMS Server Frontend Runtime*" /F /T >nul 2>nul
call :kill_runtime_by_cmdline "title MAMS Server Backend Runtime"
call :kill_runtime_by_cmdline "title MAMS Server Frontend Runtime"
exit /b 0

:kill_runtime_by_cmdline
set "RUNTIME_MATCH=%~1"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" ^| Where-Object { $_.CommandLine -like '*%RUNTIME_MATCH%*' } ^| ForEach-Object { $_.ProcessId }"') do (
    taskkill /PID %%P /T /F >nul 2>nul
)
exit /b 0

:check_for_updates
echo Checking for updates on %TARGET_BRANCH%...

git -C "%ROOT_DIR%" diff --quiet --ignore-submodules HEAD -- >nul 2>nul
set "DIRTY_EXIT=%ERRORLEVEL%"
if "%DIRTY_EXIT%"=="1" (
    if not "!DIRTY_WARNING_SHOWN!"=="1" (
        echo Local changes detected; skipping auto-pull and restart until working tree is clean.
        set "DIRTY_WARNING_SHOWN=1"
    )
    exit /b 0
)
if not "%DIRTY_EXIT%"=="0" (
    echo Could not evaluate repository state; retrying on next poll.
    exit /b 0
)

if "!DIRTY_WARNING_SHOWN!"=="1" (
    echo Working tree is clean again; resuming update polling.
    set "DIRTY_WARNING_SHOWN=0"
)

git -C "%ROOT_DIR%" fetch origin %TARGET_BRANCH% >nul 2>nul
if errorlevel 1 (
    echo Git fetch failed; retrying on next poll.
    exit /b 0
)

set "LOCAL_HASH="
for /f %%A in ('git -C "%ROOT_DIR%" rev-parse HEAD 2^>nul') do set "LOCAL_HASH=%%A"

set "REMOTE_HASH="
for /f %%A in ('git -C "%ROOT_DIR%" rev-parse origin/%TARGET_BRANCH% 2^>nul') do set "REMOTE_HASH=%%A"

if not defined LOCAL_HASH (
    echo Could not resolve local hash; retrying on next poll.
    exit /b 0
)

if not defined REMOTE_HASH (
    echo Could not resolve remote hash; retrying on next poll.
    exit /b 0
)

if not "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo New commit found. Pulling and restarting...
    git -C "%ROOT_DIR%" pull origin %TARGET_BRANCH%
    if errorlevel 1 (
        echo Git pull failed; keeping current runtime.
        exit /b 0
    )

    call :restart_runtime
) else (
    echo Up to date.
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
echo Usage: .\run-server.bat [main^|dev] [production^|dev]
echo.
echo Examples:
echo   .\run-server.bat main production
echo   .\run-server.bat dev production
echo   .\run-server.bat main dev
echo   .\run-server.bat dev dev
exit /b 0

:usage_error
call :usage
exit /b 1