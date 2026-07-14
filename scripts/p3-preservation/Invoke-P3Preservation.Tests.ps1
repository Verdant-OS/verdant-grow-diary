#Requires -Version 5.1
<#
  Pester 5 smoke test for Invoke-P3Preservation.ps1.

  Builds a self-contained fixture under a SHORT temp path (a local bare "origin"
  whose path slug is verdant-os/verdant-grow-diary, a fixture contract, and a
  source worktree), then exercises the orchestrator end to end:
    - dry-run makes no changes
    - apply pushes the target branch with BYTE-EXACT blobs (despite autocrlf)
    - a second apply is blocked (branch already exists)

  Requires git and node on PATH. Run with:  Invoke-Pester -Path <this file>
#>

# Evaluated at Pester DISCOVERY time (top-level) so the It -Skip conditions can see
# it; BeforeAll runs later, in the run phase, and re-derives its own guard.
$prereqOk = [bool](Get-Command git -ErrorAction SilentlyContinue) -and [bool](Get-Command node -ErrorAction SilentlyContinue)

BeforeAll {
    $script:toolingSrc = $PSScriptRoot
    $script:hostExe = (Get-Process -Id $PID).Path
    $script:ready = [bool](Get-Command git -EA SilentlyContinue) -and [bool](Get-Command node -EA SilentlyContinue)

    $script:targetBranch = "feat/p3-fixture-preserve"
    # SHORT temp root so the local bare + git internals stay under Windows MAX_PATH.
    $script:root = Join-Path ([System.IO.Path]::GetTempPath()) ("p3s-" + [System.IO.Path]::GetRandomFileName().Substring(0, 6))

    $env:GIT_AUTHOR_NAME = "t"; $env:GIT_AUTHOR_EMAIL = "t@t"
    $env:GIT_COMMITTER_NAME = "t"; $env:GIT_COMMITTER_EMAIL = "t@t"

    function script:GitOk([string]$Repo, [string[]]$GitArgs) {
        $out = & git -C $Repo @GitArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed: $($out | Out-String)" }
    }

    function script:Invoke-Orch([switch]$Apply) {
        $a = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $script:orch,
            "-SourceWorktree", $script:src, "-DestRepo", $script:dest)
        if (-not $Apply) { $a += "-DryRun" }
        $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
        try { & $script:hostExe @a *> $null; return $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
    }

    function script:RemoteHasTarget {
        $o = (& git -C $script:dest ls-remote $script:bareFwd "refs/heads/$script:targetBranch" 2>&1 | Out-String).Trim()
        return -not [string]::IsNullOrWhiteSpace($o)
    }

    if ($script:ready) {
        if (Test-Path $script:root) { Remove-Item -Recurse -Force $script:root }
        New-Item -ItemType Directory -Force $script:root | Out-Null

        # tooling copy + fixture contract
        $tool = Join-Path $script:root "tool"
        New-Item -ItemType Directory -Force $tool | Out-Null
        foreach ($f in @("preflight.mjs", "verify-staged-bytes.mjs", "Invoke-P3Preservation.ps1")) {
            Copy-Item (Join-Path $script:toolingSrc $f) $tool
        }
        $script:orch = Join-Path $tool "Invoke-P3Preservation.ps1"

        # fixture source files (LF content, ASCII)
        $script:src = Join-Path $script:root "src"
        $specs = @(
            @{ path = "supabase/migrations/20990101000000_fixture.sql"; body = "create table fixture(id int);`n" },
            @{ path = "scripts/fixture-harness.ts"; body = "export const fixture = 1;`n" }
        )
        $script:fixtureFiles = @()
        foreach ($s in $specs) {
            $full = Join-Path $script:src $s.path
            New-Item -ItemType Directory -Force (Split-Path $full) | Out-Null
            $bytes = [System.Text.Encoding]::ASCII.GetBytes($s.body)
            [System.IO.File]::WriteAllBytes($full, $bytes)
            $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()
            $script:fixtureFiles += @{ path = $s.path; bytes = $bytes.Length; sha256 = $sha }
        }

        $entries = ($script:fixtureFiles | ForEach-Object {
                "    Object.freeze({ path: `"$($_.path)`", bytes: $($_.bytes), sha256: `"$($_.sha256)`" }),"
            }) -join "`n"
        $contractJs = @"
export const P3_CONTRACT = Object.freeze({
  baseBranch: "main",
  targetBranch: "$script:targetBranch",
  toolingBranch: "codex/p3-preservation-workflow",
  eol: "lf",
  files: Object.freeze([
$entries
  ]),
});
const HEX64 = /^[0-9a-f]{64}$/;
export function getContractFile(path, contract = P3_CONTRACT) { return contract.files.find((f) => f.path === path) ?? null; }
export function assertContractIntegrity(contract = P3_CONTRACT) {
  if (!contract || !Array.isArray(contract.files) || contract.files.length === 0) throw new Error("bad files");
  if (contract.eol !== "lf" && contract.eol !== "crlf") throw new Error("bad eol");
  for (const key of ["baseBranch","targetBranch","toolingBranch"]) if (typeof contract[key] !== "string" || !contract[key]) throw new Error("bad "+key);
  const seen = new Set();
  for (const f of contract.files) {
    if (typeof f.path !== "string" || !f.path) throw new Error("bad path");
    if (f.path.includes("\\")) throw new Error("backslash path");
    if (seen.has(f.path)) throw new Error("duplicate path "+f.path);
    seen.add(f.path);
    if (!Number.isInteger(f.bytes) || f.bytes <= 0) throw new Error("bad bytes");
    if (typeof f.sha256 !== "string" || !HEX64.test(f.sha256)) throw new Error("bad sha");
  }
  return true;
}
"@
        [System.IO.File]::WriteAllText((Join-Path $tool "contract.mjs"), $contractJs, (New-Object System.Text.UTF8Encoding($false)))

        # local bare "origin" (slug-matching path) seeded on main, via clone --bare
        $bare = Join-Path $script:root "remote/verdant-os/verdant-grow-diary.git"
        New-Item -ItemType Directory -Force (Split-Path $bare) | Out-Null
        $script:bareFwd = ($bare -replace '\\', '/')
        $seed = Join-Path $script:root "seed"
        New-Item -ItemType Directory -Force $seed | Out-Null
        script:GitOk $seed @("init", "-q", "--initial-branch=main")
        Set-Content (Join-Path $seed "README.md") "seed" -Encoding ascii
        script:GitOk $seed @("add", "-A"); script:GitOk $seed @("commit", "-q", "-m", "seed")
        script:GitOk $script:root @("clone", "--bare", "-q", ($seed -replace '\\', '/'), $script:bareFwd)

        $script:dest = Join-Path $script:root "dest"
        & git clone -q $script:bareFwd $script:dest 2>&1 | Out-Null
    }
}

AfterAll {
    if ($script:root -and (Test-Path $script:root)) { Remove-Item -Recurse -Force $script:root -EA SilentlyContinue }
}

Describe "Invoke-P3Preservation" {

    It "dry-run passes and makes no changes" -Skip:(-not $prereqOk) {
        $exit = script:Invoke-Orch
        $exit | Should -Be 0
        script:RemoteHasTarget | Should -BeFalse
        (Test-Path (Join-Path $script:dest $script:fixtureFiles[0].path)) | Should -BeFalse
        (& git -C $script:dest rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim() | Should -Be "main"
    }

    It "apply pushes the target branch with byte-exact blobs" -Skip:(-not $prereqOk) {
        $exit = script:Invoke-Orch -Apply
        $exit | Should -Be 0
        script:RemoteHasTarget | Should -BeTrue

        # check out the pushed branch with normalization OFF, then hash the files
        $verify = Join-Path $script:root "verify"
        & git -c core.autocrlf=false -c core.eol=lf clone -q -b $script:targetBranch $script:bareFwd $verify 2>&1 | Out-Null
        foreach ($f in $script:fixtureFiles) {
            $p = Join-Path $verify $f.path
            (Test-Path $p) | Should -BeTrue
            (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant() | Should -Be $f.sha256
        }
    }

    It "blocks a second apply once the branch exists on the remote" -Skip:(-not $prereqOk) {
        $exit = script:Invoke-Orch -Apply
        $exit | Should -Not -Be 0
    }
}
