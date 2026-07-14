<#
.SYNOPSIS
  Local-only readiness helper for the Pheno Tracker Pro live release gate.

.DESCRIPTION
  Runs on the operator's Windows machine ONLY. Verifies that the credential
  file for the live release gate exists inside the current repo clone, is
  gitignored, contains every required variable name, and contains no
  placeholders. Prints variable names and per-variable status only — never
  values.

  Does NOT run the live smoke. That still requires:
      bun run release:pheno:live-gate

.PARAMETER RepoRoot
  Absolute or relative path to the local Verdant repo clone. Defaults to the
  current working directory.

.PARAMETER EnvFile
  Path to the gitignored credential file. Relative paths are resolved against
  RepoRoot. Absolute paths must still resolve inside RepoRoot.

.OUTPUTS
  Exit codes:
    0 = READY
    1 = FAIL (unsafe path, malformed file, invalid confirmation, duplicates,
             file not inside repo, file not gitignored)
    2 = BLOCKED (missing required names, blank values, or placeholder values)
#>
param(
  [string]$RepoRoot = (Get-Location).Path,
  [string]$EnvFile = "e2e/.fixtures/pheno-live-smoke.env"
)

$ErrorActionPreference = "Stop"

$RequiredNames = @(
  "E2E_PHENO_LIVE_SMOKE_CONFIRM",
  "E2E_PHENO_FREE_EMAIL",
  "E2E_PHENO_FREE_PASSWORD",
  "E2E_PHENO_PRO_EMAIL",
  "E2E_PHENO_PRO_PASSWORD",
  "E2E_PHENO_FOUNDER_EMAIL",
  "E2E_PHENO_FOUNDER_PASSWORD",
  "E2E_PHENO_CANCELED_EMAIL",
  "E2E_PHENO_CANCELED_PASSWORD",
  "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
  "E2E_PHENO_HUNT_ID_COMPARISON_READY"
)
$ConfirmName = "E2E_PHENO_LIVE_SMOKE_CONFIRM"
$ConfirmValue = "RUN_LIVE_PHENO_SMOKE"

$PlaceholderExact = @("REPLACE_ME", "...", "TODO", "CHANGEME", "example@example.com")
$PlaceholderPrefixes = @("YOUR_")

function Test-Placeholder([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return "BLANK" }
  $t = $value.Trim()
  if ($PlaceholderExact -contains $t) { return "PLACEHOLDER" }
  if ($t -match '^<.*>$') { return "PLACEHOLDER" }
  foreach ($p in $PlaceholderPrefixes) {
    if ($t.StartsWith($p)) { return "PLACEHOLDER" }
  }
  return "OK"
}

function Fail([string]$msg, [int]$code) {
  Write-Host "FAIL $msg"
  Write-Host ""
  Write-Host "Final status: FAIL"
  exit $code
}

Write-Host "Pheno Tracker live-smoke local readiness"
Write-Host "----------------------------------------"

# 1. Resolve RepoRoot
try { $repo = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath }
catch { Fail "RepoRoot does not exist" 1 }

# 2. Confirm it is a git repository
if (-not (Test-Path (Join-Path $repo ".git"))) {
  Fail "RepoRoot is not a Git repository (no .git directory)" 1
}
Write-Host "RepoRoot resolved"

# 3+4. Resolve EnvFile relative to RepoRoot; confirm it stays inside repo
if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  $envPathAbs = $EnvFile
} else {
  $envPathAbs = Join-Path $repo $EnvFile
}
try { $envPathAbs = [System.IO.Path]::GetFullPath($envPathAbs) } catch { Fail "EnvFile path is not valid" 1 }
$repoFull = [System.IO.Path]::GetFullPath($repo).TrimEnd('\','/')
if (-not ($envPathAbs.StartsWith($repoFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
  Fail "EnvFile resolves outside the repository" 1
}

# 5. Confirm the file exists
if (-not (Test-Path -LiteralPath $envPathAbs -PathType Leaf)) {
  Write-Host "MISSING credential file (path is inside repo but not present)"
  Write-Host ""
  Write-Host "Final status: BLOCKED"
  exit 2
}
Write-Host "Credential file present"

# 6. Confirm git check-ignore reports the file as ignored
Push-Location $repo
try {
  $rel = [System.IO.Path]::GetRelativePath($repoFull, $envPathAbs)
  & git check-ignore --quiet -- $rel
  $ignoreExit = $LASTEXITCODE
} finally { Pop-Location }
if ($ignoreExit -ne 0) {
  Fail "Credential file is not gitignored — refusing to proceed" 1
}
Write-Host "Credential file is gitignored"
Write-Host ""

# 7. Parse without printing values
$lines = Get-Content -LiteralPath $envPathAbs -Encoding UTF8
$values = @{}
$seen = @{}
$parseErrors = @()
$duplicates = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
  $raw = $lines[$i]
  $line = $raw -replace '^\uFEFF',''
  $trim = $line.Trim()
  if ($trim -eq "" -or $trim.StartsWith("#")) { continue }
  $eq = $line.IndexOf("=")
  if ($eq -le 0) { $parseErrors += "malformed line $($i+1) (no '=')"; continue }
  $key = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1)
  $q = $val.Trim()
  if (($q.StartsWith('"') -and $q.EndsWith('"') -and $q.Length -ge 2) -or
      ($q.StartsWith("'") -and $q.EndsWith("'") -and $q.Length -ge 2)) {
    $val = $q.Substring(1, $q.Length - 2)
  }
  if ($key -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    $parseErrors += "malformed line $($i+1) (invalid variable name)"
    continue
  }
  if ($seen.ContainsKey($key)) {
    if (-not ($duplicates -contains $key)) { $duplicates += $key }
  }
  $seen[$key] = $true
  $values[$key] = $val
}

foreach ($e in $parseErrors) { Write-Host "FAIL $e" }
foreach ($d in $duplicates) { Write-Host "FAIL DUPLICATE $d" }

# 8+9. Validate required names + reject placeholders
$missing = @()
$placeholders = @()
$invalid = @()

foreach ($name in $RequiredNames) {
  if (-not $values.ContainsKey($name)) {
    Write-Host "MISSING     $name"
    $missing += $name
    continue
  }
  $cls = Test-Placeholder $values[$name]
  switch ($cls) {
    "BLANK"       { Write-Host "MISSING     $name"; $missing += $name }
    "PLACEHOLDER" { Write-Host "PLACEHOLDER $name"; $placeholders += $name }
    default {
      if ($name -eq $ConfirmName -and $values[$name] -ne $ConfirmValue) {
        Write-Host "INVALID     $name"
        $invalid += $name
      } else {
        Write-Host "PRESENT     $name"
      }
    }
  }
}

Write-Host ""
if ($parseErrors.Count -gt 0 -or $duplicates.Count -gt 0 -or $invalid.Count -gt 0) {
  Write-Host "Final status: FAIL"
  exit 1
}
if ($missing.Count -gt 0 -or $placeholders.Count -gt 0) {
  Write-Host "Final status: BLOCKED"
  exit 2
}

Write-Host "Final status: READY"
Write-Host "Next: bun run release:pheno:live-gate  (same machine, same clone)"
exit 0
