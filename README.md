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
