# Pheno Tracker paid-user smoke test — local setup

This guide gets the full paid-user Pheno Tracker smoke test running
end-to-end against a **local** Supabase stack — never production, never
Lovable Cloud.

The smoke test covers:

- Free user → gated Pheno route → Upgrade `returnTo`
- Paddle checkout success → entitlement confirmed
- Pheno Hunt creation
- Workspace evidence progress
- `/compare` disabled until required evidence is present
- `/compare` enabled once the hunt is comparison-ready

Every scenario is env-gated. When local Supabase runtime values are present
but role credentials are absent, the orchestrator creates five disposable
login-capable users and canonical subscription rows, then deletes them on
every normal exit. Nothing is faked and hosted projects are always refused.

---

## Status vocabulary

| Status     | Meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `PASS`     | Full paid-user smoke completed successfully.                    |
| `FAIL`     | A stage failed (test, product, or configuration).               |
| `BLOCKED`  | Fixture present but adapter/readiness cannot confirm hydration. |
| `SKIPPED`  | Required local dependencies missing. Nothing was faked.         |
| `SEEDABLE` | Local env present, fixture not seeded yet.                      |
| `HYDRATED` | Comparison-ready fixture verified through real adapter code.    |

## Safety rules

- Runs only against a local Supabase stack. Hosted hosts
  (`supabase.co`, `supabase.in`, `lovable.app`, `lovable.dev`) are refused.
- **Never** paste `SUPABASE_SERVICE_ROLE_KEY`, passwords, session JSON,
  cookies, or JWTs into chat, PRs, or CI logs.
- Fixture env file `e2e/.fixtures/pheno-paid-smoke.env` and session files
  under `e2e/.auth/` are gitignored and must never be committed.

---

## A. Prerequisites

- Docker Desktop (or another compatible container runtime) installed and
  **running**.
- Supabase CLI installed (`brew install supabase/tap/supabase`,
  `scoop install supabase`, or `npm i -g supabase`).
- Repo dependencies installed with `bun install`.

## B. Disposable role accounts (recommended)

Do not create or store shared role credentials for the normal local or CI
path. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` pointed at the
loopback stack, `test:pheno-paid-smoke:local` automatically creates these
five roles:

| Role          | Suggested email                   | Entitlement                       |
| ------------- | --------------------------------- | --------------------------------- |
| Free          | `pheno-free@example.test`         | none                              |
| Pro           | `pheno-pro@example.test`          | active Pro subscription           |
| Pro Annual    | `pheno-pro-annual@example.test`   | active annual Pro subscription    |
| Craft Monthly | `pheno-craft@example.test`        | active monthly Craft subscription |
| Craft Annual  | `pheno-craft-annual@example.test` | active annual Craft subscription  |
| Founder       | `pheno-founder@example.test`      | Founder Lifetime (optional)       |
| Canceled      | `pheno-canceled@example.test`     | canceled/expired billing record   |

Paid roles receive canonical `public.subscriptions` rows. Free receives no
subscription row. Canceled receives an expired canceled row. The credentials
exist only in the gitignored
`e2e/.fixtures/pheno-paid-smoke-roles.env` file for the duration of the run;
cleanup deletes the auth users and cascading application rows.

Supplying the `E2E_PHENO_*_EMAIL` and `E2E_PHENO_*_PASSWORD` variables is
still supported as an advanced debugging override. Those externally supplied
accounts are never deleted by the orchestrator.

---

## C. One-command local run (recommended)

### Bash / macOS / Linux

```bash
# From the Verdant repo root
(
set -euo pipefail
replay_parent="$(mktemp -d)"
export SUPABASE_REPLAY_WORKDIR="${replay_parent}/workspace"
stack_start_attempted=0
cleanup_replay() {
  local primary_status=$?
  trap - EXIT
  unset STATUS_ENV API_URL DB_URL ANON_KEY SERVICE_ROLE_KEY
  if [ "${stack_start_attempted}" -eq 0 ]; then
    rm -rf -- "${replay_parent}"
  elif supabase stop --workdir "${SUPABASE_REPLAY_WORKDIR}" --no-backup >/dev/null 2>&1; then
    rm -rf -- "${replay_parent}"
  else
    echo "Local Supabase cleanup failed; preserved ${replay_parent}." >&2
    if [ "${primary_status}" -eq 0 ]; then primary_status=1; fi
  fi
  exit "${primary_status}"
}
trap cleanup_replay EXIT

node scripts/prepare-local-supabase-replay.mjs \
  --output="${SUPABASE_REPLAY_WORKDIR}" --json
stack_start_attempted=1
if ! supabase start --workdir "${SUPABASE_REPLAY_WORKDIR}" >/dev/null 2>&1; then
  echo "Local Supabase failed to start; credential-bearing output was suppressed." >&2
  exit 1
fi
supabase db reset --workdir "${SUPABASE_REPLAY_WORKDIR}" --local
if ! STATUS_ENV="$(supabase status --workdir "${SUPABASE_REPLAY_WORKDIR}" -o env 2>/dev/null)"; then
  echo "Local Supabase status failed; credential-bearing output was suppressed." >&2
  exit 1
fi
eval "${STATUS_ENV}"
unset STATUS_ENV
export API_URL DB_URL ANON_KEY SERVICE_ROLE_KEY
node -e 'const ok=new Set(["localhost","127.0.0.1","[::1]"]); for (const n of ["API_URL","DB_URL","ANON_KEY","SERVICE_ROLE_KEY"]) { const v=process.env[n]; if (!v) throw new Error(`${n} is missing`); if (n.endsWith("_URL") && !ok.has(new URL(v).hostname.toLowerCase())) throw new Error(`${n} is not loopback`); }'

mkdir -p e2e/.fixtures
rm -f e2e/.fixtures/pheno-paid-smoke.env

export SUPABASE_URL="${API_URL}"
export SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"

bun run test:pheno-paid-smoke:local
)
```

### Windows PowerShell

```powershell
# From the Verdant repo root
function Assert-NativeSuccess {
  param([Parameter(Mandatory)][string]$Step)
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit $LASTEXITCODE"
  }
}

$replayParent = Join-Path ([IO.Path]::GetTempPath()) ("verdant-replay-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $replayParent | Out-Null
$env:SUPABASE_REPLAY_WORKDIR = Join-Path $replayParent "workspace"
$stackStartAttempted = $false

try {
  & node scripts/prepare-local-supabase-replay.mjs `
    --output="$env:SUPABASE_REPLAY_WORKDIR" --json
  Assert-NativeSuccess "prepare replay workspace"

  $stackStartAttempted = $true
  & supabase start --workdir "$env:SUPABASE_REPLAY_WORKDIR" *> $null
  Assert-NativeSuccess "supabase start"
  & supabase db reset --workdir "$env:SUPABASE_REPLAY_WORKDIR" --local
  Assert-NativeSuccess "supabase db reset"

  $statusLines = & supabase status --workdir "$env:SUPABASE_REPLAY_WORKDIR" -o env 2>$null
  Assert-NativeSuccess "supabase status"
  $statusLines | ForEach-Object {
    if ($_ -match '^([A-Z0-9_]+)="?(.*?)"?$') {
      Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
  }

  foreach ($name in @("API_URL", "DB_URL", "ANON_KEY", "SERVICE_ROLE_KEY")) {
    $value = (Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrWhiteSpace($value)) { throw "$name is missing" }
    if ($name.EndsWith("_URL")) {
      $hostName = ([Uri]$value).Host.ToLowerInvariant()
      if ($hostName -notin @("localhost", "127.0.0.1", "[::1]", "::1")) {
        throw "$name is not loopback"
      }
    }
  }

  New-Item -ItemType Directory -Force "e2e/.fixtures" | Out-Null
  Remove-Item "e2e/.fixtures/pheno-paid-smoke.env" -ErrorAction SilentlyContinue

  $env:SUPABASE_URL=$env:API_URL
  $env:SUPABASE_ANON_KEY=$env:ANON_KEY
  $env:SUPABASE_SERVICE_ROLE_KEY=$env:SERVICE_ROLE_KEY

  & bun run test:pheno-paid-smoke:local
  Assert-NativeSuccess "pheno paid smoke"
} finally {
  foreach ($name in @(
    "API_URL", "DB_URL", "ANON_KEY", "SERVICE_ROLE_KEY",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"
  )) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  }

  $stopExit = 0
  if ($stackStartAttempted) {
    & supabase stop --workdir "$env:SUPABASE_REPLAY_WORKDIR" --no-backup *> $null
    $stopExit = $LASTEXITCODE
  }
  if ($stopExit -eq 0) {
    Remove-Item -LiteralPath $replayParent -Recurse -Force -ErrorAction Stop
    Remove-Item -LiteralPath "Env:SUPABASE_REPLAY_WORKDIR" -ErrorAction SilentlyContinue
  } else {
    Write-Warning "Local Supabase cleanup failed; preserved $replayParent."
    throw "supabase stop failed with exit $stopExit"
  }
}
```

The orchestrator provisions disposable roles when needed, then runs seven
stages: initial preflight → seed → load generated fixture env → post-seed
hydration verify → session creation → Playwright smoke → cleanup and final
summary. Exit codes: **0** = PASS, **1** =
FAIL, **2** = SKIPPED / BLOCKED (Playwright is not launched).

---

## D. Manual expanded form (debugging)

If a stage fails, reproduce it step-by-step:

### Bash / macOS / Linux

```bash
node scripts/e2e/check-pheno-paid-smoke-env.mjs

node scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs

test -f e2e/.fixtures/pheno-paid-smoke.env

set -a
source e2e/.fixtures/pheno-paid-smoke.env
set +a

node scripts/e2e/check-pheno-paid-smoke-env.mjs
bun run test:pheno-paid-smoke:verify

bun run test:pheno-paid-smoke:sessions

bunx playwright test e2e/pheno-tracker-paid-user-smoke.spec.ts
```

### Windows PowerShell

```powershell
Get-Content "e2e/.fixtures/pheno-paid-smoke.env" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $name, $value = $line -split "=", 2
    [Environment]::SetEnvironmentVariable(
      $name.Trim(),
      $value.Trim().Trim('"'),
      "Process"
    )
  }
}

node scripts/e2e/check-pheno-paid-smoke-env.mjs
bun run test:pheno-paid-smoke:verify
bun run test:pheno-paid-smoke:sessions
bunx playwright test e2e/pheno-tracker-paid-user-smoke.spec.ts
```

---

## E. What the seeder creates

The seeder writes to `e2e/.fixtures/pheno-paid-smoke.env` (gitignored):

- `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE` — hunt with no candidates.
- `E2E_PHENO_HUNT_ID_PENDING_HARVEST` — candidates with phenotype notes only.
- `E2E_PHENO_HUNT_ID_PENDING_CURE` — candidates + lab, no smoke tests.
- `E2E_PHENO_HUNT_ID_COMPARISON_READY` — phenotype notes + smoke tests + lab.

Comparison readiness is produced only by writing real evidence rows that
the app's `phenoHuntCandidateAdapter` + `derivePhenoCompareReadinessFromCandidates`
consume. The `test:pheno-paid-smoke:verify` step exercises those exact
functions and refuses to advance if the fixture cannot resolve to
`comparison_ready`.

## F. Troubleshooting

| Symptom                               | Fix                                                    |
| ------------------------------------- | ------------------------------------------------------ |
| Preflight prints `SKIPPED`            | Export the listed env vars.                            |
| Seeder prints `REFUSED`               | You pointed at a hosted host. Use `127.0.0.1`.         |
| Hydration verify prints `BLOCKED`     | Re-run the seeder; check owner email resolves.         |
| Session generator prints `FAIL`       | Verify the account exists and can sign in via `/auth`. |
| Playwright can't reach `/pheno-hunts` | Confirm `bun run dev` is serving `localhost:8080`.     |
