#Requires -Version 5.1
<#
.SYNOPSIS
  Root-level EcoWitt canary launcher for Windows operators.

.DESCRIPTION
  Locates the harness script relative to this launcher (so it works even
  if PowerShell opens in C:\WINDOWS\system32).  Delegates all prompts,
  validation, network calls, and redaction to the harness itself.

.NOTES
  Run from the repo root with:
      powershell -NoProfile -ExecutionPolicy Bypass -File .\Run-EcoWittCanary.ps1

  Dry-run (validates inputs + redaction, no network call):
      powershell -NoProfile -ExecutionPolicy Bypass -File .\Run-EcoWittCanary.ps1 -DryRun

  Write redacted matrix + SQL to a file (secrets never written):
      powershell -NoProfile -ExecutionPolicy Bypass -File .\Run-EcoWittCanary.ps1 -OutFile .\canary-out.txt

  Or double-click Run-EcoWittCanary.cmd in File Explorer.
#>
$ErrorActionPreference = 'Stop'

# Resolve the repo root from this script's location
$repoRoot   = $PSScriptRoot
$harnessPath = Join-Path $repoRoot 'scripts' 'ecowitt-canary-harness.ps1'

# --- harness presence check ---
if (-not (Test-Path $harnessPath)) {
  Write-Host "EcoWitt canary harness not found. Make sure you are using the latest Verdant repo." -ForegroundColor Red
  exit 1
}

# --- print resolved path (redacted secrets will be handled by the harness) ---
Write-Host "Repo root   : $repoRoot"
Write-Host "Harness     : $harnessPath"
Write-Host ""

# --- delegate to harness ---
# Pass all remaining arguments through; the harness is location-aware.
& $harnessPath @args

exit $LASTEXITCODE
