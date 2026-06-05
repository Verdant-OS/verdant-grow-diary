@echo off
REM EcoWitt Canary root launcher for Windows (CMD wrapper).
REM Double-click in File Explorer, or run from any terminal.
REM Keeps the window open so the operator can read results.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-EcoWittCanary.ps1" %*

if %ERRORLEVEL% neq 0 (
  echo EcoWitt canary exited with code %ERRORLEVEL%
) else (
  echo EcoWitt canary completed successfully.
)

echo.
echo Press any key to close...
pause > nul
