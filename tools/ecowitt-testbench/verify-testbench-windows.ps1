# Verdant EcoWitt Windows Testbench — one-command verification
# ============================================================
#
# Runs repo validation (typecheck + EcoWitt static safety vitest) and
# probes the local listener's safe debug endpoints. Does NOT start the
# listener, does NOT read or print .env, does NOT print bridge tokens,
# does NOT post payloads, and does NOT forward to Verdant.
#
# Usage (from repo root or from tools/ecowitt-testbench):
#   .\verify-testbench-windows.ps1
#
# Exits non-zero if any step fails.

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Definition
    if (Test-Path (Join-Path $here "ecowitt_listener.py")) {
        # We are inside tools/ecowitt-testbench
        return (Resolve-Path (Join-Path $here "..\..")).Path
    }
    if (Test-Path (Join-Path $here "package.json")) {
        return (Resolve-Path $here).Path
    }
    return (Get-Location).Path
}

$RepoRoot = Resolve-RepoRoot
$Failures = @()

$preflight = Join-Path $RepoRoot "tools\ecowitt-testbench\preflight-windows.ps1"
if (Test-Path $preflight) {
    & $preflight
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Preflight failed. Aborting verify." -ForegroundColor Red
        exit 1
    }
}

function Write-Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Invoke-Step($label, [scriptblock]$action) {
    Write-Host "-> $label" -ForegroundColor White
    try {
        & $action
        if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
            throw "exit code $LASTEXITCODE"
        }
        Write-Host "   PASS" -ForegroundColor Green
    } catch {
        Write-Host "   FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $script:Failures += $label
    }
}

Write-Section "Repo validation"
Push-Location $RepoRoot
try {
    Invoke-Step "bun run typecheck" { bun run typecheck }
} finally {
    Pop-Location
}

Write-Section "Static safety tests"
Push-Location $RepoRoot
try {
    Invoke-Step "bunx vitest run src/test/ecowitt-windows-testbench-static-safety.test.ts" {
        bunx vitest run src/test/ecowitt-windows-testbench-static-safety.test.ts --reporter=dot
    }
} finally {
    Pop-Location
}

Write-Section "Local listener checks"
$listenerUp = $true
try {
    $null = curl.exe --silent --fail --max-time 3 "http://localhost:8787/health"
    if ($LASTEXITCODE -ne 0) { $listenerUp = $false }
} catch {
    $listenerUp = $false
}

if (-not $listenerUp) {
    Write-Host "Listener is not responding on http://localhost:8787" -ForegroundColor Yellow
    Write-Host "Start the listener first: .\start-listener-windows.ps1" -ForegroundColor Yellow
    $Failures += "listener_not_running"
} else {
    Invoke-Step "GET /health" {
        curl.exe --silent --fail --max-time 5 "http://localhost:8787/health" | Out-Null
    }
    Invoke-Step "GET /debug/status" {
        curl.exe --silent --fail --max-time 5 "http://localhost:8787/debug/status" | Out-Null
    }
    Invoke-Step "GET /debug/forwarding-status" {
        curl.exe --silent --fail --max-time 5 "http://localhost:8787/debug/forwarding-status" | Out-Null
    }
    Invoke-Step "GET /debug/parse-diagnostics" {
        curl.exe --silent --fail --max-time 5 "http://localhost:8787/debug/parse-diagnostics" | Out-Null
    }
}

Write-Section "Next step"
if ($Failures.Count -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
    Write-Host "Send a demo payload (local only): .\send-demo-payload-windows.ps1" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Failures: $($Failures -join ', ')" -ForegroundColor Red
    Write-Host "Fix the failing step(s) above, then re-run .\verify-testbench-windows.ps1" -ForegroundColor Yellow
    exit 1
}
