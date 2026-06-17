# Verdant EcoWitt Windows Testbench — Start Listener
# ---------------------------------------------------
# Runs the Flask listener using the venv Python directly. No Activate.ps1
# required, so PowerShell ExecutionPolicy will not block it.
#
# Run from this directory:
#     .\start-listener-windows.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$preflight = Join-Path $here "preflight-windows.ps1"
if (Test-Path $preflight) {
    & $preflight
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Preflight failed. Fix the issues above before starting the listener."
        exit 1
    }
} else {
    Write-Host "[verdant-testbench] preflight-windows.ps1 not found. You may be in the wrong folder." -ForegroundColor Yellow
}

$venvPython = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Error "Python venv not found at $venvPython. Run .\setup-windows.ps1 first."
    exit 1
}

# Smoke-test that flask is installed before starting the server.
& $venvPython -c "import flask" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Flask is not installed in .venv. Run .\setup-windows.ps1 to install dependencies."
    exit 1
}

Write-Host "[verdant-testbench] starting listener ..."
Write-Host "  Health:  http://localhost:8787/health"
Write-Host "  Demo:    http://localhost:8787/ecowitt?temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"
Write-Host ""

& $venvPython (Join-Path $here "ecowitt_listener.py")
