# Verdant EcoWitt Windows Testbench — Setup
# ------------------------------------------
# Creates a local .venv and installs Python dependencies WITHOUT requiring
# PowerShell Activate.ps1. This avoids the UnauthorizedAccess execution
# policy error that often blocks Windows operators.
#
# Run from this directory:
#     .\setup-windows.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$preflight = Join-Path $here "preflight-windows.ps1"
if (Test-Path $preflight) {
    & $preflight
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Preflight failed. Fix the issues above before running setup."
        exit 1
    }
} else {
    Write-Host "[verdant-testbench] preflight-windows.ps1 not found alongside this script." -ForegroundColor Yellow
    Write-Host "You may be in the wrong folder. Expected: tools\ecowitt-testbench" -ForegroundColor Yellow
}

Write-Host "[verdant-testbench] working dir: $here"

# Locate a usable Python interpreter.
$pythonCmd = $null
foreach ($candidate in @("py", "python", "python3")) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) {
        $pythonCmd = $found.Source
        break
    }
}
if (-not $pythonCmd) {
    Write-Error "Python is not installed or not on PATH. Install Python 3.10+ from https://www.python.org/downloads/windows/ and re-run."
    exit 1
}
Write-Host "[verdant-testbench] using interpreter: $pythonCmd"

# Create the venv if missing.
$venvPython = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "[verdant-testbench] creating .venv ..."
    if ($pythonCmd -like "*py.exe" -or $pythonCmd -like "*\py*") {
        & $pythonCmd -3 -m venv .venv
    } else {
        & $pythonCmd -m venv .venv
    }
}

if (-not (Test-Path $venvPython)) {
    Write-Error "Failed to create .venv. See messages above."
    exit 1
}

Write-Host "[verdant-testbench] upgrading pip ..."
& $venvPython -m pip install --upgrade pip

Write-Host "[verdant-testbench] installing requirements ..."
& $venvPython -m pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Error "pip install failed. See messages above."
    exit 1
}

Write-Host ""
Write-Host "[verdant-testbench] SUCCESS. To start the listener, run:" -ForegroundColor Green
Write-Host "    .\start-listener-windows.ps1" -ForegroundColor Green
Write-Host ""
Write-Host "Then open: http://localhost:8787/health"
