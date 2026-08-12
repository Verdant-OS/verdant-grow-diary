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

| Role       | Suggested email                 | Entitlement                     |
| ---------- | ------------------------------- | ------------------------------- |
| Free       | `pheno-free@example.test`       | none                            |
| Pro        | `pheno-pro@example.test`        | active Pro subscription         |
| Pro Annual | `pheno-pro-annual@example.test` | active annual Pro subscription  |
| Founder    | `pheno-founder@example.test`    | Founder Lifetime (optional)     |
| Canceled   | `pheno-canceled@example.test`   | canceled/expired billing record |

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
supabase start
supabase db reset
supabase status

mkdir -p e2e/.fixtures
rm -f e2e/.fixtures/pheno-paid-smoke.env

export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="<local anon key from supabase status>"
export SUPABASE_SERVICE_ROLE_KEY="<local service-role key from supabase status>"

bun run test:pheno-paid-smoke:local
```

### Windows PowerShell

```powershell
# From the Verdant repo root
supabase start
supabase db reset
supabase status

New-Item -ItemType Directory -Force "e2e/.fixtures" | Out-Null
Remove-Item "e2e/.fixtures/pheno-paid-smoke.env" -ErrorAction SilentlyContinue

$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY="<local anon key from supabase status>"
$env:SUPABASE_SERVICE_ROLE_KEY="<local service-role key from supabase status>"

bun run test:pheno-paid-smoke:local
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
