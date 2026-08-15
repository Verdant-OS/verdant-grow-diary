# Verdant stabilization audit — 2026-07-30

Sprint contract: audit broadly, implement narrowly. This document is the audit
record for the 2026-07-30 stabilization sprint (branch
`chore/verdant-stabilization`). It is **historical**. The live snapshot as of
2026-08-13 is [zero-known-defects-board.md](./zero-known-defects-board.md), with
evidence in
[full-application-zero-defect-audit-2026-08-13.md](./full-application-zero-defect-audit-2026-08-13.md).
The GitHub issue set labeled `zero-defect` still wins when this file disagrees.

The live defect board is the GitHub issue set labeled `zero-defect`; org
project 2 was not resolvable from the 2026-08-13 refresh token. The 2026-07-30
release gate status in
[release-readiness-checklist.md](./release-readiness-checklist.md) was not
re-issued this pass.

Scope audited: repository identity/baseline, routes and navigation,
public/auth/demo safety, the One-Tent Loop (Quick Log, Timeline, sensor
snapshot, AI Doctor, alerts, Action Queue), sensor-truth rules, Supabase/data
access, static safety, and code hygiene. Not audited this pass: mobile
viewport behavior in a real browser (no interactive browser lane in the
session), Edge Function runtime behavior beyond contract/test review.

## 1. Repository identity

| Facet              | Finding                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vite 6.4.3 + React 18.3 (SPA, client-rendered; static SEO documents emitted at build)                                                                                                                                                                                                                                                                                                                     |
| Router             | react-router-dom 6.30, single `<BrowserRouter>`/`<Routes>` in `src/App.tsx` (134 routes)                                                                                                                                                                                                                                                                                                                  |
| Package manager    | bun (`bun.lock`; CI pins bun 1.3.14; lockfile policy guard `scripts/check-bun-lockfile-policy.mjs`)                                                                                                                                                                                                                                                                                                       |
| TypeScript         | 5.8.3; `tsc -p tsconfig.app.json --noEmit` is the canonical typecheck; app tsconfig is **not strict** (#590)                                                                                                                                                                                                                                                                                              |
| Tests              | vitest 3.2.6 (~4,700 test files); Playwright e2e (`chromium-mocked` + `chromium-authed` projects)                                                                                                                                                                                                                                                                                                         |
| Styling            | Tailwind 3.4 + shadcn/radix; design tokens in repo conventions                                                                                                                                                                                                                                                                                                                                            |
| Data               | supabase-js 2 (`src/integrations/supabase/client.ts`, publishable key + RLS; sessionStorage sessions); TanStack Query 5                                                                                                                                                                                                                                                                                   |
| Auth               | Supabase auth; `AuthProvider` (`src/store/auth.tsx`) + `AppShell` boundary + `useRequireAuth` server revalidation; operator surfaces behind `RequireOperatorRole` (server `has_role` RPC)                                                                                                                                                                                                                 |
| Writes             | RPC-first for Quick Log (`quicklog_save_manual` / `quicklog_save_event`); `createXForCaller` helpers inject `user_id` server-side-derived; migrations immutable per AGENTS.md                                                                                                                                                                                                                             |
| CI                 | ~65 workflows; `ci.yml` carries the 11 required checks (branch protection, see #562); 24 workflows are `main`-only and never run (#581)                                                                                                                                                                                                                                                                   |
| Safety scanners    | `scripts/security/static-client-secret-scan.mjs` (+ ~40 static-safety vitest suites), docs-safety guards, migration-safety scan, scanner-guardrail suites                                                                                                                                                                                                                                                 |
| Canonical commands | install `bun install --frozen-lockfile` · typecheck `bun run typecheck` · lint `bun run lint` · unit `bunx vitest run <files>` · full `bun run test:full:sharded` (or `test:vitest:controlled` resumable) · static safety `bun run test:static-safety` + `bun run test:security-static` · build `bun run build` · preview `bun run preview` · e2e `bunx playwright test --project=chromium-mocked <spec>` |

Stop-ship contract test: `src/test/v0-operating-loop-contract.test.ts`.

## 2. Baseline status before changes (2026-07-30, Node 26.3.0, Windows)

| Gate                                           | Result                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                | PASS (822 packages)                                                                                  |
| `bun run typecheck`                            | PASS                                                                                                 |
| `bun run lint`                                 | PASS                                                                                                 |
| `src/test/v0-operating-loop-contract.test.ts`  | PASS (26/26)                                                                                         |
| `bun run test:static-safety`                   | PASS (8 files, 182 tests)                                                                            |
| `bun run test:security-static`                 | **FAIL** — see #580 (fixed this slice)                                                               |
| `bun run build` (with all pre/post validators) | PASS                                                                                                 |
| Full suite                                     | see final validation report; 5 storage-rejection failures are pre-existing Node-26-local only (#578) |

The one red baseline gate (`test:security-static`) and the reason it was
invisible (its workflow never runs, #581) are the engineering-baseline story
of this sprint. Both root causes are fixed in this slice; the workflow sweep
for the other 23 dormant workflows is deferred (#581 stays open).

## 3. Findings by area

Severity model per the sprint contract (P0 stop-ship / P1 release blocker /
P2 cleanup / P3 polish). Every item below is VERIFIED with file:line evidence
unless marked otherwise. Issue numbers are the live board entries.

### 3.1 Routes and navigation (Phase 3)

- **134 routes**, all mounted in `src/App.tsx`; machine-readable inventory:
  `src/lib/appRouteManifest.ts` (canonical, drift-guarded by
  `src/test/route-manifest-sync.test.ts`); audit-time snapshot:
  `artifacts/cleanup/route-inventory.json` (39 public / 42 auth / 29 operator /
  6 internal / 18 redirects).
- **Zero dead internal links** across 293 extracted targets (including slug
  validation for guides/cultivars). Zero redirect loops; all alias redirects
  terminate at real pages.
- Guard topology verified: `AppShell` → `buildSignedOutRedirect` allowlist →
  `/welcome?redirectTo` → re-validated twice downstream; no bypass found.
- P1 **#585**: `/pheno-hunts/:id/keepers` (paid write surface) unreachable
  from any UI navigation.
- P2 **#591**: `robots.txt` `Disallow: /sensors` also blocks the public
  acquisition page `/sensors/csv-preview`.
- Deliberate-but-notable: `/pheno-hunts/:id/{compare,showcase}` are public
  routes whose access control rests entirely on RLS; a future RLS regression
  there becomes a leak rather than a 403 (documented, monitored via #589's
  table-coverage gap item).
- P3 items (NotFound outside shell, `/health` orphan, manifest comment drift,
  `/customer/*` dead module, vestigial `access: "internal"` doc): **#593**.

### 3.2 Public / auth / demo safety (Phase 4)

- **No P0.** No demo path can write (repo-wide grep over demo libs/pages:
  zero `.insert/.update/.delete/.upsert/.rpc/functions.invoke`); no public
  route reads private tables anonymously; fixture IDs are namespaced
  non-UUIDs; demo fixtures are `Date.now()`-free.
- Auth flow verified sound: no private-data flash (synchronous identity fence
  - provider remount), sanitized error surfacing, allowlisted deep-link
    return, effect-based expiry redirect.
- P1 **#582** (fixed this slice): unhandled `getSession()` rejection hung `/`
  and every AppShell route on a permanent spinner.
- P2 **#588**: swallowed sign-out failures; AppShell mounts children before
  `getUser()` revalidation settles.
- P2 **#589**: single-file static-safety scans; `OperatorDemoPreview`'s
  no-Supabase invariant bypassed one import away; plus enumerated demo/e2e
  coverage gaps.

### 3.3 One-Tent Loop, Quick Log, Timeline (Phases 5-6)

- Step→file map and coverage map recorded in the audit transcript; the write
  path is RPC-first with static trust-boundary suites over migration SQL and
  a runtime harness that needs a local Supabase lane.
- P1 **#583** (fixed this slice): legacy Quick Log Environment Check readings
  never reached `environment_events` (RPC sensor params hard-coded null); V2
  passed them through — same data saved differently by surface. The fix
  restores v2 payload parity and structured persistence. **Correction
  (post-review, credit: Codex on PR #594):** alert evaluation reads
  `sensor_readings` then diary `details.sensor_snapshot`, and no production
  code SELECTs `environment_events` at all — so env checks from _either_
  Quick Log variant still cannot produce environment alerts. That gap is
  registered separately (#596) and needs a product decision, since manual
  _sensor snapshots_ do feed alerts today.
- P2 **#587**: Timeline date-range filter uses UTC day boundaries against
  locally-rendered dates (off-by-one-day both directions for non-UTC growers).
- Verified clean: timeline merge ordering is deterministic with a complete
  tie-breaker chain and logical dedup; V2 idempotency key lifecycle correct;
  legacy path rotates keys only for edited retries.
- Doc/code contradictions (RC smoke doc names an unreachable module as THE
  Quick Log; golden-path "definition of green" demands `raw_payload` the
  redaction rule deliberately strips): **#593**.
- `scripts/run-one-tent-loop-smoke-test-audit.mjs` covers 24 suites but zero
  Quick Log write-path, Timeline, or AI Doctor suites — coverage naming gap
  worth closing in a later slice (#593 note).

### 3.4 Sensor truth (Phase 7)

- P1 **#584**: "live" means four different things across surfaces; the
  grower-visible testbench panel renders "Live connected sensor" for raw
  vendor-string sources ≤15 min old while the trust badge calls the same row
  invalid, and `sensorBridgeHealthViewModel` skips its downgrade chain on
  that indicator. Deliberate-but-conflicting contracts → product decision
  needed; deferred with a written fix proposal rather than a unilateral
  behavior change (per the sprint contract's contradiction rule).
- P2 **#592**: duplicated rule tables with divergent values (7 stale windows
  vs the spec's 15 min; EC mismatch threshold 20 vs 50 mS/cm; 3 realism
  bands; 6 source-vocabulary unions + a private shadow normalizer; the
  strict truth filter has exactly one non-test consumer).
- Verified clean (affirmative evidence): VPD is never fabricated, never
  rendered 0-for-missing; no metric renders zero-for-missing anywhere;
  alert persistence refuses demo and non-live/non-manual sources; demo
  never renders as live on grower dashboards.

### 3.5 AI Doctor (Phase 8)

- Safety contract clauses verified honored in `aiDoctorSafetyRules.ts`:
  honest missing-context reasons, ≤0.39 confidence cap for single-signal,
  ≤0.5 cap with stale/invalid data (cannot reach the 0.7 "high" band),
  device-command stripping, forced `{action_type: "advisory",
status: "pending_approval"}` suggestion rewrite, feed/taper gating on
  root-zone evidence. The recursive output safety scanner runs against real
  golden-case engine output.
- Four incompatible result shapes exist (documented in the audit transcript;
  per contract, NOT merged this slice). The review-path suggestion shape
  carries no approval marker but **fails closed** (eligibility requires
  `approvalRequired === true`, which is undefined on that shape).
- Contract-doc drift (8- vs 12-field mandates; EC threshold; manual stale
  window) folded into #592/#593.

### 3.6 Alerts / Action Queue (Phase 9)

- Verified honored: user-initiated handoff only; every creation path defaults
  to `pending_approval`; 17-pattern device-command denylist **rejects** rather
  than sanitizes; transitions run through an atomic RPC with optimistic
  concurrency; simulate is explicitly non-executing; no client-supplied
  `user_id`.
- P2 **#586**: creation-time audit trail is best-effort (row can exist with
  no `created` event) and dedupe is client-side only (no UNIQUE constraint;
  read-then-write race). Durable fix needs a migration → BLOCKED for this
  slice by the no-schema-changes rule; minimal migration proposal written in
  the issue.

### 3.7 Supabase / data access / static safety (Phase 10)

- **No P0, no P1.** Committed publishable key verified `role: anon` by JWT
  decode; no secret-shaped literal in application code; token literals found
  are redaction _allowlists_ (the code strips them from exports); the 13
  frontend-invoked Edge Functions were each checked — no write-capable
  function is reachable from a demo/public path; upserts carry correct
  conflict targets; realtime/auth subscriptions clean up; storage failures
  produce typed errors and orphan cleanup (one path even models the
  ambiguous-outcome case).
- The ~40-file static-safety test culture is the reason most categories are
  clean; noted as a control to preserve.
- P3 hardening (tracked in #593): `.env` git-tracked; `has_role` boolean role
  oracle; dead `upsertProfileRow`.

### 3.8 Code hygiene (Phase 12)

Exact counts (app code = `src/` excluding tests): `@ts-ignore` 0 ·
`@ts-expect-error` 0 · `eslint-disable` 60 (33 `react-hooks/exhaustive-deps`)
· stray `console.log` 0 · TODO/FIXME 0 · comment-only catch blocks 143
(typed-Result converters; observability cost, not correctness). Headline item:
app tsconfig strictness off (**#590**). Dead-code clusters in **#593**.

## 4. What this slice changed (Phase 13)

Smallest coherent set: restore the red baseline gate, un-silence the workflow
that guards it, and fix the two P1s inside the first-time-user loop.

1. **#580** — secret-scan green: computed-key fixtures in
   `src/lib/rlsAuditRules.test.ts` / `src/lib/schemaAuditRules.test.ts`;
   `SERVICE_ROLE_GRANT_KEY` constant threaded through `rlsAuditRules.ts` and
   `OperatorSchemaAudit.tsx` so minification cannot reintroduce the bare
   identifier into the published bundle. Verified with and without `dist/`.
2. **#581 (partial)** — `security-regression.yml` retargeted to
   `[main, verdant-grow-diary]` after proving all eight steps pass locally.
3. **#582** — `AuthProvider` initial-session rejection resolves to signed-out
   and always clears `loading`; regression suite
   `src/test/auth-provider-initial-session-failure.test.tsx`.
4. **#583** — legacy Quick Log lifts Environment Check air metrics into the
   RPC's first-class sensor params (environment saves only); regression tests
   in `src/test/environment-check-entry-type-audit.test.ts`; stale header
   comment corrected.

Explicitly NOT done, by design: sensor vocabulary changes (#584), schema/RLS
work (#586), the 23-workflow sweep (#581), strictness flip (#590) — each has
a written next-slice path.

## 5. Blocked items

- **#561 (P1)** — Supabase MCP + PR previews point at the sandbox project.
  Re-verified 2026-07-30: `get_project_url` still returns the sandbox ref.
  Repo is clean; both fixes are owner actions (re-scope the MCP connector;
  move/rename the sandbox project's GitHub integration). BLOCKED.
- **#586 (P2)** — durable Action Queue idempotency/audit atomicity needs a
  migration; out of scope by contract. BLOCKED (proposal written).
- e2e golden-path UI spec requires managed-session credentials; it emits a
  deterministic BLOCKED receipt without them (documented existing behavior).

## 6. Slice 2 (same day) — dormant-CI sweep (#581)

Premise correction first: only 11 workflows (not 24) never ran — 13 of the
originally-listed set have unfiltered `pull_request:` triggers and run on
every PR; their dead `push:[main]` lane is a documented follow-up, not part
of this sweep. Dispositions applied for the true dead set: **5 retargeted**
(ai-doctor-golden-cases, ai-doctor-readiness-ui,
contextual-pheno-comparison-v0, stabilization-pr-scope — opt-in via its
label gate — and docs-safety, which turned out to be load-bearing for the
client-secret-boundary proof tooling and must not be deleted), **4 kept
dormant** with `# dormant:` headers and guard-test registration
(datadog-synthetics, gamification-staging-smoke — whose payload steps have
a broken env-scope gate and have never executed — pheno-disabled-compare-e2e,
release-receipt-ci), **1 deleted** (supabase-security-baseline; byte-identical
command runs in security-regression.yml; `docs/ci-security-baseline.md`
updated). Regression guard for the class:
`src/test/workflow-branch-filter-liveness.test.ts` (fail-closed parser;
dormancy requires an in-test reason and an in-file comment). Full
per-workflow table: #581.

## 7. Slice 3 (same day) — sensor-truth slice (#584, #592, #596)

Product decisions made by Matt in-session: transport language wins over
"live"; consolidation preserves per-surface values; environment checks DO
feed alert evaluation.

- **#584** — the testbench indicator's `"live"` state renamed to
  `"receiving"`; grower-visible badge now reads "Receiving data — unverified
  source" (sky, not emerald); `sensorBridgeHealthViewModel` keeps the healthy
  claim only for a verified `live` source and downgrades any other fresh
  vendor-string transport to `needs_review` (regression test added — the old
  behavior skipped every downgrade). Residual for a later slice: the
  four-table "what counts as live" consolidation (#592's family).
- **#592 (partial)** — all 19 stale/freshness windows re-homed to
  `src/constants/sensorTiming.ts` with per-surface names and UNCHANGED
  values; the 15-vs-30-minute divergence from the spec is now explicit and
  documented in one place. Value unification stays open in #592.
- **#596** — `snapshotFromEnvironmentCheck` maps the three air metrics
  (only) from the env-check envelope to a `manual`-sourced snapshot
  timestamped from `entry_at`; `useLatestSensorSnapshot` consults it after
  `sensor_snapshot` within each diary row. The diary fence is untouched —
  `snapshotFromDiary` blobs remain `"diary"` and non-persistable (proof
  suite: `environment-check-alert-evidence.test.ts`). Water temperature and
  EC are deliberately NOT mapped onto soil fields.
- Edge-shared mirror re-synced (91 → 92 files; `sensorTiming` pulled in).
