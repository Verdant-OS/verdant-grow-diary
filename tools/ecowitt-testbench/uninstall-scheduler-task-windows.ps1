# Verdant EcoWitt Windows Testbench — Uninstall the Scheduled Task
# ----------------------------------------------------------------
# Stops and removes the \Verdant\VerdantEcoWittListener scheduled task created
# by install-scheduler-task-windows.ps1. Leaves .env, .venv, and logs in place.
#
# RUN AS ADMINISTRATOR, from this directory:
#     .\uninstall-scheduler-task-windows.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$TaskName = "VerdantEcoWittListener"
$TaskPath = "\Verdant\"

$principalCheck = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error "This script must be run in an ELEVATED PowerShell (Run as administrator)."
    exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "[verdant-task] task '$TaskPath$TaskName' is not registered. Nothing to do."
    exit 0
}

Write-Host "[verdant-task] stopping and removing '$TaskPath$TaskName' ..."
try { Stop-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 2
Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false

if (Get-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -ErrorAction SilentlyContinue) {
    Write-Host "[verdant-task] task still present — retry, or remove via taskschd.msc." -ForegroundColor Yellow
} else {
    Write-Host "[verdant-task] task removed." -ForegroundColor Green
}
