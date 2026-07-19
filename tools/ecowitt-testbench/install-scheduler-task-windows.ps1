# Verdant EcoWitt Windows Testbench — Install as a Scheduled Task (native)
# ------------------------------------------------------------------------
# Native alternative to install-service-windows.ps1 that needs NO third-party
# binary (no NSSM). Registers a Task Scheduler task that:
#   * starts at system boot (survives reboots),
#   * runs as SYSTEM with no interactive login required,
#   * restarts on failure, AND re-launches on a short repeating trigger with
#     "ignore new instance" so a dead listener is brought back within minutes
#     regardless of how it exited,
#   * has no execution time limit (a long-running listener won't be killed).
#
# This is NOT a Windows "service" (won't appear in services.msc) — it lives in
# Task Scheduler under \Verdant\. Use EITHER this OR the NSSM service, not both
# (they'd both try to bind port 8787).
#
# RUN AS ADMINISTRATOR, from this directory:
#     cd <path>\tools\ecowitt-testbench
#     .\install-scheduler-task-windows.ps1
#
# Prereqs (checked below):
#   * .venv exists  -> run .\setup-windows.ps1 first if not.
#   * .env exists with a LIVE VERDANT_BRIDGE_TOKEN.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$TaskName = "VerdantEcoWittListener"
$TaskPath = "\Verdant\"
$Description = "EcoWitt custom-upload listener forwarding to the Verdant sensor-ingest webhook. Starts at boot, restarts on failure."

# ---- 0. Must be elevated ----------------------------------------------------
$principalCheck = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error "This script must be run in an ELEVATED PowerShell (Run as administrator)."
    exit 1
}

# ---- 1. Validate listener + venv -------------------------------------------
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
    Write-Error "flask/python-dotenv not installed in .venv. Run .\setup-windows.ps1 first."
    exit 1
}

# ---- 1b. Warn if the NSSM service is also installed (port clash) ------------
if (Get-Service -Name "VerdantEcoWittListener" -ErrorAction SilentlyContinue) {
    Write-Host "[verdant-task] WARNING: an NSSM service 'VerdantEcoWittListener' is installed." -ForegroundColor Yellow
    Write-Host "  Run .\uninstall-service-windows.ps1 first — two listeners can't share port 8787." -ForegroundColor Yellow
}

# ---- 2. Warn (do not block) if .env / forwarding config looks incomplete ----
$envPath = Join-Path $here ".env"
$port = 8787
if (Test-Path $envPath) {
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
        Write-Host "[verdant-task] WARNING: .env may be incomplete for live forwarding." -ForegroundColor Yellow
        Write-Host "  Need: VERDANT_INGEST_URL, a LIVE VERDANT_BRIDGE_TOKEN, VERDANT_TENT_ID, VERDANT_FORWARD_MODE=live" -ForegroundColor Yellow
    }
} else {
    Write-Host "[verdant-task] WARNING: no .env found. Copy .env.example to .env and fill in a LIVE token first." -ForegroundColor Yellow
}

# ---- 3. Remove any prior task (idempotent) ---------------------------------
$existing = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[verdant-task] existing task found — replacing ..."
    try { Stop-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false
}

# ---- 4. Build task definition ----------------------------------------------
# Action: run the venv python on the listener; quote the script path for spaces.
$action = New-ScheduledTaskAction -Execute $venvPython -Argument ('"{0}"' -f $listener) -WorkingDirectory $here

# Triggers: at boot + a repeating "keepalive" trigger. The repetition combined
# with MultipleInstances=IgnoreNew means: if it's already up, the new trigger is
# ignored; if it died, the next tick relaunches it.
$trigStartup = New-ScheduledTaskTrigger -AtStartup
# -RepetitionInterval alone => indefinite repetition (empty Duration). Every 2
# minutes: if already running, MultipleInstances=IgnoreNew ignores the trigger;
# if dead, it relaunches.
$trigRepeat  = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)

# Run as SYSTEM, highest privileges — no stored password, runs before login.
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Reliability settings: survive battery, restart on failure, never time out,
# no duplicate instances, start if a scheduled start was missed.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

# ---- 5. Register + start ----------------------------------------------------
Write-Host "[verdant-task] registering scheduled task '$TaskPath$TaskName' ..."
Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath `
    -Action $action -Trigger @($trigStartup, $trigRepeat) `
    -Principal $principal -Settings $settings -Description $Description -Force | Out-Null

Write-Host "[verdant-task] starting task ..."
Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
Start-Sleep -Seconds 5

$info = Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "  Task          : $TaskPath$TaskName"
Write-Host "  Run as        : SYSTEM (starts at boot, no login needed)"
Write-Host "  Last run rc   : $($info.LastTaskResult)  (0 or 267009='still running' are good)"
Write-Host "  Health URL    : http://localhost:$port/health"
Write-Host "  Fwd status    : http://localhost:$port/debug/forwarding-status"
Write-Host ""

try {
    $health = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 6
    Write-Host "[verdant-task] /health responded OK:" -ForegroundColor Green
    $health | ConvertTo-Json -Depth 5
} catch {
    Write-Host "[verdant-task] /health did NOT respond yet: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  It may still be starting (keepalive retries every 2 min). Re-check /health shortly," -ForegroundColor Yellow
    Write-Host "  or inspect: Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '$TaskPath'" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Manage later:"
Write-Host "  Status  : Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '$TaskPath'   (or taskschd.msc)"
Write-Host "  Restart : Stop-ScheduledTask ...; Start-ScheduledTask -TaskName $TaskName -TaskPath '$TaskPath'"
Write-Host "  Remove  : .\uninstall-scheduler-task-windows.ps1"
Write-Host ""
Write-Host "NOTE: after editing .env (e.g. rotating the bridge token), restart the task" -ForegroundColor Cyan
Write-Host "      so the new value is picked up:" -ForegroundColor Cyan
Write-Host "      Stop-ScheduledTask -TaskName $TaskName -TaskPath '$TaskPath'; Start-ScheduledTask -TaskName $TaskName -TaskPath '$TaskPath'" -ForegroundColor Cyan
Write-Host ""
Write-Host "SYSTEM read access: the task reads .env as SYSTEM. If your checkout sits somewhere" -ForegroundColor DarkGray
Write-Host "SYSTEM can't read (rare; e.g. some OneDrive on-demand folders), move it to a normal" -ForegroundColor DarkGray
Write-Host "local path or re-register with -UserId '<you>' -LogonType S4U." -ForegroundColor DarkGray
