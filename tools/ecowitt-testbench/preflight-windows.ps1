# Verdant EcoWitt Windows Testbench - Preflight
# ----------------------------------------------
# Verifies the operator is inside the Verdant repo (not C:\Users\G7 or
# the old standalone C:\Users\G7\verdant-testbench folder) and that all
# expected committed kit files are present.
#
# Safety:
#   - Does NOT read or print .env.
#   - Does NOT print bridge tokens.
#   - Does NOT start the listener.
#   - Does NOT forward anything. Does not call -ForwardToVerdant.
#
# Usage (from repo root OR from tools/ecowitt-testbench):
#   .\preflight-windows.ps1

$ErrorActionPreference = "Stop"

function Find-RepoRoot {
    $start = Split-Path -Parent $MyInvocation.MyCommand.Definition
    $candidates = @($start, (Get-Location).Path)
    foreach ($c in $candidates) {
        $dir = (Resolve-Path $c).Path
        for ($i = 0; $i -lt 6; $i++) {
            $hasGit = Test-Path (Join-Path $dir ".git")
            $hasPkg = Test-Path (Join-Path $dir "package.json")
            $hasTools = Test-Path (Join-Path $dir "tools\ecowitt-testbench")
            if (($hasGit -or $hasPkg) -and $hasTools) {
                return $dir
            }
            $parent = Split-Path -Parent $dir
            if (-not $parent -or $parent -eq $dir) { break }
            $dir = $parent
        }
    }
    return $null
}

$cwd = (Get-Location).Path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Find-RepoRoot

Write-Host "[preflight] current directory: $cwd"
Write-Host "[preflight] script directory:  $scriptDir"
if ($repoRoot) {
    Write-Host "[preflight] detected repo root: $repoRoot" -ForegroundColor Green
} else {
    Write-Host "[preflight] detected repo root: (none)" -ForegroundColor Yellow
}

# Detect old standalone folder pattern.
$looksLikeOldStandalone = $false
foreach ($p in @($cwd, $scriptDir)) {
    if ($p -match '(?i)\\verdant-testbench$' -and $p -notmatch '(?i)\\tools\\ecowitt-testbench$') {
        $looksLikeOldStandalone = $true
    }
    if ($p -match '(?i)C:\\Users\\[^\\]+\\verdant-testbench($|\\)') {
        $looksLikeOldStandalone = $true
    }
}
if ($looksLikeOldStandalone) {
    Write-Host ""
    Write-Host "This looks like the old standalone testbench folder, not the repo-integrated kit." -ForegroundColor Yellow
    Write-Host "Expected path ends with: verdant-grow-diary\tools\ecowitt-testbench" -ForegroundColor Yellow
}

$missing = @()

if (-not $repoRoot) {
    $missing += "repo-root (no .git/package.json + tools\ecowitt-testbench found)"
} else {
    $testbenchDir = Join-Path $repoRoot "tools\ecowitt-testbench"
    if (-not (Test-Path $testbenchDir)) {
        $missing += "tools\ecowitt-testbench"
    }

    $expectedKit = @(
        ".env.example",
        "ecowitt_listener.py",
        "requirements.txt",
        "send-demo-payload-windows.ps1",
        "setup-windows.ps1",
        "start-listener-windows.ps1",
        "verify-testbench-windows.ps1",
        "preflight-windows.ps1"
    )
    foreach ($f in $expectedKit) {
        $full = Join-Path $testbenchDir $f
        if (-not (Test-Path $full)) { $missing += "tools\ecowitt-testbench\$f" }
    }

    $expectedRepo = @(
        "docs\ecowitt-windows-testbench.md",
        "src\test\ecowitt-windows-testbench-static-safety.test.ts",
        ".github\workflows\ecowitt-testbench-safety.yml"
    )
    foreach ($f in $expectedRepo) {
        $full = Join-Path $repoRoot $f
        if (-not (Test-Path $full)) { $missing += $f }
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[preflight] MISSING files:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Recommended commands:" -ForegroundColor Yellow
    Write-Host "  git status"
    Write-Host "  git pull origin verdant-grow-diary"
    Write-Host "  dir tools\ecowitt-testbench"
    exit 1
}

Write-Host ""
Write-Host "[preflight] OK. Repo-integrated EcoWitt testbench kit looks complete." -ForegroundColor Green
exit 0
