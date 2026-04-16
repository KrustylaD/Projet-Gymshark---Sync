@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_project.ps1" %*
    exit /b %ERRORLEVEL%
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_project.ps1" %*
exit /b %ERRORLEVEL%
