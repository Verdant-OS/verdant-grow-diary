<#
.SYNOPSIS
  PowerShell-native EcoWitt manual-canary harness for Windows operators.

.DESCRIPTION
  Safely prompts for the four required secrets, validates them BEFORE making
  any network call, runs the three canary POSTs (main, duplicate replay,
  malformed) against the deployed `ecowitt-ingest` edge function, and prints a
  redacted pass/fail matrix plus the SQL verification block.

  Raw secret values are NEVER printed. They are replaced with `vbt_REDACTED`,
  `PASSKEY_REDACTED`, and `MAC_REDACTED` in all output (including curl echoes
  and response bodies).

  This script is location-aware: it resolves the project root from its own
  path, so it works whether invoked from the repo root, via absolute path,
  or through the root launcher `Run-EcoWittCanary.ps1`.

.NOTES
  Run from the repo root with:

      powershell -ExecutionPolicy Bypass -File .\scripts\ecowitt-canary-harness.ps1

  Or use the root launcher (works from any working directory):

      powershell -NoProfile -ExecutionPolicy Bypass -File .\Run-EcoWittCanary.ps1

  Do NOT paste the curl command into any prompt. Paste only the requested
  single value (e.g. only the `vbt_...` bridge token).
#>


$ErrorActionPreference = 'Stop'

function Read-RequiredValue {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [switch]$Secret
  )
  if ($Secret) {
    $sec = Read-Host -Prompt $Label -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try {
      return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  } else {
    return (Read-Host -Prompt $Label)
  }
}

function Fail-Validation {
  param([string]$Message)
  Write-Host ""
  Write-Host "[VALIDATION ERROR] $Message" -ForegroundColor Red
  Write-Host "Aborting before any network call." -ForegroundColor Red
  exit 1
}

Write-Host "=== EcoWitt canary harness (PowerShell) ==="
Write-Host "Paste ONLY the requested value at each prompt. Do not paste a curl command."
Write-Host ""

$ProjectRef   = Read-RequiredValue -Label "SUPABASE_PROJECT_REF"
$BridgeToken  = Read-RequiredValue -Label "ECOWITT_BRIDGE_TOKEN (vbt_...)" -Secret
$TestPasskey  = Read-RequiredValue -Label "ECOWITT_TEST_PASSKEY"           -Secret
$TestMac      = Read-RequiredValue -Label "ECOWITT_TEST_MAC"               -Secret

# --- validation ---
if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  Fail-Validation "SUPABASE_PROJECT_REF is empty. Paste only the project ref (e.g. abcd1234)."
}
if ([string]::IsNullOrWhiteSpace($BridgeToken)) {
  Fail-Validation "Bridge token is empty. Paste only the vbt_... token."
}
if ($BridgeToken -match 'curl\.exe') {
  Fail-Validation "Bridge token looks invalid. Paste only the vbt_... token, not the curl command."
}
if ($BridgeToken -match '\s') {
  Fail-Validation "Bridge token contains whitespace. Paste only the single vbt_... token value."
}
if (-not $BridgeToken.StartsWith('vbt_')) {
  Fail-Validation "Bridge token must start with 'vbt_'. Mint a fresh token in the Tent Bridge Tokens panel."
}
if ([string]::IsNullOrWhiteSpace($TestPasskey)) {
  Fail-Validation "PASSKEY is empty. Paste only the EcoWitt PASSKEY value."
}
if ($TestPasskey -match 'curl\.exe') {
  Fail-Validation "PASSKEY looks invalid. Paste only the PASSKEY value, not the curl command."
}
if ([string]::IsNullOrWhiteSpace($TestMac)) {
  Fail-Validation "MAC is empty. Paste only the EcoWitt MAC value."
}
if ($TestMac -match 'curl\.exe') {
  Fail-Validation "MAC looks invalid. Paste only the MAC value, not the curl command."
}

$Endpoint = "https://$ProjectRef.supabase.co/functions/v1/ecowitt-ingest"
Write-Host ""
Write-Host "Endpoint: $Endpoint"
Write-Host "Auth     : Bearer vbt_REDACTED"
Write-Host "PASSKEY  : PASSKEY_REDACTED"
Write-Host "MAC      : MAC_REDACTED"
Write-Host ""

# --- pass/fail tracking ---
$script:PassCount = 0
$script:FailCount = 0
$script:FailNotes = New-Object System.Collections.Generic.List[string]
function Mark-Pass { param($m) Write-Host "  [PASS] $m" -ForegroundColor Green; $script:PassCount++ }
function Mark-Fail { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red;   $script:FailCount++; $script:FailNotes.Add($m) | Out-Null }

function Redact {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  $out = $Text
  if ($BridgeToken) { $out = $out.Replace($BridgeToken, 'vbt_REDACTED') }
  if ($TestPasskey) { $out = $out.Replace($TestPasskey, 'PASSKEY_REDACTED') }
  if ($TestMac)     { $out = $out.Replace($TestMac,     'MAC_REDACTED') }
  return $out
}

function Invoke-CanaryPost {
  param(
    [string]$Label,
    [string]$DateUtc,
    [string]$Temp1f
  )

  Write-Host ""
  Write-Host "=== POST: $Label (dateutc=$DateUtc) ==="

  $bodyFile = [System.IO.Path]::GetTempFileName()
  $args = @(
    '-sS', '-o', $bodyFile, '-w', '%{http_code}',
    '-X', 'POST', $Endpoint,
    '-H', "Authorization: Bearer $BridgeToken",
    '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-urlencode', "PASSKEY=$TestPasskey",
    '--data-urlencode', "MAC=$TestMac",
    '--data-urlencode', 'api_key=SHOULD_NOT_PERSIST',
    '--data-urlencode', 'application_key=SHOULD_NOT_PERSIST',
    '--data-urlencode', 'token=SHOULD_NOT_PERSIST',
    '--data-urlencode', 'user_id=99999',
    '--data-urlencode', "dateutc=$DateUtc",
    '--data-urlencode', "temp1f=$Temp1f",
    '--data-urlencode', 'humidity1=48',
    '--data-urlencode', 'soilmoisture1=42',
    '--data-urlencode', 'temp9f=81.0',
    '--data-urlencode', 'humidity9=50',
    '--data-urlencode', 'soilmoisture9=55'
  )

  $httpCode = & curl.exe @args
  $rawBody  = if (Test-Path $bodyFile) { Get-Content $bodyFile -Raw } else { "" }
  Remove-Item $bodyFile -ErrorAction SilentlyContinue

  $safeBody = Redact $rawBody
  Write-Host "  HTTP $httpCode ($Label)"
  Write-Host "  body : $safeBody"

  if ($httpCode -eq '200') { Mark-Pass "$Label HTTP 200" } else { Mark-Fail "$Label HTTP=$httpCode" }

  if ($rawBody -and ($rawBody.Contains($BridgeToken))) { Mark-Fail "$Label response leaked raw bridge token" } else { Mark-Pass "$Label no raw bridge token in response" }
  if ($rawBody -and ($rawBody.Contains($TestPasskey))) { Mark-Fail "$Label response leaked raw PASSKEY" }      else { Mark-Pass "$Label no raw PASSKEY in response" }
  if ($rawBody -and ($rawBody.Contains($TestMac)))     { Mark-Fail "$Label response leaked raw MAC" }          else { Mark-Pass "$Label no raw MAC in response" }
}

Invoke-CanaryPost -Label "main"      -DateUtc "2026-06-04 21:00:00" -Temp1f "79.2"
Invoke-CanaryPost -Label "duplicate" -DateUtc "2026-06-04 21:00:00" -Temp1f "79.2"
Invoke-CanaryPost -Label "malformed" -DateUtc "2026-06-04 21:05:00" -Temp1f "abc"

Write-Host ""
Write-Host "=== Pass/fail matrix ==="
Write-Host ("  passed: {0}" -f $script:PassCount)
Write-Host ("  failed: {0}" -f $script:FailCount)
if ($script:FailCount -gt 0) {
  Write-Host "  failures:" -ForegroundColor Red
  foreach ($n in $script:FailNotes) { Write-Host "    - $n" -ForegroundColor Red }
}

Write-Host ""
Write-Host "=== SQL verification (run in Supabase SQL editor) ==="
$sql = @'
-- recent rows for the canary window
SELECT id, captured_at, metric, value, raw_payload->>'channel' AS channel,
       raw_payload->>'timestamp_source' AS ts_src
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND captured_at >= '2026-06-04 20:55:00+00'
ORDER BY captured_at, metric;

-- main canary count: expect 4 rows
SELECT metric, COUNT(*) AS n
FROM public.sensor_readings
WHERE source = 'ecowitt' AND captured_at = '2026-06-04 21:00:00+00'
GROUP BY metric ORDER BY metric;

-- malformed canary count: expect 2 rows (humidity_pct, soil_moisture_pct)
SELECT metric, COUNT(*) AS n
FROM public.sensor_readings
WHERE source = 'ecowitt' AND captured_at = '2026-06-04 21:05:00+00'
GROUP BY metric ORDER BY metric;

-- duplicate replay: count must equal main count (idempotent)
SELECT COUNT(*) AS rows_at_main_ts
FROM public.sensor_readings
WHERE source = 'ecowitt' AND captured_at = '2026-06-04 21:00:00+00';

-- channel 9 unmapped negative-control: expect 0
SELECT COUNT(*) AS channel_9_rows
FROM public.sensor_readings
WHERE source = 'ecowitt' AND raw_payload->>'channel' = '9';

-- leak scan by key names: expect 0
SELECT COUNT(*) AS leaks
FROM public.sensor_readings
WHERE source = 'ecowitt'
  AND raw_payload::text ~* '(passkey|"mac"|api[_-]?key|application[_-]?key|token|auth|service_role|"user_id")';

-- null captured_at guard: expect 0
SELECT COUNT(*) AS null_captured_at_rows
FROM public.sensor_readings
WHERE source = 'ecowitt' AND captured_at IS NULL;

-- idempotency index definition (sanity check)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'sensor_readings';
'@
Write-Host $sql

Write-Host ""
Write-Host "Now paste the scrubbed SQL output into ChatGPT for GO/NO-GO grading." -ForegroundColor Cyan

if ($script:FailCount -gt 0) { exit 1 } else { exit 0 }
