# Windows wrapper for the controlled validation matrix.
#
# Resolves the repository root from the script location, requires node
# and bunx on PATH, and delegates all matrix logic to
# run-validation-matrix.mjs. Do not add matrix logic here.

[CmdletBinding()]
param(
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

foreach ($required in @("node", "bunx")) {
    if (-not (Get-Command $required -ErrorAction SilentlyContinue)) {
        Write-Error "Required command '$required' not found on PATH."
        exit 2
    }
}

$matrix = Join-Path $scriptDir "run-validation-matrix.mjs"
$nodeArgs = @($matrix)
if ($OutputPath -ne "") {
    $nodeArgs += @("--output", $OutputPath)
}

Push-Location $repoRoot
try {
    & node @nodeArgs
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

exit $code
