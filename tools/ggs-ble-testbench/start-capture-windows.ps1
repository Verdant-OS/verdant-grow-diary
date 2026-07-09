# Spider Farmer GGS — read-only BLE capture (Windows helper)
# ---------------------------------------------------------------------------
# Creates/uses a local venv, installs bleak, then runs the read-only capture.
# READ-ONLY: this never writes to the controller. Close the Spider Farmer app
# first (BLE is 1:1) or the controller will refuse a second connection.
#
# Usage (from this folder in PowerShell):
#   .\start-capture-windows.ps1                 # capture until Ctrl+C
#   .\start-capture-windows.ps1 -Scan           # list BLE devices and exit
#   .\start-capture-windows.ps1 -Duration 120 -EmitDemo
# ---------------------------------------------------------------------------
param(
  [switch]$Scan,
  [double]$Duration = 0,
  [string]$Name = "GGS",
  [string]$Address = "",
  [int]$MaxFrames = 0,
  [switch]$EmitDemo,
  [ValidateSet("C", "F")][string]$Units = "C"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (-not (Test-Path ".\.venv")) {
  Write-Host "Creating virtual environment (.venv)..."
  python -m venv .venv
}
& ".\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt

$py = ".\.venv\Scripts\python.exe"

if ($Scan) {
  & $py ggs_ble_capture.py --scan
  exit $LASTEXITCODE
}

$argsList = @("ggs_ble_capture.py", "--units", $Units, "--name", $Name)
if ($Duration -gt 0)   { $argsList += @("--duration", $Duration) }
if ($MaxFrames -gt 0)  { $argsList += @("--max-frames", $MaxFrames) }
if ($Address -ne "")   { $argsList += @("--address", $Address) }
if ($EmitDemo)         { $argsList += "--emit-demo" }

Write-Host "Starting READ-ONLY GGS BLE capture. Ctrl+C to stop."
& $py @argsList
exit $LASTEXITCODE
