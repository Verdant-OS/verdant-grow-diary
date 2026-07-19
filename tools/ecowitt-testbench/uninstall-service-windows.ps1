# Verdant EcoWitt Windows Testbench — Uninstall the Windows Service
# -----------------------------------------------------------------
# Stops and removes the VerdantEcoWittListener service installed by
# install-service-windows.ps1. Leaves .env, .venv, and logs in place.
#
# RUN AS ADMINISTRATOR, from this directory:
#     .\uninstall-service-windows.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$ServiceName = "VerdantEcoWittListener"

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error "This script must be run in an ELEVATED PowerShell (Run as administrator)."
    exit 1
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "[verdant-service] service '$ServiceName' is not installed. Nothing to do."
    exit 0
}

# Prefer nssm for a clean removal; fall back to sc.exe.
$nssmCmd = Get-Command nssm -ErrorAction SilentlyContinue
$localNssm = Join-Path $here "nssm.exe"
$nssm = if ($nssmCmd) { $nssmCmd.Source } elseif (Test-Path $localNssm) { $localNssm } else { $null }

Write-Host "[verdant-service] stopping and removing '$ServiceName' ..."
if ($nssm) {
    & $nssm stop $ServiceName 2>$null | Out-Null
    Start-Sleep -Seconds 2
    & $nssm remove $ServiceName confirm
} else {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
}

Start-Sleep -Seconds 1
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "[verdant-service] service still present; a reboot may be required to finish removal." -ForegroundColor Yellow
} else {
    Write-Host "[verdant-service] service removed." -ForegroundColor Green
}
