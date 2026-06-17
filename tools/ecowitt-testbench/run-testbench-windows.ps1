# Verdant EcoWitt Windows Testbench - One-command wrapper
# --------------------------------------------------------
# Runs preflight, setup, starts the listener in a new PowerShell window,
# waits briefly for /health, then runs verify.
#
# Safety:
#   - Does NOT read or print .env.
#   - Does NOT print bridge tokens.
#   - Does NOT post payloads by default.
#   - Does NOT call forwarding opt-in.
#
# Usage (from repo root OR from tools/ecowitt-testbench):
#   .\tools\ecowitt-testbench\run-testbench-windows.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Resolve-TestbenchDir {
    if (Test-Path (Join-Path $scriptDir "ecowitt_listener.py")) {
        return $scriptDir
    }
    $candidate = Join-Path (Get-Location).Path "tools\ecowitt-testbench"
    if (Test-Path (Join-Path $candidate "ecowitt_listener.py")) {
        return $candidate
    }
    return $null
}

$tbDir = Resolve-TestbenchDir
if (-not $tbDir) {
    Write-Host "Could not find tools\ecowitt-testbench. Run from repo root or the testbench folder." -ForegroundColor Red
    exit 1
}

Write-Host "=== Preflight ===" -ForegroundColor Cyan
& (Join-Path $tbDir "preflight-windows.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Preflight failed. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Setup ===" -ForegroundColor Cyan
& (Join-Path $tbDir "setup-windows.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Setup failed. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Start listener (new window) ===" -ForegroundColor Cyan
$startScript = Join-Path $tbDir "start-listener-windows.ps1"
try {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $startScript) `
        -WorkingDirectory $tbDir | Out-Null
    Write-Host "Listener launched in a new PowerShell window." -ForegroundColor Green
} catch {
    Write-Host "Could not auto-start listener: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Open a second PowerShell and run:" -ForegroundColor Yellow
    Write-Host "    cd `"$tbDir`""
    Write-Host "    .\start-listener-windows.ps1"
    Read-Host "Press ENTER once the listener is running"
}

Write-Host ""
Write-Host "=== Waiting for /health ===" -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $null = curl.exe --silent --fail --max-time 2 "http://localhost:8787/health"
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "Listener did not respond on http://localhost:8787/health within 20s." -ForegroundColor Red
    exit 1
}
Write-Host "Listener is up." -ForegroundColor Green

Write-Host ""
Write-Host "=== Verify ===" -ForegroundColor Cyan
& (Join-Path $tbDir "verify-testbench-windows.ps1")
$verifyExit = $LASTEXITCODE

Write-Host ""
Write-Host "=== Next steps (local-only, no token) ===" -ForegroundColor Cyan
Write-Host "  curl.exe http://localhost:8787/health"
Write-Host "  curl.exe http://localhost:8787/debug/status"
Write-Host "  curl.exe http://localhost:8787/debug/last-events"
Write-Host "  EcoWitt Customized Upload: Server=<LOCAL_PC_IP>, Port=8787, Path=/ecowitt, Protocol=Ecowitt"

if ($verifyExit -ne 0) { exit 1 }
exit 0
