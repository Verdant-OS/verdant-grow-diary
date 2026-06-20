# Verdant EcoWitt Windows Testbench — Send Demo Payload
# ------------------------------------------------------
# Posts a SAFE demo payload (source = "demo", never live) to the local
# listener by default. If -ForwardToVerdant is passed AND a real
# VERDANT_INGEST_URL + VERDANT_BRIDGE_TOKEN are present in .env, the
# listener will forward to the validated ingest webhook.
#
# Usage:
#     .\send-demo-payload-windows.ps1
#     .\send-demo-payload-windows.ps1 -ForwardToVerdant

param(
    [switch]$ForwardToVerdant
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# Lightweight .env loader (no dependency on dotenv module).
$envPath = Join-Path $here ".env"
$envMap = @{}
if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $eq = $trimmed.IndexOf("=")
        if ($eq -lt 1) { continue }
        $k = $trimmed.Substring(0, $eq).Trim()
        $v = $trimmed.Substring($eq + 1).Trim().Trim('"').Trim("'")
        $envMap[$k] = $v
    }
}

function Test-AsciiHeaderSafe {
    param([string]$value)
    if (-not $value) { return $false }
    # Reject non-ASCII (e.g. unicode ellipsis '…' U+2026), placeholder
    # angle brackets, the literal "mint a token" guidance string, and any
    # whitespace inside the token.
    foreach ($ch in $value.ToCharArray()) {
        if ([int]$ch -gt 127) { return $false }
    }
    if ($value -match "[<>]") { return $false }
    if ($value -match "mint a token") { return $false }
    if ($value -match "\s") { return $false }
    return $true
}

function Get-MaskedToken {
    param([string]$token)
    if (-not $token) { return "<empty>" }
    if ($token.Length -le 10) { return "***" }
    return ($token.Substring(0, 7) + "..." + $token.Substring($token.Length - 3, 3))
}

$demoPayload = @{
    captured_at      = (Get-Date).ToUniversalTime().ToString("o")
    source           = "demo"
    vendor           = "ecowitt_windows_testbench"
    metrics          = @{
        temp_f             = 77.4
        humidity_percent   = 58
        soil_moisture_pct  = 33
        co2_ppm            = 721
    }
    metadata         = @{
        raw_payload = @{
            temp1f        = 77.4
            humidity1     = 58
            soilmoisture1 = 33
            co2           = 721
        }
        tent_id     = $envMap["VERDANT_TENT_ID"]
        note        = "verdant windows testbench demo payload"
    }
} | ConvertTo-Json -Depth 6

$ingestUrl = $envMap["VERDANT_INGEST_URL"]
$bridgeToken = $envMap["VERDANT_BRIDGE_TOKEN"]

if ($ForwardToVerdant) {
    if (-not $ingestUrl -or -not $bridgeToken) {
        Write-Error "Cannot forward: VERDANT_INGEST_URL and VERDANT_BRIDGE_TOKEN must both be set in .env."
        exit 1
    }
    $authHeader = "Bearer $bridgeToken"
    if (-not (Test-AsciiHeaderSafe $authHeader)) {
        Write-Error "Refusing to forward: Authorization header contains non-ASCII, placeholder, or whitespace characters. Token preview: $(Get-MaskedToken $bridgeToken)"
        exit 1
    }
    $headers = @{
        "Authorization"   = $authHeader
        "Content-Type"    = "application/json"
        "Idempotency-Key" = [guid]::NewGuid().ToString()
        "User-Agent"      = "ecowitt_windows_testbench/1.0"
    }
    Write-Host "[verdant-testbench] forwarding demo payload to ingest webhook (token $(Get-MaskedToken $bridgeToken))"
    Invoke-RestMethod -Method Post -Uri $ingestUrl -Headers $headers -Body $demoPayload
    exit 0
}

# Default: local-only post to listener.
$localUrl = "http://localhost:8787/ecowitt"
Write-Host "[verdant-testbench] posting demo payload to $localUrl (source=demo, local-only)"
Invoke-RestMethod -Method Post -Uri $localUrl `
    -Headers @{ "Content-Type" = "application/json" } `
    -Body $demoPayload
