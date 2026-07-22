# Verdant

[![Quick Log Playwright smoke](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/quicklog-smoke.yml/badge.svg?branch=verdant-grow-diary)](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/quicklog-smoke.yml)
[![CI](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/ci.yml/badge.svg?branch=verdant-grow-diary)](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/ci.yml)
[![docs-safety](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/docs-safety.yml/badge.svg?branch=verdant-grow-diary)](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/docs-safety.yml)

These workflows include the Client secret boundary guard. The badge reflects overall workflow status, not the guard alone — see [Client Secret Boundary Guard](./docs/security.md#client-secret-boundary-guard) for how to verify the guard specifically.

Quick links: [Workflow](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/quicklog-smoke.yml) · [Latest run](https://github.com/Verdant-OS/verdant-grow-diary/actions/workflows/quicklog-smoke.yml?query=branch%3Averdant-grow-diary) · Artifacts are attached to each completed run under `quicklog-smoke-artifacts` (open the run page → Artifacts).

Verdant is a standalone Grow Room Operating System. It turns grow logs, plant photos, sensor readings, alerts, and AI-assisted analysis into safer grow decisions and better harvest outcomes.

The current product priority is the V0 operating loop:

Grow → Tent → Plant → Diary/Logs → Photo → Sensor Snapshot → AI Doctor → Alert/Recommendation → Approval-Required Action Queue

## Tech stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Auth, Database, Storage, Edge Functions) via Lovable Cloud
- Vitest for tests

## Local setup

```bash
npm install
npm run dev
```

The dev server runs Vite. Open the URL it prints.

## Environment variables

Lovable Cloud auto-manages the `.env` file. Do not edit it by hand. Variables provided:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Additional secrets (API keys for edge functions, third-party services) are configured via Lovable Cloud secrets — never commit secrets to the repo.

## Production deployment

Production domain: **https://verdantgrowdiary.com** (also served on
`https://www.verdantgrowdiary.com`).

- Only the `/welcome` landing route is public. All other routes require
  authentication and are gated behind Supabase Auth.
- SSL/TLS certificates are managed by the Lovable hosting platform. Both the
  apex and `www` hostnames must serve a valid certificate before announcing a
  release.
- DNS changes (apex `A` record, `www` `A` record) can interrupt SSL issuance —
  re-verify the certificate after any DNS update.
- See [`docs/launch-checklist.md`](docs/launch-checklist.md) for the full
  pre-launch verification steps.

Public crawler surfaces:

- [`public/robots.txt`](public/robots.txt) — allows crawling and points at the
  production sitemap.
- [`public/sitemap.xml`](public/sitemap.xml) — lists only `/` and `/welcome`.
  Private authenticated routes are intentionally excluded.

## Validation

Run all of the following before requesting review:

```bash
bunx vitest run
bunx eslint <changed files>
npm run build
```

All existing tests must pass. New behavior must ship with new tests.

Scanner guardrail changes must also run the CI-equivalent sentinel:

```bash
bun run test:scanner-guardrails:ci
```

See [`docs/testing/scanner-guardrails.md`](docs/testing/scanner-guardrails.md) for `scannerIt`, `installScannerGuardrail`, cached scanner walks, and slow-test telemetry rules.

Watch-mode tests:

```bash
npx vitest
```

### Scanner guardrail sentinel

The scanner guardrail suite walks the filesystem and is the most likely
source of environmental timeout flakes. A 5000ms slow-test sentinel
appends offenders to `test-results/scanner-guardrail-slow-tests.jsonl`.

```bash
bun run test:scanner-guardrails           # raw scanner sentinel (vitest)
bun run test:scanner-guardrails:ci        # CI-equivalent wrapper:
                                          #   - deletes the stale report
                                          #   - runs the scanner suite
                                          #   - validates JSONL row contract
                                          #   - fails the build if any slow
                                          #     row was emitted
bun run test:scanner-guardrails:ci -- --verbose
                                          # also prints report path, threshold,
                                          # stale-report removal state,
                                          # post-run report presence, row count,
                                          # validation stats (valid/invalid/slow),
                                          # and the value-preview truncation limit
bun run test:scanner-guardrails:clean                # remove the default report
bun run test:scanner-guardrails:clean -- <path>      # remove a specific report file
```

Report path: `test-results/scanner-guardrail-slow-tests.jsonl`.

Diagnostics behavior:

- Under `GITHUB_ACTIONS=true`, the CI wrapper emits one `::error`
  annotation per invalid or slow telemetry row (not just the first).
  Annotations include report path, JSONL line number, suite/test/file,
  `durationMs`/`thresholdMs`, and the failed-fields list.
- Field diffs are compact and per-row. Each value is run through a
  truncating preview capped at the configured limit (80 characters by
  default) so log output stays small and never dumps full payloads.
- Local terminal output remains readable; only the `::error` lines are
  added under GitHub Actions.

See [`docs/testing/scanner-guardrails.md`](docs/testing/scanner-guardrails.md)
for the full contract.

## Development workflow & safety standards

Every PR that touches data access, auth, AI, the Action Queue, sensors, device
control, or migrations must satisfy the Verdant safety checklist.

- [`docs/security-checklist.md`](docs/security-checklist.md) — required
  per-PR security review.
- [`docs/security-exceptions.md`](docs/security-exceptions.md) — the registry
  of intentionally accepted security warnings. Any deviation from the
  checklist must be recorded here.
- [`.github/pull_request_template.md`](.github/pull_request_template.md) — PR
  template that links the checklist and the validation commands above.

### AI Coach safety

The AI Coach is read-only and suggest-only. It must never trigger writes,
device commands, or unattended Action Queue changes. Safety regressions are
caught by:

- [`src/test/ai-coach-security.test.ts`](src/test/ai-coach-security.test.ts)
- [`src/test/ai-coach-output-safety.test.ts`](src/test/ai-coach-output-safety.test.ts)

### Action Queue safety

Action Queue items remain approval-required. No code path may
auto-approve, auto-complete, or auto-cancel queue items, and no executable
device payload may ship through the queue. Safety and audit guarantees are
covered by:

- [`src/test/action-queue-safety.test.ts`](src/test/action-queue-safety.test.ts)
- [`src/test/action-queue-audit.test.ts`](src/test/action-queue-audit.test.ts)

### Sensor / live-data truthfulness

Sensor readings must never be faked as live. Every reading is labeled as one
of `demo`, `manual`, `live`, `stale`, or `invalid`. Stale, missing, or
suspicious telemetry must be surfaced as such — never silently substituted
and never relabeled as healthy. See
[`docs/sensor-truth-rules.md`](docs/sensor-truth-rules.md) and
[`docs/data-labeling-spec.md`](docs/data-labeling-spec.md).

### RLS / auth.uid() ownership

RLS is the ownership boundary for every user-owned table. Policies are
written against `auth.uid()` and evaluated server-side.
Never trust client-provided `user_id` — the frontend must not send it as a
trusted field, and any client-supplied value must be re-checked server-side.
No `service_role` key may appear in client code.

## Pi-ingest deployed smoke test

After deploying the `pi-ingest-readings` edge function, run the deployed
pi-ingest smoke verification described in
[`docs/pi-ingest-smoke-runbook.md`](docs/pi-ingest-smoke-runbook.md). It
covers signed-bridge happy-path, replay/idempotency, tampered signature, and
unknown-bridge cases. The contract that runbook verifies lives in
[`docs/pi-ingest-write-transaction-contract.md`](docs/pi-ingest-write-transaction-contract.md).

Windows EcoWitt local testbench: see
[`docs/ecowitt-windows-testbench.md`](docs/ecowitt-windows-testbench.md).

## Safety philosophy

Verdant follows a read-only, no-write, no-control architecture for advisory
surfaces:

- No fake live data. Sensor readings are labeled `demo`, `manual`, `live`,
  `stale`, or `invalid`.
- No blind automation. AI suggests; the grower approves.
- No device control from advisory surfaces. The Action Queue is
  approval-required.
- Ownership is enforced server-side via Supabase RLS — never trust
  client-provided `user_id`.
- No `service_role` keys in client code.

See [`docs/buildops-kit/README.md`](docs/buildops-kit/README.md) for the full
BuildOps Kit covering product context, data-labeling, fixture contracts, AI
Doctor output rules, Action Queue safety, prompt scaffolds, and the QA
regression checklist.

## One-Tent Loop Proof Safety Rules

The `/one-tent-loop-proof` route is a read-only diagnostic. Its rules are
enforced by unit + fuzz + golden + Playwright tests. Any change to the
proof surface must uphold the following:

- Weak, stale, invalid, demo-only, unknown, or missing evidence must never
  render as healthy, present, verified, success, or "OK". Downstream steps
  blocked or weakened by weak telemetry must never render as `present`.
- Downstream wording must be honest. Allowed phrasing includes
  "not healthy", "not verified", and "cannot be confirmed". The following
  unqualified phrases are forbidden anywhere on the proof surface or in
  the sanitized text report: `healthy`, `verified`, `success`, `all good`,
  `no issues detected`, `confirmed safe`, `validated live`.
- The evidence checklist UI must preserve visible `weak`, `unknown`,
  `stale`, `invalid`, `demo_only`, `missing`, and `blocked` states. Do not
  hide or collapse a weak state into a neutral badge.
- Sanitized text reports (top-gap block, artifact export) must never
  expose secrets, raw payloads, bridge tokens, service role keys, API
  keys, access tokens, or JWT-like strings. Any untrusted source label
  must pass through `sanitizeShortLabel` before rendering.
- Demo, manual, live, stale, and invalid source labels must remain
  explicit in the UI and in text reports. Do not normalize them to a
  generic "sensor" label.

### Local commands

- Vitest rules + fuzz + evidence-ref safety:
  `bun run test:one-tent-loop-proof-never-healthy`
- Golden top-gap text block (exact equality):
  `bunx vitest run src/test/one-tent-loop-top-gap-report-golden.test.ts`
- Playwright never-healthy spec against the mocked harness (same config
  used in CI, no real auth, no Supabase writes, no `storageState`):
  `bun run test:e2e:one-tent-loop-proof-never-healthy:dev`
- Full local gate (typecheck + vitest + sanitized artifact + Playwright):
  `bun run check:one-tent-loop-proof-never-healthy`

## Local MCP RLS integration test

Verdant exposes three **read-only** MCP tools (`list_grows`,
`list_recent_diary_entries`, `get_latest_sensor_snapshot`). The test
`src/test/mcp-local-rls-integration.test.ts` proves that these tools
enforce Supabase Row-Level Security through the signed-in grower's
OAuth/session token, including under `limit` and `includeArchived`
options, and that responses never leak another user's rows, `raw_payload`,
`service_role`, JWTs, or bridge/OAuth secrets.

Beyond the explicit regression cases, the suite **derives extra
pagination/filter isolation cases from `.lovable/mcp/manifest.json`**:
every advertised `limit`/boolean-filter param automatically generates
cross-user cases for both users, foreign-scope-id probes, and
unauthenticated checks. Params are never invented — a tool that
advertises no pagination/filter params (like `get_latest_sensor_snapshot`)
is recorded as N/A instead of failing.

The suite is **local-only** and skips cleanly in CI/PRs where the
harness is not configured. It never contacts hosted Supabase and never
requires production secrets.

**Required env vars**

- `MCP_LOCAL_RLS_HARNESS=1`
- `LOCAL_SUPABASE_URL` (e.g. `http://127.0.0.1:54321`)
- `LOCAL_SUPABASE_ANON_KEY`
- `LOCAL_SUPABASE_SERVICE_ROLE_KEY` — **local only**, used exclusively
  for seeding/cleanup; MCP tool execution itself always routes through
  `supabaseForUser(ctx)` with an anon-scoped user token. Never paste a
  hosted/production service role key here, and never commit any service
  role key — local keys are ephemeral CLI-generated values.

**Required local services**

- Local Supabase running (e.g. `supabase start`) with this repo's
  migrations applied (`supabase db reset` or `supabase migration up`).
- **Local grants:** the local CLI stack does not grant API-role table
  privileges the way hosted Lovable Cloud's migration runner does, so
  every PostgREST request fails with `42501 permission denied` until you
  mirror hosted reality (local database only):

  ```sql
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON TABLE public.grows, public.tents, public.diary_entries,
    public.sensor_readings TO service_role;
  GRANT SELECT ON TABLE public.grows, public.tents, public.diary_entries,
    public.sensor_readings TO authenticated;
  ```

  The CI workflow runs this automatically after `supabase db reset --local`.

**Run it**

```bash
MCP_LOCAL_RLS_HARNESS=1 \
LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
LOCAL_SUPABASE_ANON_KEY=<local-anon-key> \
LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key> \
bun run test:mcp:rls:local
```

The `test:mcp:rls:local` package script is a thin wrapper around
`bunx vitest run src/test/mcp-local-rls-integration.test.ts` — it contains
no keys; you always supply local env values yourself.

**CI behavior**

The `mcp-local-rls-integration` workflow
(`.github/workflows/mcp-local-rls-integration.yml`) runs the harness
against a fresh local Supabase on the runner:

1. starts local Supabase via the CLI (no `supabase link`, no remote
   `db push`, no hosted refs, no repo secrets),
2. masks the ephemeral local keys and waits for auth/REST readiness with
   a bounded retry loop,
3. applies and verifies repo migrations with `supabase db reset --local`,
4. runs the harness, and
5. **only when the job fails**, uploads sanitized debug artifacts from
   `artifacts/mcp-local-rls/` (harness log, response snapshots, vitest
   output). Artifacts are sanitized twice — at write time by the harness
   and again by `scripts/sanitize-mcp-rls-artifacts.mjs` — so JWTs,
   bearer tokens, service_role material, refresh/bridge/access tokens,
   client secrets, raw headers, raw_payload, and live env values are
   always redacted.

## Documentation

- [AI Doctor Phase 1 Contract](docs/ai-doctor-phase1-contract.md) — deterministic offline pipeline, source-truth rules, confidence caps, golden cases, and view model contract
- [BuildOps Kit](docs/buildops-kit/README.md) — product context, safety rules, fixtures, templates
- [Glossary](docs/glossary.md)
- [One-Tent Loop](docs/one-tent-loop.md)
- [QA regression checklist](docs/qa-regression-checklist.md)
- [Launch checklist](docs/launch-checklist.md)
- [Security checklist](docs/security-checklist.md)
- [Scanner guardrail harness](docs/testing/scanner-guardrails.md) — scannerIt/installScannerGuardrail usage and slow-test telemetry contract
- [Pi-ingest smoke runbook](docs/pi-ingest-smoke-runbook.md)

## Money-migration applied-check

`scripts/assert-required-money-migrations-applied.mjs` verifies that every
migration listed in `scripts/required-money-migrations.mjs` is actually
present in the target database's `supabase_migrations.schema_migrations`
tracker. It is read-only (single `SELECT`) and blocks deploys when a
required migration exists on disk but has not been applied to the target
environment.

The `.github/workflows/required-money-migrations.yml` workflow runs this
check against both sandbox and live. It reads the DB connection strings
from two repository secrets:

- `SUPABASE_DB_URL_SANDBOX`
- `SUPABASE_DB_URL_LIVE`

### Setting the GitHub secrets

1. Get each project's pooled connection string from the Lovable Cloud
   project settings (Database → Connection string → **Session pooler**,
   URI format). It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   The password is the database password, not the anon or service-role key.
2. In GitHub, open **Settings → Secrets and variables → Actions → New
   repository secret**.
3. Create `SUPABASE_DB_URL_SANDBOX` and paste the sandbox project's URL.
4. Create `SUPABASE_DB_URL_LIVE` and paste the live project's URL.
5. Re-run the `required-money-migrations` workflow to confirm both jobs
   go green. If a job errors with exit code `2`, the URL is wrong or the
   pooler is unreachable; exit code `1` means a required migration is
   missing from that environment and must be applied before deploying.

Rotate these secrets whenever the database password is rotated.

### Running the applied-check locally

Requires `psql` on `PATH` (`brew install libpq` on macOS,
`sudo apt-get install postgresql-client` on Debian/Ubuntu).

```bash
# Sandbox
SUPABASE_DB_URL='postgresql://postgres.<sandbox-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  TARGET_ENV=sandbox \
  node scripts/assert-required-money-migrations-applied.mjs

# Live
SUPABASE_DB_URL='postgresql://postgres.<live-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  TARGET_ENV=live \
  node scripts/assert-required-money-migrations-applied.mjs
```

Exit codes: `0` = all required migrations applied, `1` = one or more
missing (do not deploy), `2` = malformed required-file name (extractor
could not derive a 14-digit prefix), `3` = no DB connection string,
`4` = `psql` not on `PATH`, `5` = tracker query failed. Treat `2-5` as
blocking. The script writes a machine-readable audit to
`audit/money-migrations/applied-audit.json` and an expected-vs-actual
diff to `audit/money-migrations/applied-audit.diff.txt` on every exit
branch — the same files CI uploads as artifacts. Override the diff path
with `DIFF_PATH=/tmp/foo.diff.txt`.

Pair it with the file-presence guard when auditing locally:

```bash
node scripts/assert-required-money-migrations.mjs
```

### Unit tests for `migrationVersion()` and applied-check logic

`src/test/required-money-migrations-version.test.ts` covers the 14-digit
prefix extractor (`migrationVersion()` in
`scripts/required-money-migrations.mjs`) and the applied-vs-required
comparison used by `assert-required-money-migrations-applied.mjs`.

Run just this file (fast, no DB needed):

```bash
# Focused run — recommended
bunx vitest run src/test/required-money-migrations-version.test.ts

# Verbose reporter (shows every case name)
bunx vitest run src/test/required-money-migrations-version.test.ts --reporter=verbose

# Filter to a single case
bunx vitest run src/test/required-money-migrations-version.test.ts -t "migrationVersion"
bunx vitest run src/test/required-money-migrations-version.test.ts -t "applied-check"
```

To inspect the exact prefixes the extractor produces for the current
required list (useful when a filename rename shows up as one missing +
one unknown):

```bash
node -e "
  import('./scripts/required-money-migrations.mjs').then(m => {
    for (const f of m.REQUIRED_MONEY_MIGRATIONS) {
      console.log(m.migrationVersion(f).padEnd(16), f);
    }
  });
"
```

To compare expected (required) vs actual (applied in a target DB) prefixes
without running the guard, use the same pooled URL as the applied-check:

```bash
# Expected prefixes (from the source-of-truth list)
node -e "
  import('./scripts/required-money-migrations.mjs').then(m => {
    console.log(m.REQUIRED_MONEY_MIGRATIONS.map(m.migrationVersion).sort().join('\n'));
  });
" > /tmp/expected-versions.txt

# Actual prefixes (from the target DB's migration tracker)
psql "$SUPABASE_DB_URL" -Atc \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
  > /tmp/applied-versions.txt

# Required but NOT applied (what the guard would flag)
comm -23 <(sort -u /tmp/expected-versions.txt) <(sort -u /tmp/applied-versions.txt)

# Applied but NOT required (informational — expected to be non-empty)
comm -13 <(sort -u /tmp/expected-versions.txt) <(sort -u /tmp/applied-versions.txt)
```

The guard itself uses the same `SELECT` and comparison; these commands
just let you eyeball the two sides independently.

### One-shot prefix diff CLI (`diff-money-migration-prefixes.mjs`)

`scripts/diff-money-migration-prefixes.mjs` is a lightweight companion
to the applied-check. It dumps the extractor's expected 14-digit
prefixes from the required-money-migrations manifest and (optionally)
diffs them against `supabase_migrations.schema_migrations` in a target
database — in a single command, with no audit-file side effects.

Use it for fast local drift checks and as the "fast-fail" gate in CI
before the heavier verifier runs.

#### Local prerequisites

Runtime:

- **Node.js 20+** — the script is a plain ESM module, no build step.
- **`psql`** on `PATH` — only required for the DB-diff mode; `--expected`
  runs fully offline.
  - macOS: `brew install libpq && brew link --force libpq`
  - Debian/Ubuntu: `sudo apt-get install -y postgresql-client`
  - Windows: install PostgreSQL and add its `bin/` to `PATH`, or use WSL.

Environment variables:

| Variable                | Required?                     | Purpose                                                                 |
|-------------------------|-------------------------------|-------------------------------------------------------------------------|
| `SUPABASE_DB_URL`       | Yes (diff mode)               | Direct Postgres connection string used by `psql`. Overrides `TARGET_ENV`. |
| `TARGET_ENV`            | Optional                      | `sandbox` or `live`. When `SUPABASE_DB_URL` is unset, the script reads `SUPABASE_DB_URL_SANDBOX` or `SUPABASE_DB_URL_LIVE`. Also stamped into JSON/SARIF output as `target_env`. |
| `SUPABASE_DB_URL_SANDBOX` / `SUPABASE_DB_URL_LIVE` | Optional | Convenience env-selected URLs used with `TARGET_ENV`.                    |

The connection string must be the **direct** Postgres URL for the target
project (usually `postgres://postgres:<PASSWORD>@db.<REF>.supabase.co:5432/postgres`),
not the PostgREST/API URL. Never commit it — export it in your shell or
load from a local `.env` that is gitignored.

#### Sample expected-prefixes file

Piping `--expected --json` to a file gives you a small, reviewable
snapshot of every 14-digit prefix the extractor currently expects. Keep
one under `audit/expected/` when reviewing a PR that touches the
required-money-migrations manifest.

`audit/expected/expected-prefixes.sample.json`:

```json
{
  "target_env": "sandbox",
  "expected": [
    { "file": "supabase/migrations/20260615120000_ai_credit_spend.sql",       "version": "20260615120000" },
    { "file": "supabase/migrations/20260615123000_ai_credit_spend_rls.sql",   "version": "20260615123000" },
    { "file": "supabase/migrations/20260616090000_referrals_schema.sql",      "version": "20260616090000" },
    { "file": "supabase/migrations/20260616093000_referrals_rls.sql",         "version": "20260616093000" }
  ],
  "malformed": []
}
```

The plain-text form (`--expected` without `--json`) is the same data,
one prefix + filename per line, suitable for `diff` / `comm`.

#### Worked example

End-to-end local run against sandbox, capturing both human and machine
output:

```bash
# 1) Export the sandbox DB URL for this shell session.
export SUPABASE_DB_URL="postgres://postgres:${SANDBOX_DB_PASSWORD}@db.knkwiiywfkbqznbxwqfh.supabase.co:5432/postgres"
export TARGET_ENV=sandbox

# 2) Snapshot expected prefixes offline (no DB call).
mkdir -p audit/expected
node scripts/diff-money-migration-prefixes.mjs --expected \
  > audit/expected/expected-prefixes.txt
node scripts/diff-money-migration-prefixes.mjs --expected --json \
  > audit/expected/expected-prefixes.json

# 3) Run the actual diff and keep both formats.
node scripts/diff-money-migration-prefixes.mjs \
  | tee audit/expected/prefix-diff.txt
node scripts/diff-money-migration-prefixes.mjs --json \
  > audit/expected/prefix-diff.json
echo "exit=$?"
```

Expected clean-run output (truncated):

```text
Expected: 12   Applied: 12   Missing: 0

20260615120000  20260615120000  OK       supabase/migrations/20260615120000_ai_credit_spend.sql
...
✓ All required migrations present in sandbox.
exit=0
```

Drift example (one required migration missing locally):

```text
Expected: 12   Applied: 11   Missing: 1

20260615120000  20260615120000  OK       supabase/migrations/20260615120000_ai_credit_spend.sql
20260714120000                  MISSING  supabase/migrations/20260714120000_referral_conversion_fix.sql
...
✗ 1 required migration(s) not applied in sandbox. Do NOT deploy.
exit=1
```

Quick one-liner to see just the missing files from JSON:

```bash
node scripts/diff-money-migration-prefixes.mjs --json \
  | jq -r '.missing[] | "\(.version)  \(.file)"'
```

#### Common invocations


```bash
# 1) Full diff: expected (manifest) vs. actual (target DB).
#    Requires SUPABASE_DB_URL (or SUPABASE_DB_URL_SANDBOX /
#    SUPABASE_DB_URL_LIVE selected via TARGET_ENV=sandbox|live).
node scripts/diff-money-migration-prefixes.mjs

# 2) Manifest-only dump (offline, no DB needed) — useful for reviewing
#    which 14-digit prefixes the extractor currently expects.
node scripts/diff-money-migration-prefixes.mjs --expected

# 3) Machine-readable JSON output — pipe into jq, CI summaries, or
#    downstream tooling. Works with or without --expected.
node scripts/diff-money-migration-prefixes.mjs --json
node scripts/diff-money-migration-prefixes.mjs --expected --json

# 4) Point at a specific DB without exporting env vars.
SUPABASE_DB_URL="postgres://..." \
  node scripts/diff-money-migration-prefixes.mjs

# 5) Select the CI-style env explicitly.
TARGET_ENV=live node scripts/diff-money-migration-prefixes.mjs
```

#### Interpreting `--json` output

The JSON payload is stable and safe to parse:

```json
{
  "mode": "diff",              // "diff" | "expected-only"
  "target": "live",            // "sandbox" | "live" | "custom" | null
  "expected": ["20260101000000", "..."],
  "applied":  ["20260101000000", "..."],   // omitted in --expected mode
  "missing":  ["20260714120000"],          // required but NOT applied
  "unexpected": ["20260101999999"],        // applied but NOT required (informational)
  "ok": false
}
```

`missing` is the only field that drives the exit code. `unexpected` is
expected to be non-empty in real projects and is reported for context
only.

#### Exit codes

| Code | Meaning                                                              |
|------|----------------------------------------------------------------------|
| `0`  | OK — every required prefix is present in the target DB (or `--expected` succeeded). |
| `1`  | Drift — at least one required prefix is missing. **Do not deploy.**  |
| `2`  | Failure — no DB URL, `psql` missing, tracker query failed, or a required file has a malformed 14-digit prefix. |

Treat `2` the same as `1` for gating: the check could not complete, so
the target's state is unknown.

#### Structured CI annotations (`--sarif` / `--github-annotations`)

For surfacing failures in the GitHub Actions UI instead of buried in a log:

```bash
# SARIF 2.1.0 to stdout — no file is written. The human-readable text diff
# is SUPPRESSED so stdout is pure JSON you can pipe into `jq`, `tee`, or
# `upload-sarif`. Diagnostics (missing DB URL, psql errors, etc.) still go
# to stderr.
node scripts/diff-money-migration-prefixes.mjs --sarif

# SARIF to a file. Parent directories are created automatically (recursive
# mkdir). Because a path was given, the text diff is ALSO printed to stdout
# so the CI log stays readable.
node scripts/diff-money-migration-prefixes.mjs \
  --sarif --sarif-out=audit/money-migrations/diff.sarif

# GitHub workflow-command annotations on stderr — file-annotated ::error::
# lines that surface in the PR "Files changed" tab without SARIF ingestion.
node scripts/diff-money-migration-prefixes.mjs --github-annotations
```

##### Default output when `--sarif-out` is omitted

`--sarif-out=PATH` is optional. Behavior when you omit it:

| Aspect                   | `--sarif` only (no `--sarif-out`)                                        | `--sarif --sarif-out=PATH`                                    |
|--------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------|
| SARIF destination        | **stdout** — one JSON document, newline-terminated.                      | File at `PATH` (UTF-8, pretty-printed, newline-terminated).   |
| Text diff on stdout      | **Suppressed** so stdout is machine-parseable SARIF only.                | Printed after the file write so CI logs remain readable.      |
| Parent directory of PATH | N/A                                                                      | Created automatically (`mkdir -p`) before the write.          |
| Default filename         | None — there is no implicit `diff.sarif` on disk.                        | Exactly the path you passed. No suffix is appended.           |
| Stderr                   | Diagnostics only (DB URL missing, psql errors, etc.).                    | Same.                                                         |
| Exit code                | Unchanged: `0` clean / `1` drift / `2` tooling failure.                  | Same. The file is written on every exit code, including `0`.  |

Practical consequences:

- If you want a file, you must pass `--sarif-out=PATH` explicitly. There is
  no fallback like `./diff.sarif` or `$GITHUB_WORKSPACE/diff.sarif`.
- If you want both SARIF **and** the human-readable text diff, always pass
  `--sarif-out=PATH`. Piping `--sarif` alone through `tee` loses the diff.
- `github/codeql-action/upload-sarif` requires a file path, so CI steps
  that upload to code scanning must use `--sarif-out=`. `--sarif` alone
  (stdout) is intended for local inspection or ad-hoc `jq` piping.
- Redirecting stdout works too: `node ... --sarif > diff.sarif`. The
  script does not create parent directories in that case — the shell does
  the redirect, so `mkdir -p` yourself if needed.



Upload the SARIF file to code scanning to get one annotation per finding on
the offending migration file:

```yaml
- name: Prefix diff (SARIF)
  run: |
    node scripts/diff-money-migration-prefixes.mjs \
      --sarif --sarif-out=audit/money-migrations/diff.sarif || true
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: audit/money-migrations/diff.sarif
    category: money-migration-drift
```

##### Required GitHub settings and permissions for SARIF upload

Before the workflow's SARIF ever reaches the Security tab, the repo,
workflow, and (for org repos) organization all need to be configured to
accept it. Verify these once per repo — most "empty Security tab" bugs
come from one of the rows below being missing.

**Repository settings** — repo → **Settings**.

| Setting                                                      | Location                                                         | Required value                                                                                          |
|--------------------------------------------------------------|------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Code scanning enabled                                        | **Settings → Code security → Code scanning**                     | Enabled. Free on public repos; on private repos it requires GitHub Advanced Security (GHAS).            |
| Actions enabled for the repo                                 | **Settings → Actions → General → Actions permissions**           | *Allow all actions and reusable workflows* (or an allow-list that includes `github/codeql-action/*`).   |
| Workflow token permissions default                           | **Settings → Actions → General → Workflow permissions**          | *Read repository contents and packages permissions* (the per-workflow `permissions:` block widens it).  |
| Fork PRs allowed to run workflows (only if you accept forks) | **Settings → Actions → General → Fork pull request workflows**   | *Require approval for first-time contributors* (default). SARIF upload from forks is blocked by design. |
| Default branch matches your `on:` triggers                   | **Settings → General → Default branch**                          | Must be one of the branches your workflow runs on, or PR annotations won't attach to the base branch.   |

**Workflow YAML permissions** — required in the workflow that calls
`github/codeql-action/upload-sarif@v3`. Add at either workflow or job
scope; job scope is safer.

```yaml
permissions:
  contents: read           # checkout
  security-events: write   # upload-sarif → Security tab
  actions: read            # required for private repos so upload-sarif can read the run
  pull-requests: write     # optional; only if you also post PR comments from summarize-prefix-diff-json.mjs
```

- `security-events: write` is the one that unlocks Code scanning. Without
  it `upload-sarif` fails with `Resource not accessible by integration`.
- `actions: read` is only required on **private** repos; public repos
  work without it but adding it is harmless.
- If you use a reusable workflow, the caller must also declare
  `security-events: write` — permissions do not inherit upward.

**Organization settings** — only relevant if the repo is inside an org
(**Organization → Settings**).

| Setting                                                     | Location                                                                             | Required value                                                                                          |
|-------------------------------------------------------------|--------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| GitHub Advanced Security enabled (private repos only)       | **Organization → Settings → Code security → Global settings → GitHub Advanced Security** | Enabled for the repo, or Code scanning is unavailable. Public repos do not need GHAS.                   |
| Code scanning not blocked at org level                      | **Organization → Settings → Code security → Global settings → Code scanning default setup** | *Not disabled* for this repo. Org-wide disable overrides repo enable.                                   |
| Actions permission policy allows `github/codeql-action/*`   | **Organization → Settings → Actions → General → Policies**                            | *Allow all actions* or an allow-list that includes `github/codeql-action/*`.                            |
| `GITHUB_TOKEN` default permissions not restricted below `read` | **Organization → Settings → Actions → General → Workflow permissions**            | Must allow the per-workflow `permissions:` block to grant `security-events: write`.                     |

**Account / caller permissions.**

| Actor                           | Required permission                                                                                    |
|---------------------------------|--------------------------------------------------------------------------------------------------------|
| You (viewing findings)          | **Read** on the repo is enough to view Code scanning alerts. **Write** is required to dismiss them.    |
| The workflow's `GITHUB_TOKEN`   | Automatic — the `permissions:` block above grants it. No PAT or app installation required.             |
| Fork contributors               | Cannot upload SARIF from a `pull_request` event. Use `pull_request_target` or wait until merge.        |
| Dependabot PRs                  | Same restriction as forks — SARIF upload is skipped. Findings attach on the follow-up `push` to main.  |

**Fast preflight checklist.** Before debugging an empty Security tab,
confirm all four:

- [ ] Repo has **Settings → Code security → Code scanning** enabled.
- [ ] Workflow job declares `permissions: security-events: write`.
- [ ] The run was triggered by `push` or `pull_request` on a branch you
      have permission to see (not a fork PR).
- [ ] `upload-sarif` step logs `SARIF upload complete` (not `Resource
      not accessible` or `Invalid SARIF file`).

If all four are true and findings still don't show, jump to the
*Security tab looks empty (GitHub UI gotchas)* table below — the cause
is almost always a filter/scope mismatch in the UI.

##### Token permissions and scopes (SARIF upload + Code Scanning REST API)

Three different tokens can talk to Code Scanning, and each one grants
scopes differently. Pick by **who is calling**:

- **The workflow itself** → `GITHUB_TOKEN` (automatic, per-job).
- **A script or curl call from your laptop / another CI** → fine-grained
  PAT or classic PAT.
- **A GitHub App** → installation token with repo permissions.

**1. `GITHUB_TOKEN` (workflow-scoped, auto-issued).**

Granted through the workflow's `permissions:` block. Nothing to create
in Settings.

| Operation                                                        | Required permission               | Notes                                                                                              |
|------------------------------------------------------------------|-----------------------------------|----------------------------------------------------------------------------------------------------|
| `github/codeql-action/upload-sarif@v3` (POST `/code-scanning/sarifs`) | `security-events: write`      | The one non-negotiable scope. Without it: `Resource not accessible by integration`.                |
| Checkout the repo (`actions/checkout`)                           | `contents: read`                  | Needed to run the diff at all.                                                                     |
| Read the current run (private repos only)                        | `actions: read`                   | `upload-sarif` reads the run to attach analysis metadata; public repos work without it.            |
| Post a PR comment (e.g. `summarize-prefix-diff-json.mjs`)        | `pull-requests: write`            | Only if you also comment. Not required for SARIF upload itself.                                    |
| Read existing alerts inside the workflow (e.g. `curl /alerts`)   | `security-events: read`           | `write` implies `read`, so declaring `write` is sufficient.                                        |

Minimum block for the SARIF workflow:

```yaml
permissions:
  contents: read
  security-events: write
  actions: read           # private repos
```

**2. Fine-grained personal access token (recommended for scripts).**

Create at **Settings → Developer settings → Personal access tokens →
Fine-grained tokens**. Scope to a single repo or a specific org.

| Operation                                                                 | Repository permission             | Access level |
|---------------------------------------------------------------------------|-----------------------------------|--------------|
| `POST /repos/{owner}/{repo}/code-scanning/sarifs` (upload)                | **Code scanning alerts**          | **Read and write** |
| `GET  /repos/{owner}/{repo}/code-scanning/analyses`                       | **Code scanning alerts**          | Read         |
| `GET  /repos/{owner}/{repo}/code-scanning/alerts`                         | **Code scanning alerts**          | Read         |
| `GET  /repos/{owner}/{repo}/code-scanning/alerts/{n}` and `/instances`    | **Code scanning alerts**          | Read         |
| `PATCH /repos/{owner}/{repo}/code-scanning/alerts/{n}` (dismiss / reopen) | **Code scanning alerts**          | Read and write |
| `GET  /repos/{owner}/{repo}/pulls/{n}` and `/pulls/{n}/files` (used by the troubleshooting checks) | **Pull requests** | Read         |
| Any of the above on a **private** repo                                    | **Metadata**                      | Read (auto-granted; leave enabled) |
| Any of the above on a public repo you don't own                           | *No token needed for unauthenticated reads* | Rate-limited to 60 req/hour |

Fine-grained tokens do **not** need `repo` or `security_events` — those
are classic-PAT names. Selecting **Code scanning alerts** on the
resource-permissions page grants the equivalent.

**3. Classic personal access token (legacy).**

Only use these when a tool doesn't support fine-grained tokens yet.

| Operation                              | Required classic scope                                                                 |
|----------------------------------------|----------------------------------------------------------------------------------------|
| Upload SARIF (public repo)             | `public_repo` **and** `security_events`                                                |
| Upload SARIF (private / internal repo) | `repo` **and** `security_events`                                                       |
| List / read alerts (public repo)       | `security_events` (or none for unauthenticated public reads, subject to 60/hour)       |
| List / read alerts (private repo)      | `repo` **and** `security_events`                                                       |
| Dismiss / reopen alerts                | Same as read + write access to the repo (`repo` or `public_repo`).                     |

`security_events` is the classic-scope equivalent of the fine-grained
**Code scanning alerts** permission. `repo` alone is **not** enough for
Code Scanning endpoints — the API returns `403 Resource not accessible
by personal access token` until `security_events` is added.

**4. GitHub App installation token.**

If you're calling from an App instead of a user token, request these
repository permissions in the App manifest:

| API surface                                    | App permission                    | Access level     |
|-----------------------------------------------|-----------------------------------|------------------|
| Upload SARIF, read/list/patch alerts           | **Code scanning alerts**          | Read & write     |
| Read PR files (for the annotation-check curl)  | **Pull requests**                 | Read-only        |
| Clone the repo before running the diff         | **Contents**                      | Read-only        |

Install the App on the target repo. The installation token inherits
these permissions automatically — no per-call scope negotiation.

**Org-level SSO gotcha.** If the org enforces SAML SSO, every PAT
(classic or fine-grained) must be **authorized for that org**:

- Fine-grained: **Settings → Developer settings → Personal access tokens
  → Fine-grained tokens → *Your token* → Configure SSO → Authorize**.
- Classic: **Settings → Developer settings → Personal access tokens →
  Tokens (classic) → *Your token* → Configure SSO → Authorize**.

Without authorization, every API call returns `200` with an empty body
or `404` — not a permission error, which makes this failure mode easy
to misdiagnose. Check `X-GitHub-SSO` in the response headers; if it
says `required; url=...`, that's the fix.

**Quick verification.**

Confirm a token has the right scopes before wiring it into anything:

```bash
# 1. Prints the granted scopes for a classic PAT (empty for fine-grained).
curl -sI -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user \
  | grep -i '^x-oauth-scopes:'
# Expect: x-oauth-scopes: repo, security_events

# 2. Confirms the token can read Code Scanning on the target repo.
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/code-scanning/alerts?per_page=1"
# Expect: 200. 403 = missing scope. 404 = code scanning disabled or wrong repo. 401 = bad token.

# 3. Fine-grained tokens: verify the resource permission by hitting the
#    dedicated preview endpoint (returns 200 when Code scanning alerts=Read).
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/code-scanning/analyses?per_page=1"
```

If step 1 returns nothing, you're on a fine-grained token — use step 3
to prove the scope instead of grepping `x-oauth-scopes`.

##### Verifying uploaded findings in GitHub code scanning


After the workflow finishes (green **or** red — `upload-sarif` runs under
`if: always()`), confirm the findings actually landed. Do the checks in
this order:

**1. Confirm the SARIF was accepted.**
- Open the workflow run: repo → **Actions** → pick the run → expand the
  `Prefix diff (SARIF)` job.
- Look at the **Upload SARIF** step log. A successful upload prints
  `Uploading results` followed by `SARIF upload complete`. If you see
  `Invalid SARIF file` or `Path does not exist`, the file wasn't
  generated — jump to the `--sarif` troubleshooting table above.
- On the run summary page, the **Artifacts** section should list
  `money-migration-audit-sandbox` (or `-live`) containing `diff.sarif`.
  Download it and re-check locally with the `jq -e` self-check from the
  "Sample SARIF output" section.

**2. Find the findings in the Security tab.**
- Repo → **Security** → **Code scanning** (left sidebar).
- In the filter bar, set:
  - **Tool:** `diff-money-migration-prefixes`
  - **Branch:** the branch the workflow ran on (defaults to the default branch)
  - **Category:** `money-migration-drift` (or whatever `category:` you
    passed to `upload-sarif`; sandbox and live should be distinct)
  - **Rule:** optional — filter to `money-migration-drift`,
    `money-migration-malformed`, or `money-migration-tooling`
- Each row shows the migration file, the rule ID, and severity **Error**.
  Click a row to see the full message (`Required money migration not
  applied in <env>: prefix <14-digit>`) and the file location.

**3. Verify per-file annotations on the PR.**
- Open the PR → **Files changed** tab.
- Each drifted `supabase/migrations/<file>.sql` should show a red
  gutter marker on line 1 with the same "Required money migration not
  applied…" message. `money-migration-malformed` and
  `money-migration-tooling` annotate the manifest
  (`scripts/required-money-migrations.mjs`) instead.
- If PR annotations are missing but the Security tab shows the findings,
  the SARIF uploaded from a non-PR event (push/schedule). Re-run the
  workflow on the PR itself, or add a `pull_request` trigger.

**4. Confirm de-duplication across re-runs.**
- Re-run the workflow. In **Security → Code scanning**, the finding
  count should stay the same, not double. The **History** panel on the
  finding shows one entry per run, all pointing at the same
  `partialFingerprints` (`migrationVersion` + `targetEnv`).
- If duplicates appear, `TARGET_ENV` or the file path changed between
  runs — see the last row of the `--sarif` troubleshooting table.

**5. Confirm resolution.**
- After the missing migration is applied, the next workflow run uploads
  a SARIF with `"results": []`. In **Security → Code scanning**, the
  matching finding's status flips from **Open** to **Closed** (labelled
  *"Fixed in <sha>"*). A clean run does **not** delete the history —
  the finding stays visible under the **Closed** filter as an audit trail.

**Requirements checklist** if the Security tab is empty:
- Repository setting **Settings → Code security → Code scanning** must
  be enabled (public repos: on by default; private repos: requires
  Advanced Security or a public repo).
- The workflow needs `permissions: security-events: write` at the job or
  workflow level. Without it, `upload-sarif` fails with `Resource not
  accessible by integration`.
- Findings are scoped to the branch the SARIF was uploaded from. Switch
  the **Branch** filter if you're looking at the default branch but the
  run was on a feature branch.

##### Downloading and inspecting SARIF artifacts from a workflow run

The `required-money-migrations` workflow uploads every generated SARIF
file as part of the `money-migration-audit-<env>` artifact bundle, so
you can pull the exact bytes GitHub processed and diff them against a
local run.

**Step 1 — Download the artifact.**

Via the GitHub UI:
- Repo → **Actions** → the failed/passing run → scroll to **Artifacts**
  at the bottom of the summary page.
- Click `money-migration-audit-sandbox` (or `-live`) to download a
  `.zip`. The bundle contains at least:
  ```
  diff.sarif                    # SARIF uploaded to Code scanning
  diff.txt                      # human-readable text diff (if generated)
  prefix-diff-cli.json          # machine-readable JSON from the CLI
  prefix-diff-cli.txt           # text mirror of the same run
  applied-audit.json            # applied-check machine-readable report
  applied-audit.md              # Markdown summary posted to Step Summary
  edge-function-logs/*.log      # per-function log excerpts (when collected)
  ```

Via `gh` CLI (faster, scriptable):
```bash
# List recent runs of the workflow
gh run list --workflow required-money-migrations.yml --limit 5

# Download every artifact from a specific run into ./artifacts/
gh run download <run-id> --dir artifacts/

# Or just the sandbox bundle
gh run download <run-id> --name money-migration-audit-sandbox --dir artifacts/
```

If the run was on a PR from a fork, `gh run download` requires
`--repo <owner>/<repo>` and a token with `actions: read`. Artifacts
expire after 90 days (repo default) — grab them before then.

**Step 2 — Regenerate the equivalent SARIF locally.**

Use the same `TARGET_ENV` and DB URL the failing job used (check the
job's `env:` block) so the comparison is apples-to-apples:

```bash
TARGET_ENV=sandbox \
SUPABASE_DB_URL_SANDBOX="$SUPABASE_DB_URL_SANDBOX" \
  node scripts/diff-money-migration-prefixes.mjs \
    --sarif --sarif-out=local-diff.sarif
```

**Step 3 — Compare the two SARIF files.**

SARIF has some non-deterministic fields (timestamps, absolute paths in
`invocations`, tool version if you're on a different branch). Normalize
before diffing:

```bash
# Strip volatile fields and canonicalize
jq -S 'del(
    .runs[].invocations,
    .runs[].tool.driver.semanticVersion,
    .runs[].results[].locations[].physicalLocation.artifactLocation.uriBaseId
  )' artifacts/money-migration-audit-sandbox/diff.sarif > /tmp/ci.norm.json

jq -S 'del(
    .runs[].invocations,
    .runs[].tool.driver.semanticVersion,
    .runs[].results[].locations[].physicalLocation.artifactLocation.uriBaseId
  )' local-diff.sarif > /tmp/local.norm.json

diff -u /tmp/ci.norm.json /tmp/local.norm.json
```

Zero diff = your local environment reproduces the CI finding exactly.
Any diff is real drift between environments (usually a migration
applied locally but not in sandbox, or vice versa).

**Step 4 — Compare just the findings.**

If the full SARIF diff is noisy, compare the `results[]` fingerprints
directly — this is what Code scanning actually keys on:

```bash
extract_fps() {
  jq -r '.runs[0].results[]
    | [.ruleId,
       .locations[0].physicalLocation.artifactLocation.uri,
       .partialFingerprints.migrationVersion // "-"]
    | @tsv' "$1" | sort
}

diff <(extract_fps artifacts/money-migration-audit-sandbox/diff.sarif) \
     <(extract_fps local-diff.sarif)
```

Each line is `<ruleId>\t<uri>\t<migrationVersion>`. Missing lines on
the left = findings CI reported that you no longer reproduce; missing
on the right = new findings your local DB shows that CI didn't.

**Step 5 — Cross-check with the JSON audit.**

`prefix-diff-cli.json` in the artifact is the same structure documented
in the **JSON schema** section above. Sanity-check the counts match the
SARIF:

```bash
jq '.summary' artifacts/money-migration-audit-sandbox/prefix-diff-cli.json
jq '.runs[0].results | length' artifacts/money-migration-audit-sandbox/diff.sarif
```

`summary.driftCount + summary.malformedCount + summary.toolingCount`
should equal the SARIF `results` length. A mismatch means one of the
two outputs was truncated — re-download the artifact.

**Step 6 — Common gotchas.**

| Symptom                                                     | Cause / fix                                                                                              |
|-------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `gh run download` says *no artifacts found*                 | Artifact expired (>90 days) or the job was skipped/cancelled before the upload step ran.                 |
| Local SARIF has findings, CI SARIF is empty                 | You're pointed at a different DB. Re-check `TARGET_ENV` and that `SUPABASE_DB_URL_*` matches the job env. |
| Rule IDs differ (`money-migration-drift` vs old name)       | You're on an older branch locally. Rebase onto `main` and rerun.                                         |
| `jq: error: Cannot iterate over null (null)`                | SARIF has `results: []` (clean run). Wrap the filter in `.runs[0].results // [] \| .[]`.                 |
| Fingerprints match but URIs differ                          | One run used absolute paths, the other used repo-relative. The `del(...uriBaseId)` step above fixes it.  |

##### SARIF field → Code scanning UI mapping

When you're reading a code-scanning alert row and trying to trace it
back to the SARIF the workflow uploaded (or vice versa), use this
table. Each row is one column/element in the **Security → Code
scanning** alert list (or on the alert detail page) and the SARIF
JSONPath it comes from.

Assume this SARIF shape (matches what
`scripts/diff-money-migration-prefixes.mjs --sarif` emits):

```jsonc
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "diff-money-migration-prefixes",
        "semanticVersion": "1.0.0",
        "informationUri": "https://github.com/<owner>/<repo>",
        "rules": [
          { "id": "money-migration-drift", "shortDescription": {...}, "defaultConfiguration": { "level": "error" } },
          { "id": "money-migration-malformed", ... },
          { "id": "money-migration-tooling", ... }
        ]
      }
    },
    "automationDetails": { "id": "money-migration-drift-sandbox/2026-07-22T12:00:00Z" },
    "results": [{
      "ruleId": "money-migration-drift",
      "level": "error",
      "message": { "text": "Required money migration not applied in sandbox: prefix 20260715120000…" },
      "locations": [{
        "physicalLocation": {
          "artifactLocation": { "uri": "supabase/migrations/20260715120000_ai_credit_spend.sql" },
          "region": { "startLine": 1 }
        }
      }],
      "partialFingerprints": { "migrationVersion": "20260715120000" }
    }]
  }]
}
```

**Alert list columns (Security → Code scanning table).**

| UI column / element                    | SARIF field                                                                                                    | Example value                                                             |
|----------------------------------------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| Alert title (bold, first line)         | `runs[].results[].message.text` (first line, truncated)                                                        | *Required money migration not applied in sandbox: prefix 20260715120000…* |
| Rule ID chip (small, next to title)    | `runs[].results[].ruleId`                                                                                       | `money-migration-drift`                                                   |
| Tool filter dropdown value             | `runs[].tool.driver.name`                                                                                       | `diff-money-migration-prefixes`                                           |
| Severity pill (colored dot + label)    | `runs[].results[].level` (or the rule's `defaultConfiguration.level` when omitted on the result)               | `error` → red **Error**; `warning` → yellow; `note` → blue                |
| File path (grey, under the title)      | `runs[].results[].locations[0].physicalLocation.artifactLocation.uri`                                          | `supabase/migrations/20260715120000_ai_credit_spend.sql`                  |
| Line-number suffix on the file path    | `runs[].results[].locations[0].physicalLocation.region.startLine`                                              | `:1`                                                                      |
| Branch column                          | The Git ref the workflow ran on (from `GITHUB_REF`), not a SARIF field                                          | `main`, `pr/1234`                                                         |
| Category filter value                  | `upload-sarif` step's `category:` input (mirrored into `runs[].automationDetails.id` as `<category>/<uuid>`)   | `money-migration-drift-sandbox`                                           |
| Alert number (`#123`, in the URL)      | Assigned by GitHub on first upload; stable across re-runs that share the same fingerprint                       | `#123`                                                                    |
| Status column (Open / Closed / Dismissed) | Derived: presence of the fingerprint in the latest SARIF + any manual dismissal on this alert number         | *Open*, *Closed – Fixed*, *Closed – Dismissed (Won't fix)*                |

**Alert detail page (click a row).**

| UI element                             | SARIF field                                                                                     |
|----------------------------------------|-------------------------------------------------------------------------------------------------|
| Header title                           | `runs[].results[].message.text` (full, not truncated)                                           |
| **Rule** sidebar → Name + description  | `runs[].tool.driver.rules[]` where `id == result.ruleId` → `shortDescription.text` / `fullDescription.text` |
| **Rule** sidebar → Severity            | `rules[].defaultConfiguration.level`, overridden by `results[].level` when present              |
| **Rule** sidebar → Tool name + version | `runs[].tool.driver.name` and `runs[].tool.driver.semanticVersion`                              |
| **Rule** sidebar → *More info* link    | `runs[].tool.driver.rules[].helpUri` (falls back to `runs[].tool.driver.informationUri`)        |
| Code snippet with red gutter on line 1 | `locations[0].physicalLocation.artifactLocation.uri` + `region.startLine`                       |
| **Show paths** (multi-location)        | Additional entries in `results[].locations[]` and `results[].codeFlows[]` (unused by this tool) |
| Timeline: *Detected in run #N*         | Each SARIF upload whose `results[]` still contains the same `partialFingerprints`                |
| Timeline: *In branch `<name>`*         | Ref of the workflow run that uploaded that SARIF                                                 |
| Alert dedupe key                       | `(runs[].tool.driver.name, ruleId, results[].partialFingerprints)` — **not** the alert number   |
| Fingerprint value (visible in the URL when filtering) | `results[].partialFingerprints.migrationVersion` (14-digit prefix)                |

**Two things that look like SARIF fields but aren't.**

- **`runId` / workflow run ID.** GitHub shows a "Detected in run
  #12345" link on the timeline. This is the `GITHUB_RUN_ID` of the
  workflow run, injected by `upload-sarif`. It is **not** stored in
  the SARIF itself — the SARIF's own `runs[]` array is unrelated
  (SARIF calls each *tool invocation* a "run"; this tool always emits
  exactly one).
- **Alert number (`#N`).** Assigned by GitHub, not present in SARIF.
  Two uploads with the same `(tool, ruleId, partialFingerprints,
  category)` update the same alert number; changing any of those four
  creates a new one.

**Fingerprint stability rules for this tool.**

The dedupe key that keeps a re-run from creating a duplicate alert is:

```
tool.driver.name  = "diff-money-migration-prefixes"     # constant
ruleId            = "money-migration-drift" | "-malformed" | "-tooling"
partialFingerprints.migrationVersion = "<14-digit prefix>"
category          = "money-migration-drift-<env>"       # from upload-sarif input
```

Any change to those fields (renaming the tool, renaming a rule, editing
the prefix on a required migration file, or changing the `category:`
between sandbox and live) will create a **new** alert instead of
updating the existing one. Keep them stable across runs unless you
deliberately want a fresh alert stream.

**Quick `jq` recipes to cross-reference one alert.**

```bash
# Given an alert's rule + file from the UI, find the SARIF result
jq --arg rule money-migration-drift \
   --arg uri  supabase/migrations/20260715120000_ai_credit_spend.sql \
   '.runs[0].results[]
     | select(.ruleId == $rule
              and .locations[0].physicalLocation.artifactLocation.uri == $uri)' \
   diff.sarif

# List every (ruleId, uri, fingerprint) triple the SARIF will produce alerts for
jq -r '.runs[0].results[]
  | [.ruleId,
     .locations[0].physicalLocation.artifactLocation.uri,
     .partialFingerprints.migrationVersion // "-"]
  | @tsv' diff.sarif | sort
```

##### Sample multi-file SARIF and how it groups in PR annotations

The single-finding SARIF earlier in this section is useful for a
"clean run" reference, but the real workflow usually emits several
results across different migration files. Below is a labeled multi-file
sample plus a field-by-field breakdown of how each `results[]` entry
surfaces in a PR's **Files changed** tab.

**Sample SARIF (`diff.sarif`) — 4 results across 3 files, 2 rules.**

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "diff-money-migration-prefixes",
          "semanticVersion": "1.4.0",
          "informationUri": "https://github.com/OWNER/REPO#money-migration-applied-check",
          "rules": [
            {
              "id": "money-migration-drift",
              "name": "MoneyMigrationDrift",
              "shortDescription": { "text": "Required migration prefix differs from applied prefix" },
              "fullDescription":  { "text": "The 14-digit prefix on this required file does not match the prefix recorded in supabase_migrations.schema_migrations for the target environment." },
              "defaultConfiguration": { "level": "error" },
              "helpUri": "https://github.com/OWNER/REPO#money-migration-applied-check"
            },
            {
              "id": "money-migration-malformed",
              "name": "MoneyMigrationMalformed",
              "shortDescription": { "text": "Required migration file has an unparseable 14-digit prefix" },
              "defaultConfiguration": { "level": "warning" },
              "helpUri": "https://github.com/OWNER/REPO#money-migration-applied-check"
            }
          ]
        }
      },
      "automationDetails": { "id": "required-money-migrations/live" },
      "results": [
        {
          "ruleId": "money-migration-drift",
          "level": "error",
          "message": { "text": "Expected prefix 20260715120000 but sandbox has 20260715115959." },
          "locations": [{
            "physicalLocation": {
              "artifactLocation": { "uri": "supabase/migrations/20260715120000_ai_credit_spend.sql" },
              "region": { "startLine": 1 }
            }
          }],
          "partialFingerprints": { "primaryLocationLineHash": "ai_credit_spend:20260715120000" }
        },
        {
          "ruleId": "money-migration-drift",
          "level": "error",
          "message": { "text": "Expected prefix 20260716090000 but sandbox has 20260716085500." },
          "locations": [{
            "physicalLocation": {
              "artifactLocation": { "uri": "supabase/migrations/20260716090000_referral_conversions.sql" },
              "region": { "startLine": 1 }
            }
          }],
          "partialFingerprints": { "primaryLocationLineHash": "referral_conversions:20260716090000" }
        },
        {
          "ruleId": "money-migration-drift",
          "level": "error",
          "message": { "text": "Expected prefix 20260717000000 but sandbox has 20260716235959." },
          "locations": [{
            "physicalLocation": {
              "artifactLocation": { "uri": "supabase/migrations/20260717000000_credit_pack_grants.sql" },
              "region": { "startLine": 1 }
            }
          }],
          "partialFingerprints": { "primaryLocationLineHash": "credit_pack_grants:20260717000000" }
        },
        {
          "ruleId": "money-migration-malformed",
          "level": "warning",
          "message": { "text": "File name does not begin with a 14-digit prefix; cannot compare to applied migrations." },
          "locations": [{
            "physicalLocation": {
              "artifactLocation": { "uri": "supabase/migrations/credit_pack_grants_fix.sql" },
              "region": { "startLine": 1 }
            }
          }],
          "partialFingerprints": { "primaryLocationLineHash": "credit_pack_grants_fix:malformed" }
        }
      ]
    }
  ]
}
```

**How those 4 results appear in the PR "Files changed" tab.**

GitHub does **not** collapse annotations by rule or by directory — it
attaches one marker per `results[]` entry, at the file+line named in
`locations[0].physicalLocation`. Grouping is entirely by file path.

| File in the PR diff                                              | Markers attached                                                                          | Rule / severity chip                                        |
|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| `supabase/migrations/20260715120000_ai_credit_spend.sql`         | 1 red marker in the line-1 gutter                                                         | `money-migration-drift` · **Error**                          |
| `supabase/migrations/20260716090000_referral_conversions.sql`    | 1 red marker in the line-1 gutter                                                         | `money-migration-drift` · **Error**                          |
| `supabase/migrations/20260717000000_credit_pack_grants.sql`      | 1 red marker in the line-1 gutter                                                         | `money-migration-drift` · **Error**                          |
| `supabase/migrations/credit_pack_grants_fix.sql`                 | 1 yellow marker in the line-1 gutter                                                      | `money-migration-malformed` · **Warning**                    |
| Any other file in the PR                                         | No markers                                                                                | —                                                            |

Concretely, that means:

- **Per file, per line = one annotation.** If a file appears in
  `results[]` twice at the same line, GitHub stacks both annotations
  under one expander on that line, ordered by severity (Error → Warning
  → Note), then by ruleId alphabetically.
- **Same rule, different files = separate annotations.** The three
  `money-migration-drift` results above stay on their own files — they
  are *not* rolled up into a single "3 issues" entry.
- **Different rules, same file = separate annotations stacked on that
  line.** If `credit_pack_grants_fix.sql` also had a `drift` result,
  its line-1 marker would expand to show both the Warning and the
  Error, each with its own **View alert** link.
- **Files not touched by the PR still get alerts, but no PR markers.**
  Only files present in the PR diff show gutter annotations; the rest
  appear only in the Security tab. If a drifted migration isn't in the
  diff, expect zero PR annotations and 3 Security-tab alerts.

**Files-changed sidebar counts.**

The left-hand file tree in **Files changed** shows a small annotation
badge next to each file with at least one marker. In the sample above:

- 3 files show a red "1" badge (one Error each).
- 1 file shows a yellow "1" badge (one Warning).
- The tree does **not** roll counts up to parent folders — you'll see
  4 individually-badged files under `supabase/migrations/`, not a
  single "4" on the folder.

**Conversation tab summary.**

At the top of the PR's **Conversation** tab, the code-scanning check
run summarizes the same 4 results as:

```
Code scanning results / diff-money-migration-prefixes
4 new alerts including 3 errors
```

Clicking through opens the check run detail page, which lists all 4
results grouped by **rule** (not by file) — this is the *only* place
in the UI where rule-level grouping happens:

```
money-migration-drift (3)
  supabase/migrations/20260715120000_ai_credit_spend.sql:1
  supabase/migrations/20260716090000_referral_conversions.sql:1
  supabase/migrations/20260717000000_credit_pack_grants.sql:1
money-migration-malformed (1)
  supabase/migrations/credit_pack_grants_fix.sql:1
```

**What controls the grouping.**

| SARIF field                                                  | Effect on PR UI                                                                    |
|--------------------------------------------------------------|------------------------------------------------------------------------------------|
| `results[].locations[0].physicalLocation.artifactLocation.uri` | Determines *which file* gets the marker. Must match the PR diff path exactly.      |
| `results[].locations[0].physicalLocation.region.startLine`     | Determines *which line* the marker attaches to.                                    |
| `results[].ruleId`                                             | Shown as the chip on the annotation; used for rule-level grouping on the check-run detail page only. |
| `results[].level` (or `rules[].defaultConfiguration.level`)    | Drives marker color (Error = red, Warning = yellow, Note = blue) and sort order within a stacked annotation. |
| `results[].partialFingerprints`                                | Not shown, but controls whether a result on the *next* run is treated as the same alert (dedupe) or a new one. |
| `automationDetails.id` (category)                              | Not shown, but scopes dedupe: two uploads with different categories create two separate alerts on the same line. |

**Verifying the sample locally.**

Save the JSON block above as `sample-multifile.sarif` and inspect it
with the same `jq` recipes documented earlier:

```bash
# Count results per rule (matches the check-run detail grouping)
jq '.runs[0].results | group_by(.ruleId) | map({rule: .[0].ruleId, count: length})' sample-multifile.sarif

# Count results per file (matches the Files-changed sidebar badges)
jq '.runs[0].results
    | group_by(.locations[0].physicalLocation.artifactLocation.uri)
    | map({file: .[0].locations[0].physicalLocation.artifactLocation.uri, count: length})' sample-multifile.sarif
```

Expected output:

```json
[
  { "rule": "money-migration-drift",     "count": 3 },
  { "rule": "money-migration-malformed", "count": 1 }
]
```

If the per-file `jq` groups don't match the badge counts you see in
the PR after upload, re-check the *Common gotchas* row about
`uriBaseId` — GitHub compares resolved paths, and a mismatched base
URI is the usual cause of "SARIF has 4 results but only 2 files show
markers."

##### Verifying alerts via the GitHub Code Scanning REST API (curl)


Sometimes the fastest way to confirm a SARIF upload landed correctly is
to skip the UI entirely and ask the REST API. This walkthrough uses
`curl` + `jq` to list, filter, and inspect the alerts created by the
`required-money-migrations` workflow.

**Prerequisites.**

- A token with `security_events: read` (for private repos) or
  `public_repo` (for public repos). Any of these work:
  - **Fine-grained PAT:** *Repository permissions → Code scanning
    alerts → Read-only*, scoped to the repo.
  - **Classic PAT:** `repo` scope for private repos, `public_repo` for
    public.
  - **Inside a workflow:** the built-in `${{ github.token }}` if the
    job has `permissions: security-events: read`.
- Export it once so every `curl` picks it up:
  ```bash
  export GH_TOKEN=ghp_...
  export OWNER=<owner>
  export REPO=<repo>
  ```

Every request below uses the same three headers:

```bash
AUTH=(-H "Authorization: Bearer $GH_TOKEN"
      -H "Accept: application/vnd.github+json"
      -H "X-GitHub-Api-Version: 2022-11-28")
```

**Step 1 — List all open alerts from this tool.**

Filter by `tool_name` so you only see alerts uploaded by
`diff-money-migration-prefixes` (not CodeQL or other scanners on the
same repo):

```bash
curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/alerts?tool_name=diff-money-migration-prefixes&state=open&per_page=100" \
  | jq '.[] | {number, rule: .rule.id, severity: .rule.severity, state, path: .most_recent_instance.location.path, ref: .most_recent_instance.ref}'
```

Sample output:

```json
{
  "number": 42,
  "rule": "money-migration-drift",
  "severity": "error",
  "state": "open",
  "path": "supabase/migrations/20260715120000_ai_credit_spend.sql",
  "ref": "refs/heads/main"
}
```

Useful query params (combine with `&`):

| Param            | Values                                        | Notes                                                          |
|------------------|-----------------------------------------------|----------------------------------------------------------------|
| `tool_name`      | `diff-money-migration-prefixes`               | Scopes to this scanner only                                    |
| `state`          | `open`, `closed`, `dismissed`, `fixed`        | Omit for all                                                   |
| `severity`       | `error`, `warning`, `note`                    | Matches the SARIF `level`                                      |
| `ref`            | `refs/heads/main`, `refs/pull/1234/merge`     | Scopes to a branch or PR                                       |
| `rule`           | `money-migration-drift` etc.                  | Same value as `ruleId` in SARIF                                |
| `sort` / `direction` | `created`/`updated`, `asc`/`desc`         | Default: most recently created first                           |
| `per_page`       | 1–100                                         | Paginate with `?page=N` or follow the `Link: rel="next"` header |

**Step 2 — Fetch one alert's full detail.**

```bash
ALERT=42
curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/alerts/$ALERT" \
  | jq
```

Key fields and their SARIF counterparts (mirrors the mapping table in
the *SARIF field → Code scanning UI mapping* section):

| API field                                                | SARIF source                                                        |
|----------------------------------------------------------|---------------------------------------------------------------------|
| `number`                                                 | Assigned by GitHub — **not** in SARIF                               |
| `rule.id`                                                | `results[].ruleId`                                                  |
| `rule.severity` / `rule.security_severity_level`         | `rules[].defaultConfiguration.level` (overridden by `results[].level`) |
| `tool.name` / `tool.version`                             | `runs[].tool.driver.name` / `.semanticVersion`                      |
| `most_recent_instance.message.text`                      | `results[].message.text`                                            |
| `most_recent_instance.location.path`                     | `results[].locations[0].physicalLocation.artifactLocation.uri`      |
| `most_recent_instance.location.start_line`               | `results[].locations[0].physicalLocation.region.startLine`          |
| `most_recent_instance.ref`                               | Git ref of the workflow run (`GITHUB_REF`)                          |
| `most_recent_instance.analysis_key`                      | Workflow file + job name that uploaded the SARIF                    |
| `most_recent_instance.category`                          | `upload-sarif` step's `category:` input                             |
| `most_recent_instance.commit_sha`                        | SHA at the time of the upload                                       |
| `state`                                                  | `open`, `dismissed`, `fixed` (derived from re-upload behavior)      |
| `dismissed_reason` / `dismissed_by` / `dismissed_at`     | UI dismissal metadata; absent when not dismissed                    |

**Step 3 — Verify one specific finding from your local SARIF exists as an alert.**

Given a `ruleId` + `uri` + `migrationVersion` triple from your local
`diff.sarif` (see the *fingerprint recipes* section), confirm GitHub
created the matching alert:

```bash
RULE=money-migration-drift
URI=supabase/migrations/20260715120000_ai_credit_spend.sql

curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/alerts?tool_name=diff-money-migration-prefixes&rule=$RULE&state=open&per_page=100" \
  | jq --arg uri "$URI" \
      '[.[] | select(.most_recent_instance.location.path == $uri)]
       | if length == 0 then "MISSING: no alert for \($uri)"
         else .[0] | {number, state, rule: .rule.id, path: .most_recent_instance.location.path, message: .most_recent_instance.message.text}
         end'
```

- `MISSING: no alert for …` → the SARIF was uploaded but GitHub did
  not create an alert for that fingerprint. Usually a category or
  branch mismatch — re-check the query params in Step 1.
- Non-null object → the alert exists; compare its `message` and
  `rule` fields to your local SARIF result.

**Step 4 — List the instances (per-branch / per-run history) of one alert.**

The alert itself is deduped across runs; the timeline of "detected in
run #N" entries lives at `/instances`:

```bash
curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/alerts/$ALERT/instances?per_page=100" \
  | jq '.[] | {ref, analysis_key, category, commit_sha, state, message: .message.text}'
```

Each element is one SARIF upload that still contained the alert's
fingerprint. If you re-ran the workflow and expected the alert to
auto-close, this endpoint tells you which uploads still see it and on
which branch.

**Step 5 — Inspect the SARIF analyses GitHub has processed.**

To confirm the workflow's `upload-sarif` step actually registered with
Code scanning (independent of whether it produced any alerts), list the
analyses:

```bash
curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/analyses?tool_name=diff-money-migration-prefixes&per_page=10" \
  | jq '.[] | {id, ref, category, created_at, results_count, rules_count, sarif_id, commit_sha}'
```

- `results_count: 0` on the latest analysis for a branch = clean run
  (SARIF had `results: []`).
- `results_count: N` but `curl …/alerts?state=open` returns fewer than
  `N` = alerts were dismissed or auto-closed on prior runs.
- Compare `sarif_id` to the value printed by `upload-sarif` in the
  workflow log — they must match, otherwise you're looking at a
  different upload.

You can also download the raw SARIF GitHub stored:

```bash
ANALYSIS_ID=<from previous step>
curl -sSL "${AUTH[@]}" \
  -H "Accept: application/sarif+json" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/analyses/$ANALYSIS_ID" \
  > github-stored.sarif

jq '.runs[0].results | length' github-stored.sarif
```

Diff this against your local `diff.sarif` using the normalization
recipe in the *Downloading and inspecting SARIF artifacts* section.

**Step 6 — Cross-check totals against the workflow output.**

Final sanity pass: the number of Open alerts for this tool + branch
should equal the number of results in the latest uploaded SARIF minus
any dismissed alerts.

```bash
# Alerts open on main
open=$(curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/alerts?tool_name=diff-money-migration-prefixes&state=open&ref=refs/heads/main&per_page=100" \
  | jq 'length')

# Results in the latest analysis
results=$(curl -sSL "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/code-scanning/analyses?tool_name=diff-money-migration-prefixes&ref=refs/heads/main&per_page=1" \
  | jq '.[0].results_count')

echo "open=$open  latest_results=$results"
```

`open == latest_results` and both match `jq '.summary' prefix-diff-cli.json`
from the artifact = the pipeline is fully in sync.

**Common gotchas.**

| Symptom                                                              | Cause / fix                                                                                              |
|----------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `HTTP 403 Resource not accessible by personal access token`          | Token lacks `security_events: read` (fine-grained) or `repo`/`public_repo` (classic). Regenerate.        |
| `HTTP 404` on `/code-scanning/alerts`                                | Code scanning not enabled on the repo, or the org disabled it. See *Required GitHub settings* section.   |
| Empty list even though the Security tab shows alerts                 | Missing `tool_name` filter picks the wrong scanner's namespace, or `ref` doesn't match the branch.       |
| `most_recent_instance.location.path` shows an absolute path          | The SARIF used `uriBaseId` — GitHub resolved it. Normalize before comparing (see *artifact diff* recipe).|
| `state: fixed` but the alert reappears in the next run               | Fingerprint changed. Compare `partialFingerprints` across the two SARIFs; usually a renamed migration.   |
| `X-RateLimit-Remaining: 0` on rapid polling                          | REST API is rate-limited to 5,000/hr per token. Batch with `per_page=100` and cache results.             |

##### Walkthrough: inspecting PR file annotations from an uploaded SARIF




Once `upload-sarif` finishes on a PR run, GitHub renders each SARIF
result as an inline annotation on the PR. Here's exactly where to click
and what each UI element maps back to in the SARIF file so you can trust
what you're seeing.

**Step 1 — Open the PR's Files changed tab.**
- Repo → **Pull requests** → your PR → **Files changed** (top tab bar,
  next to *Conversation*, *Commits*, *Checks*).
- The tab header shows a small badge like **`3 errors`** in red — that
  count comes directly from the number of SARIF `results` with
  `level: "error"` uploaded for this PR's head SHA. If the badge is
  missing, the SARIF either wasn't uploaded on the PR run or contained
  `results: []` (clean run).

**Step 2 — Locate a red gutter marker.**
- Scroll to any `supabase/migrations/<file>.sql` listed in the PR diff.
  If the file isn't in the diff, jump directly via the **Jump to file**
  dropdown at the top of *Files changed*.
- A red circle with a white **×** in the left gutter on **line 1** marks
  a drift finding. That gutter position corresponds to the SARIF field:
  ```
  locations[0].physicalLocation.region.startLine  // always 1
  locations[0].physicalLocation.artifactLocation.uri  // the file path
  ```
- `money-migration-malformed` and `money-migration-tooling` findings
  annotate `scripts/required-money-migrations.mjs` (the manifest)
  instead of a migration file — same visual, different `uri`.

**Step 3 — Expand the annotation.**
- Click the red gutter marker. An inline expandable panel opens directly
  below line 1 with three visible pieces:

  | UI element                                   | SARIF field it comes from                                          |
  |----------------------------------------------|--------------------------------------------------------------------|
  | Bold header, e.g. **`Code scanning / diff-money-migration-prefixes`** | `runs[0].tool.driver.name`                                       |
  | Rule ID chip, e.g. `money-migration-drift`   | `results[i].ruleId`                                                |
  | Severity pill (**Error** in red)             | `results[i].level` (`"error"` → red, `"warning"` → yellow)         |
  | Message text — *"Required money migration not applied in sandbox: prefix 20260715120000…"* | `results[i].message.text`                                          |
  | **View alert** link (bottom-right of panel)  | Deep-link to `Security → Code scanning → alert #N` for this result |
  | **Dismiss** dropdown (*False positive*, *Used in tests*, *Won't fix*) | Writes a `dismissal` back to the alert; SARIF file is unchanged    |

**Step 4 — Confirm the finding matches your local SARIF.**
- Download the `diff.sarif` artifact from the workflow run
  (**Actions → run → Artifacts → `money-migration-audit-<env>`**).
- Cross-reference one annotation against the file:
  ```bash
  jq '.runs[0].results[]
      | select(.locations[0].physicalLocation.artifactLocation.uri
              == "supabase/migrations/20260715120000_ai_credit_spend.sql")
      | {ruleId, level, message: .message.text,
         fingerprints: .partialFingerprints}' \
    diff.sarif
  ```
- The `message` should match the annotation text verbatim, and
  `partialFingerprints.migrationVersion` should be the 14-digit prefix
  named in the message.

**Step 5 — Follow the "View alert" deep-link.**
- Clicking **View alert** on the annotation lands you on
  `Security → Code scanning → alert #N` for this exact result.
- The alert page shows:
  - **History timeline** — one row per workflow run that reported this
    fingerprint. Same `partialFingerprints` across runs = one alert with
    an appended history entry (not a duplicate).
  - **Affected branches** — the branches whose latest SARIF still
    contains this result. When the migration is applied and the next
    run uploads `results: []`, the branch drops off this list and the
    alert status flips to **Closed → Fixed in `<sha>`**.
  - **Rule** panel (right sidebar) — the human name and description
    pulled from `runs[0].tool.driver.rules[]` matching `ruleId`.

**Step 6 — Handle the "no annotations visible" case.**
- If the *Files changed* badge shows errors but no red gutter markers
  appear on the migration file, the file is likely **collapsed**. Look
  for a *"Load diff"* link at the top of the file card and click it —
  GitHub skips annotations on unloaded diffs.
- If the migration file isn't in the PR diff at all, annotations for it
  will **only** appear in the Security tab. The PR *Files changed* view
  is scoped to changed files; annotations on unchanged files render on
  the branch's default file view instead
  (`https://github.com/<owner>/<repo>/blob/<sha>/<path>#L1`).

**Step 7 — Compare with the `--github-annotations` fallback.**
- If you also ran the script with `--github-annotations`, the same
  findings appear as **`::error file=…,line=1::…`** entries in the
  workflow **job log** (Actions → run → job → the diff step). Those are
  workflow-command annotations, not SARIF alerts — they render in the
  job log and, when the path matches a file in the PR diff, also as
  gutter markers. They are ephemeral (one per run) and do **not**
  create Security tab alerts. Use them as a quick fallback when Code
  scanning is disabled on the repo.


##### Dismiss vs resolve: alert lifecycle and re-run behavior

Code scanning distinguishes **dismissing** an alert (you decided it
isn't actionable) from **resolving** it (the underlying drift was
fixed). Both change the PR annotation and the Security tab row, but
they behave differently on the next SARIF upload.

**Dismissing an alert (manual, from the UI).**

- Open the alert (Security → Code scanning → click the row, or
  **View alert** from the PR annotation) → **Dismiss alert** dropdown
  in the top-right → pick a reason:
  - *Won't fix* — accepted risk; drift is intentional
  - *False positive* — the finding is wrong
  - *Used in tests* — expected in this context
- Immediate effects:
  - Security tab row moves from **Open** → **Closed** with a
    **Dismissed (<reason>)** badge and your username.
  - PR **Files changed** tab: the red gutter marker on the migration
    file disappears on refresh, and the *N errors* badge decrements.
  - The alert history gains a `Dismissed by <user>` timeline entry.
- What does **not** happen:
  - The SARIF file is not modified. The dismissal lives in GitHub's
    alert database, keyed on `(ruleId, uri, partialFingerprints)`.
  - Local `diff.sarif` regeneration still shows the finding — the
    dismissal is server-side only.

**Resolving an alert (by fixing the underlying drift).**

- Apply the missing migration in the target DB (or add the required
  migration file), so the next `diff-money-migration-prefixes.mjs` run
  no longer emits that result.
- You do not click anything in the UI. Resolution happens when the
  next SARIF upload arrives **without** the fingerprint.

**What you should see after re-running the workflow.**

Re-trigger the workflow (Actions → run → **Re-run all jobs**, or push
a new commit). The alert's next state depends on whether the fingerprint
reappears in the freshly uploaded SARIF:

| Previous state       | Next SARIF contains the same fingerprint? | New alert state                                                        | PR annotation                                            |
|----------------------|-------------------------------------------|------------------------------------------------------------------------|----------------------------------------------------------|
| Open                 | Yes                                       | **Open** (unchanged); history gains a new "Detected in run #N" row     | Red gutter marker stays on migration file line 1         |
| Open                 | No                                        | **Closed → Fixed in `<sha>`**; auto-closed by GitHub                    | Red gutter marker disappears; *N errors* badge decrements |
| Dismissed (any)      | Yes                                       | **Closed → Dismissed** (unchanged); history gains "Detected in run #N" | No annotation (dismissed alerts don't annotate PRs)      |
| Dismissed (any)      | No                                        | **Closed → Fixed in `<sha>`**; dismissal is superseded by the fix       | No annotation; alert history shows both events           |
| Closed → Fixed       | Yes (regression)                          | **Reopened → Open**; history shows "Reopened by run #N"                | Red gutter marker returns on the migration file          |
| Closed → Fixed       | No                                        | **Closed → Fixed** (unchanged); no new history entry                    | No annotation                                            |

**Verification checklist after the re-run.**

1. **Actions run** — the `Upload SARIF` step logs `SARIF upload complete`
   and the artifact bundle contains the new `diff.sarif`.
2. **Security tab** — filter **Status: All** and confirm the row
   transitioned per the table above. Click the row → the **Timeline**
   section shows the new run entry with its SHA and workflow link.
3. **PR Files changed tab** — hard-reload (Cmd/Ctrl-Shift-R; GitHub
   caches this view). The gutter marker either appears, disappears, or
   returns, matching the expected column above.
4. **Local sanity check** — regenerate `local-diff.sarif` and diff
   fingerprints against the CI artifact (see the "Downloading and
   inspecting SARIF artifacts" section). If your local run still shows
   a finding that CI closed as Fixed, your local DB is behind — apply
   the missing migration locally.

**Common gotchas.**

| Symptom                                                             | Cause / fix                                                                                                     |
|---------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Dismissed alert reappears as a **new** Open alert after re-run      | The fingerprint changed (e.g. filename renamed, migrationVersion prefix shifted). Dismissals are per-fingerprint. |
| Alert stuck on **Open** even after applying the migration           | Wrong `TARGET_ENV` in the re-run — the job is still pointed at the environment where drift exists.              |
| PR annotation lingers after dismissal                               | Browser cache. Hard-reload the *Files changed* tab.                                                             |
| Alert flips to **Fixed** then back to **Open** on the next run      | Two workflows uploading with the **same** `category:` but different DB targets are overwriting each other. Give each env a distinct category (`money-migration-drift-sandbox`, `-live`). |
| Timeline shows the re-run but status didn't change                  | The re-run used a cached `diff.sarif` artifact instead of regenerating it. Confirm the CLI step actually ran (check the job log, not just `upload-sarif`). |

##### Fingerprint collisions: when alerts merge vs split

Code scanning decides "same alert as last time?" **only** from the alert
key. It does **not** compare `message.text`, `region.startLine`, the
snippet, or the artifact contents. Once two results share the key, the
UI treats them as one alert and silently overwrites the visible fields
with whatever the latest upload sent.

**The alert key.**

```text
alertKey = (
  runs[].tool.driver.name,           // "diff-money-migration-prefixes"
  results[].ruleId,                  // "prefix-drift" | "malformed-migration" | "tooling-failure"
  results[].partialFingerprints,     // full object, key order ignored, values compared as strings
  upload category,                   // upload-sarif `category:` input (defaults to workflow file path)
  Git ref                            // branch or PR head, per the run's event
)
```

Change any component of the key → GitHub creates a **new** alert.
Keep the whole key stable → GitHub **updates the existing** alert in
place, no matter what else changed in the result.

**Behavior matrix — two results with the same `partialFingerprints`.**

Assume both results have identical `ruleId`, `partialFingerprints`,
category, and ref. Only the columns marked as varying differ between
the two results:

| Scenario                                                | `location.uri` | `region.startLine` | `message.text` | UI outcome                                                                                     |
|---------------------------------------------------------|----------------|--------------------|----------------|------------------------------------------------------------------------------------------------|
| Identical results (idempotent re-upload)                | same           | same               | same           | **1 alert.** Timeline gains "Detected in run #N". No visible change.                            |
| Same file, different line                               | same           | **different**      | same           | **1 alert.** Gutter marker moves to the new line; old line's marker disappears on refresh.     |
| Same file, different message                            | same           | same               | **different**  | **1 alert.** Alert detail page shows the **newest** message; old text is discarded (not diffed). |
| Different file, same line/message                       | **different**  | same               | same           | **1 alert.** Alert's *Location* changes to the new URI. The previous file loses its annotation. Ambiguous — usually a fingerprint bug. |
| Two results in the **same SARIF run** with same key     | any            | any                | any            | **1 alert.** GitHub keeps the **first** `results[]` entry and drops the rest silently. Check `jq '[.runs[0].results[] \| .partialFingerprints] \| group_by(.) \| map(select(length>1))' diff.sarif`. |
| Different `ruleId`, same fingerprint                    | same           | same               | same           | **2 alerts.** `ruleId` is part of the key. Expected when a finding is reclassified. |
| Same fingerprint, different upload `category:`          | same           | same               | same           | **2 alerts** (one per category stream). This is why sandbox/live use distinct categories. |
| Same fingerprint, different Git ref (branch/PR head)    | same           | same               | same           | **2 alerts**, one per ref. Merging the PR into the default branch does **not** merge the alerts — the default-branch run creates its own. |

**When alerts split (new alert appears instead of updating).**

Any of these will produce a fresh Open alert while the old one stays as
`Open` or auto-closes to `Fixed` on the next clean run:

- A `partialFingerprints` **value** changed (even a whitespace or case
  difference — values are compared as strings).
- A `partialFingerprints` **key** was added or removed.
- `ruleId` changed (e.g. `prefix-drift` → `malformed-migration`).
- The upload `category:` changed between runs.
- The Git ref changed (branch rename, force-push that rewrites the head
  SHA on a different ref).

**Practical rules for this repo.**

- Fingerprints in `diff-money-migration-prefixes.mjs` are
  `{ migrationVersion, targetEnv }`. Keep both stable across re-runs of
  the same drift, or every rerun spawns a duplicate.
- If you need to change `message.text` (e.g. to add more context to an
  existing finding), you can — the alert updates in place and the new
  text appears immediately. Reviewers won't see a diff of old vs new
  message; only the latest is stored.
- If you need to relocate a finding within the same file (line moved
  after a migration edit), let the fingerprint stay the same. The
  gutter marker follows to the new `startLine` automatically.
- If you want the finding to **split** (e.g. sandbox vs live are now
  genuinely separate findings), change the fingerprint deliberately
  (add `targetEnv` if you weren't already) and upload with distinct
  `category:` values.

**Verifying merge vs split before pushing.**

```bash
# List all fingerprints in a SARIF, one per line, sorted.
jq -r '.runs[0].results[]
       | (.ruleId + " | " + (.partialFingerprints | tostring))' diff.sarif | sort

# Find duplicates within the same run (these get silently dropped on upload).
jq '[.runs[0].results[] | .partialFingerprints]
    | group_by(.) | map(select(length > 1))' diff.sarif
```

If the second command prints anything other than `[]`, fix the
generator — two results in the same upload with the same key means one
of them will disappear in the UI with no warning.

##### Security tab looks empty (GitHub UI gotchas)



If `Upload SARIF` printed `SARIF upload complete` but **Security → Code
scanning** still shows no findings, it's almost always a filter/scope
mismatch in the UI rather than a real upload failure. Walk this table
top-to-bottom — the fixes are ordered by how often each one bites:

| Symptom                                                                 | Likely cause                                                                                          | Where to look / quick fix                                                                                                                        |
|-------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| "No open alerts" on Security tab, but upload succeeded                   | **Branch filter** defaults to the repo's default branch; your run was on a feature/PR branch          | Top of Code scanning → **Branch** dropdown → select the branch the workflow ran on (or `All branches`).                                          |
| Findings appear then vanish on refresh                                   | **Status filter** defaults to `Open`; a follow-up clean run auto-closed them                          | Change **Open** → **Closed** (or `All`). Closed = fixed by a later run, not deleted.                                                             |
| Only some findings visible                                               | **Tool** or **Category** filter narrowed to something else (CodeQL, another SARIF category)           | Set **Tool:** `diff-money-migration-prefixes` and clear **Category**, or select the exact `money-migration-drift` category you uploaded.         |
| Nothing at all under Code scanning, even with all filters cleared        | **Code scanning not enabled** on the repo                                                             | Repo → **Settings → Code security → Code scanning** → enable. Private repos need GitHub Advanced Security; public repos are free.                |
| Upload step logs `Resource not accessible by integration`                | Missing `permissions: security-events: write` on the workflow/job                                     | Add at the workflow or job level: `permissions:\n  security-events: write\n  contents: read`. Re-run.                                            |
| Upload succeeds on PR but Security tab is empty for the PR head branch   | GitHub only stores PR-scoped alerts when the workflow runs on `pull_request`, not `push`             | Trigger the workflow on `pull_request:` (not only `push:`). Existing `push` runs populate the target branch instead.                             |
| Findings show on default branch but not on the feature branch            | Same as above — `push` events attach findings to the pushed branch only                              | Push the branch, or add a `pull_request` trigger so the PR head branch gets its own scan.                                                        |
| Sandbox and live findings collide / one overwrites the other             | Both uploads used the same `category:`                                                                | Give each env a distinct category: `category: money-migration-drift-sandbox` and `-live`. Findings are keyed on `(tool, category, ref)`.         |
| Fork PR: upload step is skipped with a permissions warning               | GitHub blocks `security-events: write` for pull requests **from forks** by design                    | Expected. Findings only appear once the PR merges (workflow re-runs on `push` to the default branch) or when run via `pull_request_target`.      |
| Security tab entirely missing from repo nav                              | Repo is in an org that disabled Advanced Security, or you lack **Security** permission                | Org owner: **Organization → Settings → Code security** → enable. Individual: ask a maintainer for the **Security manager** role or write access. |
| Findings visible in the Security tab but no red gutter on **Files changed** | PR annotations only render if the SARIF was uploaded from the **same PR run**, on the PR head SHA | Confirm the workflow ran on the PR (not just `main`). Re-run the workflow on the PR to attach annotations to the current head SHA.               |
| "This SARIF file was processed" banner but zero results                  | SARIF's `results: []` was empty — clean run, no drift to show                                        | Expected. Re-check locally with `jq '.runs[0].results \| length' diff.sarif`. `0` means nothing to report, not a bug.                            |
| Findings dated hours ago don't refresh after a re-run                    | Browser cached the Security tab                                                                       | Hard-reload (Cmd/Ctrl-Shift-R). GitHub does not push updates over websocket here.                                                                |

If none of the above matches, download the `diff.sarif` artifact from
the workflow run and run the `jq -e` self-check in the "Sample SARIF
output" section. A valid-but-empty SARIF means the diff itself found no
drift — the upload path is fine, there's just nothing to show.

##### PR annotations don't appear after upload

The Security tab can show the alert while the **Files changed** tab
shows no red gutter marker. That means the SARIF was accepted but
GitHub couldn't (or wouldn't) attach it to this PR's diff. Walk this
list top-to-bottom; each step includes a `curl`+`jq` check you can run
without leaving the terminal.

Set these once and reuse them in the snippets below:

```bash
export GH_TOKEN=ghp_...                       # scopes: repo, security_events
export REPO=verdantgrower/verdant-grow-diary
export PR=1234
export SHA=$(gh pr view "$PR" --repo "$REPO" --json headRefOid -q .headRefOid)
export API="https://api.github.com"
export H_ACCEPT="Accept: application/vnd.github+json"
export H_AUTH="Authorization: Bearer $GH_TOKEN"
export H_VER="X-GitHub-Api-Version: 2022-11-28"
```

1. **The upload never actually happened on this SHA.**
   Annotations attach to the exact commit the workflow ran on. If the
   workflow ran on `main` (post-merge) instead of the PR head, no
   annotations appear on the PR.

   ```bash
   # Latest analyses for this ref, newest first.
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/analyses?ref=refs/pull/$PR/head&per_page=5" \
     | jq -r '.[] | [.created_at, .commit_sha, .category, .tool.name, .results_count] | @tsv'
   ```

   Fix: the top row's `commit_sha` must equal `$SHA`. If it doesn't,
   the workflow didn't run on the PR head — re-run it on the PR
   (`gh workflow run ... --ref refs/pull/$PR/head`) or push a new commit.

2. **Fork PR: `security-events: write` is silently downgraded.**
   GitHub blocks that permission for `pull_request` runs from forks.
   The upload step is skipped with a warning, so nothing to annotate.

   ```bash
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/pulls/$PR" \
     | jq '{fork: .head.repo.fork, head_repo: .head.repo.full_name, base_repo: .base.repo.full_name}'
   ```

   Fix: expected behavior. Use `pull_request_target` (with care), or
   wait for merge — annotations appear on the default-branch run.

3. **SARIF has zero results (clean run).**
   Upload succeeds, Code Scanning stores it, but there are no findings
   to annotate.

   ```bash
   # From the local or downloaded SARIF:
   jq '.runs[0].results | length' diff.sarif
   # Or via API — last analysis's results_count:
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/analyses?ref=refs/pull/$PR/head&per_page=1" \
     | jq '.[0] | {commit_sha, results_count, rules_count}'
   ```

   Fix: expected when there's no drift. Nothing to render.

4. **All results are dismissed or auto-fixed on this branch.**
   Dismissed alerts don't annotate PRs; fixed alerts don't either.

   ```bash
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/alerts?ref=refs/pull/$PR/head&state=open&per_page=100" \
     | jq -r '.[] | [.number, .rule.id, .state, .most_recent_instance.location.path] | @tsv'
   ```

   Fix: if this returns `[]` but the SARIF has results, they're all
   `closed` (dismissed/fixed) — that's why no gutter markers. Reopen
   in the UI or push a change that reintroduces the fingerprint.

5. **`location.uri` doesn't match a file in the PR diff.**
   GitHub only draws annotations on lines that actually appear in the
   PR's changed files. Absolute paths, wrong casing, or files that
   weren't touched → no gutter marker even though the alert exists.

   ```bash
   # (a) Paths GitHub sees on each alert:
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/alerts?ref=refs/pull/$PR/head&per_page=100" \
     | jq -r '.[] | .most_recent_instance.location.path' | sort -u

   # (b) Paths actually in the PR diff:
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/pulls/$PR/files?per_page=100" \
     | jq -r '.[].filename' | sort -u

   # (c) Diff them — anything only in (a) will never annotate this PR:
   diff <(...paths from a...) <(...paths from b...)
   ```

   Fix: emit repo-relative POSIX paths in `physicalLocation.artifactLocation.uri`
   (no leading `/`, no `C:\`, exact casing). `bun run validate:sarif`
   warns on absolute paths for this reason.

6. **`region.startLine` points outside the diff hunk.**
   The file is in the PR but the annotated line wasn't changed, so the
   marker collapses into the file header instead of appearing inline.

   ```bash
   # For each alert, show its line and check if the PR patch touched it:
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/alerts?ref=refs/pull/$PR/head&per_page=100" \
     | jq -r '.[] | [.number, .most_recent_instance.location.path,
                     .most_recent_instance.location.start_line] | @tsv'
   ```

   Fix: expected — expand the file in **Files changed** to see the
   marker, or scope the SARIF to lines inside the hunk.

7. **Wrong `category:` in `upload-sarif`, or category changed between runs.**
   Alerts are keyed on `(tool, category, ref)`. A new category creates
   a parallel alert stream that may not surface where you're looking.

   ```bash
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/analyses?ref=refs/pull/$PR/head&per_page=10" \
     | jq -r '.[] | [.created_at, .category, .commit_sha[:7], .results_count] | @tsv'
   ```

   Fix: pick one stable category per environment
   (`prefix-diff-sandbox`, `prefix-diff-live`) and don't rename it.

8. **Code scanning disabled or permission missing.**
   The upload step would have failed loudly, but it's worth confirming
   before chasing SARIF shape.

   ```bash
   # 404 => code scanning not enabled or token lacks security_events.
   curl -sS -o /dev/null -w "%{http_code}\n" \
     -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/alerts?per_page=1"
   ```

   Fix: `404` → enable at **Settings → Code security → Code scanning**,
   and ensure the workflow has `permissions: security-events: write`.
   `403` → PAT is missing the `security_events` scope.

9. **Browser cached the Files-changed view.**
   The alert is attached, the analysis is fresh, but you're looking at
   a stale render.

   ```bash
   # Confirm the analysis is newer than your tab:
   curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
     "$API/repos/$REPO/code-scanning/analyses?ref=refs/pull/$PR/head&per_page=1" \
     | jq -r '.[0].created_at'
   ```

   Fix: hard-reload (Cmd/Ctrl-Shift-R) on the **Files changed** tab.

**One-shot health check.**

If you don't know which of the above applies, run this and read the
output top-to-bottom — it answers steps 1, 3, 4, and 7 in one call:

```bash
curl -sS -H "$H_ACCEPT" -H "$H_AUTH" -H "$H_VER" \
  "$API/repos/$REPO/code-scanning/analyses?ref=refs/pull/$PR/head&per_page=5" \
  | jq --arg sha "$SHA" '
      map({created_at, commit_sha, category, tool: .tool.name,
           results_count, matches_pr_head: (.commit_sha == $sha)})'
```

If no row has `matches_pr_head: true`, you're in case 1. If the
matching row has `results_count: 0`, case 3. If it's non-zero but the
PR shows nothing, jump to cases 4–6.




Rule catalog (always present in the SARIF `tool.driver.rules`, even on
clean runs):

| Rule ID                         | Fires when                                                        |
|---------------------------------|-------------------------------------------------------------------|
| `money-migration-drift`         | A required 14-digit prefix is absent from the target DB.          |
| `money-migration-malformed`     | A `REQUIRED_MONEY_MIGRATIONS` entry has no 14-digit prefix.       |
| `money-migration-tooling`       | No DB URL, `psql` missing, or the tracker query failed.           |

Every result is `level: error`, points at
`supabase/migrations/<file>` (or the manifest for malformed / tooling
findings), and includes `partialFingerprints` (`migrationVersion`,
`targetEnv`) so code-scanning de-duplicates re-runs of the same drift.

`--sarif` and `--github-annotations` are additive — they can be combined
with each other and with `--json`. Exit codes are unchanged: SARIF/annotation
output is a report on the same underlying result, not a separate check.

##### Sample SARIF output

Use these to sanity-check what you're generating locally. Both are real,
schema-valid SARIF 2.1.0 documents you can paste through
[the OASIS SARIF validator](https://sarifweb.azurewebsites.net/Validation)
or `jq` before wiring up `upload-sarif`.

**Sample invocation** (drift against sandbox, file + stdout for inspection):

```bash
TARGET_ENV=sandbox \
SUPABASE_DB_URL_SANDBOX="postgres://..." \
node scripts/diff-money-migration-prefixes.mjs \
  --sarif --sarif-out=audit/money-migrations/diff.sarif

# Verify structure without eyeballing every field:
jq '{version, schema: ."$schema", runs: (.runs | length),
     tool: .runs[0].tool.driver.name,
     rules: [.runs[0].tool.driver.rules[].id],
     results: (.runs[0].results | length),
     firstResult: .runs[0].results[0]}' \
  audit/money-migrations/diff.sarif
```

**Sample output — clean run (no drift, exit `0`):**

```jsonc
{
  "version": "2.1.0",
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "diff-money-migration-prefixes",
          "informationUri": "https://github.com/<owner>/<repo>",
          "rules": [
            { "id": "money-migration-drift",     "shortDescription": { "text": "Required migration prefix not applied in target DB" } },
            { "id": "money-migration-malformed", "shortDescription": { "text": "Manifest entry missing a 14-digit prefix" } },
            { "id": "money-migration-tooling",   "shortDescription": { "text": "DB URL missing, psql missing, or tracker query failed" } }
          ]
        }
      },
      "results": []   // empty on a clean run — this is valid SARIF, not an error
    }
  ]
}
```

**Sample output — one drift finding (exit `1`):**

```jsonc
{
  "version": "2.1.0",
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json",
  "runs": [
    {
      "tool": { "driver": { "name": "diff-money-migration-prefixes", "rules": [ /* …3 rules… */ ] } },
      "results": [
        {
          "ruleId": "money-migration-drift",
          "level": "error",
          "message": {
            "text": "Required money migration not applied in sandbox: prefix 20260715120000 (supabase/migrations/20260715120000_ai_credit_spend.sql)"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "supabase/migrations/20260715120000_ai_credit_spend.sql" },
                "region": { "startLine": 1 }
              }
            }
          ],
          "partialFingerprints": {
            "migrationVersion": "20260715120000",
            "targetEnv": "sandbox"
          }
        }
      ]
    }
  ]
}
```

Quick local self-check that what you generated is the shape above:

```bash
jq -e '
  .version == "2.1.0"
  and (.runs | length) == 1
  and (.runs[0].tool.driver.name == "diff-money-migration-prefixes")
  and ([.runs[0].tool.driver.rules[].id] | sort)
      == ["money-migration-drift","money-migration-malformed","money-migration-tooling"]
' audit/money-migrations/diff.sarif >/dev/null \
  && echo "SARIF OK" || echo "SARIF INVALID"
```



##### Using `--github-annotations` locally and in CI

`--github-annotations` emits [GitHub workflow commands](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-error-message)
(`::error file=...,line=1::<message>`) on **stderr**. It reads the same
inputs as any other invocation of the CLI — nothing extra to prepare:

- `scripts/required-money-migrations.mjs` (the `REQUIRED_MONEY_MIGRATIONS`
  manifest) — for the expected 14-digit prefixes and their file paths.
- `supabase/migrations/*.sql` on disk — to confirm each required file
  exists and to extract its prefix.
- The target database's `supabase_migrations.schema_migrations` table
  (via `psql` + `SUPABASE_DB_URL` / `SUPABASE_DB_URL_SANDBOX` /
  `SUPABASE_DB_URL_LIVE`, selected by `TARGET_ENV`) — for the applied
  prefixes. Omit the DB URL when running `--expected` only; the CLI
  emits `money-migration-malformed` annotations without a DB round-trip.

Annotations map 1:1 to SARIF results:

| Rule                            | `file=` points at                                     |
|---------------------------------|-------------------------------------------------------|
| `money-migration-drift`         | `supabase/migrations/<missing-file>.sql`              |
| `money-migration-malformed`     | `scripts/required-money-migrations.mjs` (manifest)    |
| `money-migration-tooling`       | `scripts/required-money-migrations.mjs` (manifest)    |

**Local usage.** Annotations render as plain `::error ...::` lines
outside Actions — useful for a quick eyeball, but the text diff on
stdout is easier to read:

```bash
# Print annotations to stderr; keep the text diff on stdout.
TARGET_ENV=sandbox node scripts/diff-money-migration-prefixes.mjs \
  --github-annotations

# Capture just the annotations for inspection.
TARGET_ENV=sandbox node scripts/diff-money-migration-prefixes.mjs \
  --github-annotations 2> annotations.txt
```

There is also a shortcut in `package.json`:

```bash
bun run prefix-diff:annotations           # current env
TARGET_ENV=live bun run prefix-diff:annotations
```

**CI usage.** Inside a GitHub Actions job, stderr is parsed automatically
— no `upload-sarif` step required. Annotations appear in two places:

1. The **job log**, inline with the failing step, expanded by default.
2. The **PR "Files changed" tab**, as red gutter markers on the exact
   `supabase/migrations/<file>.sql` (or manifest) referenced by `file=`.

Minimal step:

```yaml
- name: Prefix diff (annotations)
  env:
    TARGET_ENV: sandbox
    SUPABASE_DB_URL_SANDBOX: ${{ secrets.SUPABASE_DB_URL_SANDBOX }}
  run: node scripts/diff-money-migration-prefixes.mjs --github-annotations
```

Combine with `--sarif` when you also want code-scanning history and
de-duplication across re-runs; use `--github-annotations` alone when you
only need the inline PR markers.

#### Troubleshooting

Common failure modes and the fastest fix for each. All apply to both
`scripts/assert-required-money-migrations-applied.mjs` and
`scripts/diff-money-migration-prefixes.mjs` unless noted.

| Symptom                                                                          | Likely cause                                                        | Quickest fix                                                                                                                          |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `No DB URL provided` / exit code `2` / SARIF `money-migration-tooling`           | Neither `SUPABASE_DB_URL` nor the env-specific URL is set           | `export SUPABASE_DB_URL_SANDBOX=...` (or `_LIVE`) **and** `export TARGET_ENV=sandbox`. Verify with `env \| grep SUPABASE_DB_URL`.     |
| `psql: command not found` / `spawn psql ENOENT`                                  | Postgres client not installed or not on `PATH`                      | macOS: `brew install libpq && brew link --force libpq`. Debian/Ubuntu: `sudo apt-get install postgresql-client`. Confirm: `which psql`. |
| Applied-check reports drift but sandbox is definitely up to date                 | `TARGET_ENV` points at the wrong DB (e.g. `live` while URL is sandbox) | Set `TARGET_ENV` to match the URL variable you exported. Cross-check with `echo $TARGET_ENV` and the `target_env` field in JSON output. |
| `psql: FATAL: password authentication failed`                                    | Stale or wrong pooler credentials in the DB URL                     | Refresh the connection string; ensure no shell-escaped `$` characters in the password. Test with `psql "$SUPABASE_DB_URL_SANDBOX" -c 'select 1'`. |
| `Tracker query failed` / SARIF `money-migration-tooling`                          | `supabase_migrations.schema_migrations` unreachable (network, SSL, wrong DB) | Add `?sslmode=require` if the pooler needs it, and confirm the URL points at the Supabase project's Postgres, not a local instance.   |
| Exit `1` immediately, no drift table                                              | Manifest entry missing a 14-digit prefix (`money-migration-malformed`) | Open `scripts/required-money-migrations.mjs` and confirm each path begins with a 14-digit timestamp. Re-run the unit tests: `bun run test:prefix-diff`. |
| `mkdir` / `ENOENT` errors when writing diff or redirected SARIF artifacts        | `DIFF_PATH` and shell `>` redirects don't auto-create parent dirs   | `mkdir -p audit/money-migrations` before setting `DIFF_PATH=` or `--sarif > path`. `--sarif-out=PATH` creates parents itself.          |
| CI green locally, red in Actions                                                  | `SUPABASE_DB_URL_SANDBOX` / `_LIVE` GitHub secrets missing or misnamed | Re-check the exact names in the repo Secrets settings — the workflow only reads those two, not `DATABASE_URL`.                        |
| Sandbox smoke script hangs                                                       | Missing `SANDBOX_SMOKE_USER` or the user has no Paddle sandbox entitlement | Set `SANDBOX_SMOKE_USER` to a real sandbox account UUID; re-run with `--verbose` to see the checkpoint it stalls on.                  |
| `Edge shared-lib mirror is out of sync` during `bun run build` / prebuild        | Files under `src/lib` (or imported closure) changed without regenerating `supabase/functions/_shared/lib` and `.sync-manifest.json` | Run `bun run sync-edge-shared`, then `git add supabase/functions/_shared/lib .sync-manifest.json` and commit. Locally, `prebuild` auto-regenerates; in CI (`CI=1` / `--check-only`) it fails closed so drift can't be papered over — commit the sync output and push. |



##### `--sarif` specific issues

Symptoms and fixes unique to the SARIF output path:

| Symptom                                                                          | Likely cause                                                        | Quickest fix                                                                                                                          |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| `jq: parse error: Invalid numeric literal` when piping `--sarif` into `jq`       | Text diff was mixed into stdout (e.g. `--sarif-out=PATH` was passed, so stdout has the human diff, not JSON) | For piping to `jq`, use `--sarif` **without** `--sarif-out`. Or read the file: `jq . audit/money-migrations/diff.sarif`.              |
| `jq: error: Cannot iterate over null` on `.runs[0].results[]`                    | Clean run — SARIF has an empty `results: []` array, which is valid  | Guard with `//`: `jq '.runs[0].results // [] \| length'`. Empty results = no drift, not a failure.                                    |
| `upload-sarif` step: `Path does not exist: audit/money-migrations/diff.sarif`    | You passed `--sarif` (stdout) instead of `--sarif-out=PATH`, or the step exited before the file was written | Always use `--sarif-out=PATH` in CI. Add `if: always()` on the upload step so tooling failures (exit `2`) still upload the SARIF.     |
| `upload-sarif` rejects the file: `Invalid SARIF file`                            | stdout was redirected on top of workflow-command output, or the file is empty | Use `--sarif-out=PATH` (never `--sarif > path` in CI). Verify locally: `jq '.version, .runs \| length' path/to/diff.sarif`.           |
| SARIF file exists but code scanning shows **no** findings on a known-drifted DB   | Wrong `category:` on `upload-sarif`, or the file was overwritten by a later clean run | Use a stable `category: money-migration-drift` per env; upload sandbox and live to distinct categories so they don't overwrite.       |
| Non-zero exit (`1` or `2`) fails the workflow before `upload-sarif` runs         | Default `run:` step short-circuits on non-zero exit                 | Append `\|\| true` to the diff step and gate the real failure on the `upload-sarif` outcome, or put `upload-sarif` under `if: always()`. |
| Exit `2` with SARIF that only contains a `money-migration-tooling` result        | DB URL missing, `psql` missing, or tracker query failed — no drift was actually evaluated | Fix the tooling cause first (see the main troubleshooting table). Exit `2` is never drift; treat it as infrastructure, not data.      |
| SARIF `results[].locations[0].physicalLocation.artifactLocation.uri` is a manifest path, not a migration file | Finding is `money-migration-malformed` or `money-migration-tooling` — no specific migration to point at | Expected. Only `money-migration-drift` results point at `supabase/migrations/<file>.sql`.                                             |
| Duplicate annotations in code scanning after re-running the workflow             | `partialFingerprints` mismatch (e.g. `TARGET_ENV` changed between runs) | Keep `TARGET_ENV` stable per category. The script fingerprints on `(migrationVersion, targetEnv)` — changing either creates a new finding. |

Still stuck? Run the diff CLI with `--json` and share the output — every
failure mode is annotated with `target_env`, exit code, and the exact
missing/malformed prefix, which is enough to diagnose without repo access.


