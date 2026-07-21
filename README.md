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
# SARIF 2.1.0 to stdout — pipe to a file or consume directly.
node scripts/diff-money-migration-prefixes.mjs --sarif

# SARIF to a file (text diff still prints to stdout for the CI log).
node scripts/diff-money-migration-prefixes.mjs \
  --sarif --sarif-out=audit/money-migrations/diff.sarif

# GitHub workflow-command annotations on stderr — file-annotated ::error::
# lines that surface in the PR "Files changed" tab without SARIF ingestion.
node scripts/diff-money-migration-prefixes.mjs --github-annotations
```

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





