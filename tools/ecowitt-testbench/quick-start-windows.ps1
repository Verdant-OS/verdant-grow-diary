# Verdant EcoWitt Quick Bridge — mint-to-live in one command
# -----------------------------------------------------------
# Prompts once for the bridge token, writes it to .env (gitignored), prints
# the gateway settings to copy, and starts the raw pass-through bridge.
#
# Safety:
#   - The token is read as a SecureString and never echoed to the console.
#   - .env is gitignored; the token is never committed.
#   - The raw PASSKEY is never requested, printed, or stored — the bridge
#     derives the one-way fingerprint from the gateway's own payload.
#
# Usage (from tools/ecowitt-testbench):
#     .\quick-start-windows.ps1
#     .\quick-start-windows.ps1 -LogOnly     # receive + report, do not forward

[CmdletBinding()]
param(
    [switch]$LogOnly,
    [int]$Port = 8788,
    [string]$ProjectRef = "knkwiiywfkbqznbxwqfh"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$venvPython = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Error "Python venv missing. Run .\setup-windows.ps1 first."
    exit 1
}

$envFile = Join-Path $here ".env"
$ingestUrl = "https://$ProjectRef.supabase.co/functions/v1/ecowitt-ingest"

# --- token -----------------------------------------------------------------
$token = $null
if (-not $LogOnly) {
    if (Test-Path $envFile) {
        $existing = Get-Content $envFile | Where-Object { $_ -match '^VERDANT_BRIDGE_TOKEN=' }
        if ($existing) {
            $token = ($existing -split '=', 2)[1].Trim()
            Write-Host "[quick-start] using existing token from .env" -ForegroundColor DarkGray
        }
    }
    if (-not $token) {
        Write-Host ""
        Write-Host "  Mint a bridge token in the Verdant app:" -ForegroundColor Cyan
        Write-Host "    Tent settings -> Bridge tokens -> Mint token -> Copy"
        Write-Host ""
        $secure = Read-Host -AsSecureString "  Paste the bridge token (input hidden)"
        $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        if ([string]::IsNullOrWhiteSpace($token)) {
            Write-Error "No token entered."
            exit 1
        }
        # U+2026 and smart quotes silently break auth headers — catch early.
        if ($token -match '[‘’“”…]') {
            Write-Error "Token contains a smart quote or ellipsis. Re-copy it as plain text."
            exit 1
        }
        $lines = @()
        if (Test-Path $envFile) {
            $lines = Get-Content $envFile | Where-Object {
                $_ -notmatch '^(VERDANT_BRIDGE_TOKEN|VERDANT_INGEST_URL|VERDANT_QUICK_BRIDGE_PORT)='
            }
        }
        $lines += "VERDANT_BRIDGE_TOKEN=$token"
        $lines += "VERDANT_INGEST_URL=$ingestUrl"
        $lines += "VERDANT_QUICK_BRIDGE_PORT=$Port"
        Set-Content -Path $envFile -Value $lines -Encoding UTF8
        Write-Host "[quick-start] token saved to .env (gitignored)" -ForegroundColor Green
    }
}

# --- LAN address for the gateway -------------------------------------------
$lan = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' -and
        (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).InterfaceDescription -notmatch 'Hyper-V|Virtual|Loopback'
    } | Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "  Point the GW1200 at this bridge" -ForegroundColor Cyan
Write-Host "  (WS View -> your gateway -> Weather Services -> Customized)"
Write-Host ""
Write-Host "    Enable ........... On"
Write-Host "    Protocol ......... Ecowitt"
Write-Host "    Server/Hostname .. $lan"
Write-Host "    Path ............. /ecowitt"
Write-Host "    Port ............. $Port"
Write-Host "    Upload interval .. 60"
Write-Host ""

if ($LogOnly) {
    $env:VERDANT_INGEST_URL = ""
    $env:VERDANT_BRIDGE_TOKEN = ""
    Write-Host "[quick-start] LOG-ONLY: nothing will be forwarded." -ForegroundColor Yellow
} else {
    $env:VERDANT_INGEST_URL = $ingestUrl
    $env:VERDANT_BRIDGE_TOKEN = $token
}
$env:VERDANT_QUICK_BRIDGE_PORT = "$Port"

& $venvPython (Join-Path $here "quick_bridge.py")
