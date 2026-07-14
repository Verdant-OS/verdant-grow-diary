[CmdletBinding()]
<#
.SYNOPSIS
  Preserve the frozen P.2 files into a new branch, byte-for-byte.

.DESCRIPTION
  Orchestrates: load contract -> pin base remote SHA -> preflight -> verify source
  bytes -> (apply) branch from base -> copy exact bytes -> stage ONLY the three
  files with EOL normalization disabled -> assert exactly three staged ->
  verify-staged-bytes -> re-check base SHA (TOCTOU) -> commit -> non-force push.

  The contract (paths, sizes, SHA-256, base/target branch) is the single source of
  truth in contract.mjs; this script never hard-codes it. Byte integrity is proven
  by scripts/p3-preservation/verify-staged-bytes.mjs.

  -DryRun runs every read-only check and prints the plan, then stops before any
  mutation (no branch, copy, stage, commit, or push).

.NOTES
  Native git/node calls run with a relaxed ErrorActionPreference because a native
  command writing to stderr would otherwise terminate the script under Windows
  PowerShell 5.1 + Stop. Exit codes are checked explicitly.
#>
param(
    [Parameter(Mandatory)][string]$SourceWorktree,
    [string]$DestRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$Remote = "origin",
    [string]$CommitMessage,
    [switch]$RequireGh,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ContractPath = Join-Path $ScriptDir "contract.mjs"
$PreflightPath = Join-Path $ScriptDir "preflight.mjs"
$VerifyPath = Join-Path $ScriptDir "verify-staged-bytes.mjs"

# ---- helpers ---------------------------------------------------------------

function Invoke-Proc {
    # Run a native command with ErrorActionPreference relaxed so stderr does not
    # escalate to a terminating error under 5.1 + Stop. Returns exit code + merged output.
    param(
        [Parameter(Mandatory)][string]$File,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & $File @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ ExitCode = $code; Output = ($out | Out-String) }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$File,
        [Parameter(Mandatory)][string[]]$Arguments,
        [string]$What
    )
    $r = Invoke-Proc -File $File -Arguments $Arguments
    if ($r.ExitCode -ne 0) {
        $label = if ([string]::IsNullOrEmpty($What)) { "$File $($Arguments -join ' ')" } else { $What }
        throw "$label failed (exit $($r.ExitCode)):`n$($r.Output.Trim())"
    }
    return $r.Output
}

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$GitArgs, [switch]$Checked, [string]$What)
    $all = @("-C", $DestRepo) + $GitArgs
    if ($Checked) { return Invoke-Checked -File "git" -Arguments $all -What $What }
    return Invoke-Proc -File "git" -Arguments $all
}

function Get-P3Contract {
    $url = "file:///" + ($ContractPath -replace '\\', '/')
    $expr = "import('$url').then(m => process.stdout.write(JSON.stringify(m.P3_CONTRACT))).catch(e => { console.error(e); process.exit(1); })"
    $json = Invoke-Checked -File "node" -Arguments @("-e", $expr) -What "load contract.mjs"
    return ($json | ConvertFrom-Json)
}

function Get-RemoteSha {
    param([Parameter(Mandatory)][string]$Branch)
    $out = (Invoke-Git -GitArgs @("ls-remote", $Remote, "refs/heads/$Branch") -Checked -What "ls-remote $Branch").Trim()
    if ([string]::IsNullOrWhiteSpace($out)) { return $null }
    return ($out -split "`n")[0].Split("`t")[0].Trim()
}

function Get-FileSha256Lower {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-FilesMatchContract {
    # Verify each contract file under $Root matches size + SHA-256. Returns $true or throws.
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)]$Contract, [Parameter(Mandatory)][string]$Label)
    foreach ($f in $Contract.files) {
        $p = Join-Path $Root $f.path
        if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "$Label missing file: $($f.path)" }
        $len = (Get-Item -LiteralPath $p).Length
        if ($len -ne $f.bytes) { throw "$Label size mismatch for $($f.path): $len != $($f.bytes)" }
        $sha = Get-FileSha256Lower -Path $p
        if ($sha -ne $f.sha256.ToLowerInvariant()) { throw "$Label sha mismatch for $($f.path): $sha != $($f.sha256)" }
    }
    return $true
}

function Write-Step { param([string]$Text) Write-Host "==> $Text" -ForegroundColor Cyan }

# ---- read-only phase (runs in both dry-run and apply) ----------------------

try {
    Write-Host ("P.3 preservation " + ($(if ($DryRun) { "(DRY-RUN)" } else { "(APPLY)" }))) -ForegroundColor Green
    Write-Host "Destination: $DestRepo"
    Write-Host "Source:      $SourceWorktree"
    Write-Host ""

    Write-Step "Loading contract"
    $contract = Get-P3Contract
    $base = $contract.baseBranch
    $target = $contract.targetBranch
    $paths = @($contract.files | ForEach-Object { $_.path })
    Write-Host "Base branch:   $base"
    Write-Host "Target branch: $target"
    Write-Host "Files:         $($paths.Count)"

    Write-Step "Pinning base remote SHA"
    $baseSha = Get-RemoteSha -Branch $base
    if (-not $baseSha) { throw "Base branch '$base' not found on '$Remote'." }
    Write-Host "Base $Remote/$base @ $baseSha"

    Write-Step "Preflight"
    $pfArgs = @($PreflightPath, "--dest", $DestRepo, "--source", $SourceWorktree, "--expected-base-sha", $baseSha)
    if ($RequireGh) { $pfArgs += "--require-gh" }
    $pf = Invoke-Proc -File "node" -Arguments $pfArgs
    Write-Host $pf.Output.TrimEnd()
    if ($pf.ExitCode -ne 0) { throw "Preflight blocked (exit $($pf.ExitCode)). Nothing was changed." }

    Write-Step "Verifying source bytes against contract"
    Assert-FilesMatchContract -Root $SourceWorktree -Contract $contract -Label "source" | Out-Null
    Write-Host "Source matches the contract (size + SHA-256)."

    $CommitMessage = if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        @"
chore(p3): preserve frozen pheno-candidate-number foundation

Byte-exact preservation of the frozen P.2 artifacts, verified against
scripts/p3-preservation/contract.mjs (raw size + SHA-256). EOL normalization
is disabled on staging/commit so the committed blobs equal the frozen bytes.
"@
    } else { $CommitMessage }

    Write-Host ""
    Write-Host "----- PLAN -----" -ForegroundColor Yellow
    Write-Host "Branch $target from $Remote/$base @ $($baseSha.Substring(0,12))"
    foreach ($f in $contract.files) { Write-Host ("  copy + stage  {0}  ({1} B, {2})" -f $f.path, $f.bytes, $f.sha256.Substring(0,12)) }
    Write-Host "Stage with core.autocrlf=false core.eol=lf (exact bytes), assert exactly $($paths.Count) staged"
    Write-Host "Re-check base SHA unchanged, then: git push $Remote $target (no --force)"
    Write-Host "----------------" -ForegroundColor Yellow
    Write-Host ""

    if ($DryRun) {
        Write-Host "DRY-RUN complete - all read-only checks passed; no branch, copy, commit, or push was made." -ForegroundColor Green
        exit 0
    }

    # ---- mutation phase ----------------------------------------------------

    Write-Step "Creating branch $target from pinned base"
    Invoke-Git -GitArgs @("fetch", $Remote, $base) -Checked -What "git fetch $base" | Out-Null
    Invoke-Git -GitArgs @("checkout", "-b", $target, $baseSha) -Checked -What "git checkout -b $target" | Out-Null

    Write-Step "Copying exact bytes into the destination"
    foreach ($f in $contract.files) {
        $src = Join-Path $SourceWorktree $f.path
        $dst = Join-Path $DestRepo $f.path
        $dstDir = Split-Path -Parent $dst
        if (-not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
    Assert-FilesMatchContract -Root $DestRepo -Contract $contract -Label "destination" | Out-Null
    Write-Host "Destination copies match the contract."

    Write-Step "Staging exactly the contract files (no EOL normalization)"
    $addArgs = @("-c", "core.autocrlf=false", "-c", "core.eol=lf", "add", "--") + $paths
    Invoke-Git -GitArgs $addArgs -Checked -What "git add" | Out-Null

    $stagedRaw = (Invoke-Git -GitArgs @("diff", "--cached", "--name-only") -Checked -What "git diff --cached").Trim()
    $staged = @($stagedRaw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $stagedSorted = ($staged | Sort-Object) -join "`n"
    $expectedSorted = (@($paths) | Sort-Object) -join "`n"
    if ($stagedSorted -ne $expectedSorted) {
        throw "Staged set is not exactly the contract files.`nExpected:`n$expectedSorted`nStaged:`n$stagedSorted"
    }
    Write-Host "Exactly $($staged.Count) contract files staged."

    Write-Step "verify-staged-bytes"
    $vb = Invoke-Proc -File "node" -Arguments @($VerifyPath, "--repo", $DestRepo)
    Write-Host $vb.Output.TrimEnd()
    if ($vb.ExitCode -ne 0) { throw "verify-staged-bytes failed (exit $($vb.ExitCode)). Not committing." }

    Write-Step "Re-checking base SHA (TOCTOU)"
    $baseShaNow = Get-RemoteSha -Branch $base
    if ($baseShaNow -ne $baseSha) {
        throw "Base '$base' moved on '$Remote' ($baseSha -> $baseShaNow) during the run. Aborting before commit; re-run to rebuild on the new base."
    }
    if (Get-RemoteSha -Branch $target) {
        throw "Target branch '$target' appeared on '$Remote' during the run. Aborting to avoid a clobber."
    }

    Write-Step "Committing"
    Invoke-Git -GitArgs @("-c", "core.autocrlf=false", "-c", "core.eol=lf", "commit", "-m", $CommitMessage) -Checked -What "git commit" | Out-Null
    $head = (Invoke-Git -GitArgs @("rev-parse", "HEAD") -Checked -What "git rev-parse").Trim()

    Write-Step "Pushing $target (no --force)"
    Invoke-Git -GitArgs @("push", $Remote, "refs/heads/${target}:refs/heads/${target}") -Checked -What "git push" | Out-Null

    Write-Host ""
    Write-Host "P.3 PRESERVED" -ForegroundColor Green
    Write-Host "Pushed $target @ $head to $Remote"
    exit 0
}
catch {
    Write-Host ""
    Write-Error "P.3 preservation aborted: $($_.Exception.Message)"
    exit 1
}
