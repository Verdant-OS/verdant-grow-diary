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


