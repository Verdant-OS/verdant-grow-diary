# Verdant EcoWitt Windows Testbench — Install as a Windows Service
# -----------------------------------------------------------------
# Installs the Flask listener as a real Windows service so it:
#   * starts automatically on boot (survives reboots),
#   * restarts automatically if the process crashes,
#   * runs with no interactive login required.
#
# Uses NSSM (the Non-Sucking Service Manager) to wrap the venv Python +
# ecowitt_listener.py as a service. The listener auto-loads .env from this
# directory (python-dotenv), so no secrets are passed on the command line or
# baked into the service definition — keep them in .env as usual.
#
# RUN AS ADMINISTRATOR, from this directory:
#     # Right-click PowerShell -> "Run as administrator", then:
#     cd <path>\tools\ecowitt-testbench
#     .\install-service-windows.ps1
#
# Prereqs (this script checks them):
#   * .venv exists  -> run .\setup-windows.ps1 first if not.
#   * .env exists with a LIVE VERDANT_BRIDGE_TOKEN (the old one may be revoked).
#   * nssm available -> script tries winget/choco, or drop nssm.exe next to
#     this script / on PATH (https://nssm.cc/download).

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$ServiceName = "VerdantEcoWittListener"
$DisplayName = "Verdant EcoWitt Listener"
$Description = "EcoWitt custom-upload listener that forwards readings to the Verdant sensor-ingest webhook. Auto-starts on boot and restarts on failure."

# ---- 0. Must be elevated (service install requires admin) -------------------
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error "This script must be run in an ELEVATED PowerShell (Run as administrator)."
    exit 1
}

# ---- 1. Validate the listener + venv ---------------------------------------
$venvPython = Join-Path $here ".venv\Scripts\python.exe"
$listener   = Join-Path $here "ecowitt_listener.py"

if (-not (Test-Path $venvPython)) {
    Write-Error "Python venv not found at $venvPython. Run .\setup-windows.ps1 first."
    exit 1
}
if (-not (Test-Path $listener)) {
    Write-Error "ecowitt_listener.py not found at $listener. Are you in tools/ecowitt-testbench?"
    exit 1
}
& $venvPython -c "import flask, dotenv" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "flask/python-dotenv not installed in .venv. Run .\setup-windows.ps1 to install dependencies."
    exit 1
}

# ---- 2. Warn (do not block) if .env / forwarding config looks incomplete ----
$envPath = Join-Path $here ".env"
$port = 8787
if (Test-Path $envPath) {
    # Minimal, non-secret parse: only read the port for the post-install health
    # check. Never echo token/URL values.
    $hasToken = $false; $hasUrl = $false; $hasTent = $false; $forwardLive = $false
    foreach ($line in Get-Content $envPath) {
        $t = $line.Trim()
        if ($t -eq "" -or $t.StartsWith("#")) { continue }
        $kv = $t -split "=", 2
        if ($kv.Count -ne 2) { continue }
        $k = $kv[0].Trim(); $v = $kv[1].Trim().Trim('"')
        switch ($k) {
            "VERDANT_TESTBENCH_PORT" { if ($v -match '^\d+$') { $port = [int]$v } }
            "VERDANT_BRIDGE_TOKEN"   { if ($v -and $v -ne "vbt_REPLACE_WITH_REAL_TOKEN") { $hasToken = $true } }
            "VERDANT_INGEST_URL"     { if ($v) { $hasUrl = $true } }
            "VERDANT_TENT_ID"        { if ($v) { $hasTent = $true } }
            "VERDANT_FORWARD_MODE"   { if ($v.ToLower() -eq "live") { $forwardLive = $true } }
        }
    }
    if (-not ($hasToken -and $hasUrl -and $hasTent -and $forwardLive)) {
        Write-Host "[verdant-service] WARNING: .env may be incomplete for live forwarding." -ForegroundColor Yellow
        Write-Host "  Need: VERDANT_INGEST_URL, a LIVE VERDANT_BRIDGE_TOKEN, VERDANT_TENT_ID, VERDANT_FORWARD_MODE=live" -ForegroundColor Yellow
        Write-Host "  (The service will still install; readings just won't forward until .env is complete.)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[verdant-service] WARNING: no .env found. Copy .env.example to .env and fill in a LIVE token first." -ForegroundColor Yellow
}

# ---- 3. Locate nssm (PATH -> local copy -> winget -> choco) -----------------
function Resolve-Nssm {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $local = Join-Path $here "nssm.exe"
    if (Test-Path $local) { return $local }
    # Try winget, then choco. Non-fatal on failure — we re-probe after.
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "[verdant-service] installing nssm via winget ..."
        winget install --id NSSM.NSSM -e --source winget --accept-source-agreements --accept-package-agreements 2>$null | Out-Null
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "[verdant-service] installing nssm via choco ..."
        choco install nssm -y 2>$null | Out-Null
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$nssm = Resolve-Nssm
if (-not $nssm) {
    Write-Error @"
nssm was not found and could not be installed automatically.
Fix one of these, then re-run:
  * Download nssm from https://nssm.cc/download and either add it to PATH
    or drop nssm.exe next to this script ($here\nssm.exe).
  * Or install a package manager (winget/choco) and re-run.
"@
    exit 1
}
Write-Host "[verdant-service] using nssm: $nssm"

# ---- 4. Remove any prior install (idempotent) ------------------------------
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[verdant-service] existing service found — reinstalling cleanly ..."
    & $nssm stop $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & $nssm remove $ServiceName confirm 2>$null | Out-Null
    Start-Sleep -Seconds 1
}

# ---- 5. Install + configure the service ------------------------------------
$logDir = Join-Path $here "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$stdout = Join-Path $logDir "service.out.log"
$stderr = Join-Path $logDir "service.err.log"

Write-Host "[verdant-service] installing service '$ServiceName' ..."
& $nssm install $ServiceName $venvPython $listener
& $nssm set $ServiceName AppDirectory $here
& $nssm set $ServiceName DisplayName $DisplayName
& $nssm set $ServiceName Description $Description
& $nssm set $ServiceName Start SERVICE_AUTO_START

# Auto-restart on ANY unexpected exit, throttled so a crash-loop can't spin hot.
& $nssm set $ServiceName AppExit Default Restart
& $nssm set $ServiceName AppRestartDelay 5000
& $nssm set $ServiceName AppThrottle 5000

# Graceful stop: send CTRL-C, wait, then terminate.
& $nssm set $ServiceName AppStopMethodConsole 3000

# Rotating logs so diagnostics survive without growing forever.
& $nssm set $ServiceName AppStdout $stdout
& $nssm set $ServiceName AppStderr $stderr
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateOnline 1
& $nssm set $ServiceName AppRotateBytes 1048576

# ---- 6. Start + verify ------------------------------------------------------
Write-Host "[verdant-service] starting service ..."
& $nssm start $ServiceName | Out-Null
Start-Sleep -Seconds 4

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "  Service state : $($svc.Status)"
Write-Host "  Startup type  : automatic (starts on boot)"
Write-Host "  Health URL    : http://localhost:$port/health"
Write-Host "  Fwd status    : http://localhost:$port/debug/forwarding-status"
Write-Host "  Logs          : $logDir"
Write-Host ""

try {
    $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 6
    Write-Host "[verdant-service] /health responded OK:" -ForegroundColor Green
    $health | ConvertTo-Json -Depth 5
} catch {
    Write-Host "[verdant-service] /health did NOT respond yet: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  Check $stderr for startup errors, then: nssm status $ServiceName" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Manage later:"
Write-Host "  Status : nssm status $ServiceName    (or services.msc)"
Write-Host "  Restart: nssm restart $ServiceName"
Write-Host "  Logs   : Get-Content '$stderr' -Tail 50"
Write-Host "  Remove : .\uninstall-service-windows.ps1"
Write-Host ""
Write-Host "NOTE: after editing .env (e.g. rotating the bridge token), run" -ForegroundColor Cyan
Write-Host "      nssm restart $ServiceName   so the new value is picked up." -ForegroundColor Cyan
