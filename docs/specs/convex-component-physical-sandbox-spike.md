# Spec — Isolated Convex component physical-sandbox spike

**Author:** Claude (Knowledge Library and Product Specification Architect)
**Date:** 2026-08-13
**Audited ref:** deploy branch `verdant-grow-diary` tip `6434ea2a83503bbe161624f2c6770f8a5eaa6aac`
**Slice name:** `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE`
**Capability gap:** `GAP-CONVEX-001`
**Status:** DECIDED — Cheek approved this named, isolated spike in-session on
2026-08-13 (to Claude, after Grok's HOLD on unapproved Convex expansion). This
document is the architecture contract. It is **not** production adoption.

Every claim below is labeled per the Sentinel evidence discipline:
`established fact`, `source claim`, `practical observation`, `inference`,
`uncertainty`, `missing evidence`. Status words (`PASS`, `FAIL`, `BLOCKED`,
`SKIPPED`, `NOT_MEASURED`, `NOT_APPLICABLE`) are used literally.

---

## 1. Executive recommendation

Commission **one disposable Convex app** under `spikes/convex-component-sandbox/`
whose only job is to prove `GAP-CONVEX-001`: a Convex component cannot read or
write parent-app tables unless the parent passes data in as arguments.

Do **not** install Convex in the Verdant SPA, do **not** add `convex` to the
root `package.json`, do **not** put a `convex/` tree at the repository root, and
do **not** wire Convex to diary, sensors, entitlements, AI credits, Action
Queue, or device control.

If Phase 1 proof tests `PASS`, the spike has earned a Council/Cheek decision on
whether that isolation property is worth a second runtime. Until that later
decision, production source of truth remains hosted Supabase.

**Verdict for this slice:** implement the isolated spike after this spec merges.
**Verdict for production Convex:** `HOLD`.

---

## 2. Approval record

| Item | Value |
| --- | --- |
| Approver | Cheek |
| Date | 2026-08-13 (in-session) |
| What was approved | A **named, isolated** spike plus this specification of a **documented capability gap** |
| What was not approved | Replacing Supabase; billing/AI/sensor/Action Queue migration; `npx convex deploy` to a production Convex project; adding Convex to grower-facing routes |
| Prior agent finding | Grok HOLD (same session): Convex is absent from this repo and must not be added without owner authorization and a written gap. This spec is that authorization artifact. `established fact` of the prior turn; the HOLD remains correct for production expansion |

Grok stays the Search/Market lead and does not implement this spike. Claude
delivers this spec only. Codex implements Phase 1 after merge. Security reviews
the spike before any cloud Convex credential exists.

---

## 3. Audit of the actual stack

Audited this session against `6434ea2a8` on `verdant-grow-diary`. Do not infer
production behavior from `main`.

### 3.1 What ships today

| Surface | Evidence | Label |
| --- | --- | --- |
| App | Vite + React SPA; `package.json` name `vite_react_shadcn_ts`; scripts `vite dev` / `vite build` | `established fact` |
| Backend | Hosted Supabase. Public anon URL/key committed in `.env`. No local Supabase required to run the app (`AGENTS.md` Cursor Cloud notes) | `established fact` |
| Server work | 34 `supabase/functions/*/index.ts` entrypoints | `established fact` |
| Domain logic | `src/lib/*Rules.ts`, `*Advisor.ts`, `*ViewModel.ts`; edge copies synced via `scripts/sync-edge-shared.mjs` | `established fact` |
| Entitlements | `public.subscriptions` is the billing SoT (`AGENTS.md`; `supabase/functions/_shared/unionEntitlementLookup.ts` comment: "Canonical lane (2026-07-16): read only from public.subscriptions") | `established fact` |
| AI spend | `ai_credit_spend` / `ai_credit_refund` RPCs; `ai-doctor-review` and `ai-coach` call them with service-role clients | `established fact` |
| Sensor live UI | Supabase Realtime channel invalidation in `src/lib/sensor.ts` (`sensor-readings-latest:${tentId}`), fail-open on subscribe error | `established fact` |
| Convex | Zero `convex.config.ts`, zero `convex/` tree, zero `convex` / `@convex-dev/*` in root `package.json`, repo-wide name search empty | `established fact` |

Open-PR collision check this session (`gh pr list --state open`): no open PR
titles or head refs mention Convex. Nearby backend PRs (#936 credits CTA, #828
Action Queue chip, #790 Grow Walk plugin) are different surfaces. `established fact`

### 3.2 Isolation as implemented (convention, not physics)

**RLS fences the `authenticated` / `anon` roles.** Several paid preflight
functions deliberately avoid service role and rely on JWT + RLS
(`premium-export-entitlement/index.ts` header: "this function does NOT use
service_role"; same pattern on `live-sensor-entitlement`). `established fact`

**`service_role` bypasses RLS and is shared.** Migrations under
`supabase/migrations/` contain **zero** `CREATE ROLE` statements (search this
session). New tables routinely `GRANT ALL … TO service_role`. Seed SQL grants
`USAGE` on `public` to `anon, authenticated, service_role`. `established fact`

Edge functions that read `SUPABASE_SERVICE_ROLE_KEY` from the environment in
their `index.ts` (enumerated this session; not claimed complete for helpers
that wrap `readEnv`):

1. `ai-coach`
2. `ai-doctor-review`
3. `auth-email-hook`
4. `checkout-status`
5. `delete-account`
6. `ecowitt-ingest`
7. `edge-metrics-alert-check`
8. `founder-slots-remaining`
9. `handle-email-suppression`
10. `handle-email-unsubscribe`
11. `operator-credits-audit`
12. `operator-ggs-real-payload-commit`
13. `paddle-portal-session`
14. `paddle-webhook`
15. `payments-webhook`
16. `pi-ingest-readings` (via `readEnv("SUPABASE_SERVICE_ROLE_KEY")` in `buildDefaultLookupClient`)
17. `process-email-queue`
18. `redeem-referral`
19. `rls-selftest`
20. `save-founder-prefs`
21. `send-transactional-email`
22. `sensor-ingest-webhook`

`established fact` for the list above. `uncertainty`: other files under
`supabase/functions/_shared/` may construct service-role clients; this spec
does not claim an exhaustive helper census.

Any of those functions **can** `.from("diary_entries")` or
`.from("subscriptions")` if a future edit does so. Prevention is review,
static scans, and tests — not a runtime refusal. `inference` from Postgres
service-role semantics plus the missing per-function roles.

### 3.3 Evidence that convention isolation already drifts

| Signal | Evidence | Label |
| --- | --- | --- |
| Two billing tables | Constitution: `profiles.tier` is XP only; `public.billing_subscriptions` must never grant entitlement; `public.subscriptions` is SoT | `established fact` (`AGENTS.md`) |
| Stale function comment | `premium-export-entitlement/index.ts` still says it reads `public.billing_subscriptions`; the shared lookup it imports documents the canonical lane as `public.subscriptions` only | `established fact` |
| Static tests as fence | Multiple `src/test/*billing_subscriptions*` and `*ai-credit*` SQL scans exist specifically to stop the wrong table from becoming SoT again | `established fact` |
| Client spam guard | `src/pages/support/spamGuard.ts`: "Server-side rate limiting is not available; treat this as best-effort only." | `established fact` |
| PI ingest limiter | `src/lib/piIngestRateLimitRules.ts` is pure decision logic; "Caller is responsible for tracking timestamps and enforcing the decision." Durable shared state is not in that module | `established fact` |
| MCP RLS harness | `docs/agent-integrations-mcp-server-spec.md` records the runtime RLS lane as opt-in `SKIPPED` unless env/CI flags are set | `source claim` from that spec at its audited ref; not re-run this session |

These do **not** prove Convex is required. They prove Verdant already spends
engineering on *remembering* isolation because the platform will not refuse a
cross-domain `service_role` query. `inference`

---

## 4. Capability gap `GAP-CONVEX-001`

### 4.1 Statement

**Current Verdant server code that holds `service_role` shares one Postgres
blast radius. Isolation across diary, billing, credits, email, and ingest is
policy and review, not a sandbox.**

**Convex components make parent/sibling table access unrepresentable:**
component functions cannot read the parent app's tables, file storage, or
undeclared env vars. The parent cannot mutate component tables except through
the component API. IDs crossing the boundary become strings. Component "public"
functions are not client-callable; the parent must re-export them.
`source claim` from [Convex Components](https://docs.convex.dev/components)
and [Understanding components](https://docs.convex.dev/components/understanding)
(fetched 2026-08-13).

That property is the only reason this spike exists.

### 4.2 What this gap is not

Do **not** justify Convex with these. They already have Verdant answers, or
they are not unique to Convex:

| Claimed gap | Why it is `NOT_APPLICABLE` as a Convex justification |
| --- | --- |
| Live sensor UI without polling | Supabase Realtime already invalidates the latest-snapshot query (`src/lib/sensor.ts`) |
| Atomic AI credit spend | `ai_credit_spend` RPC already exists and is called from AI edge functions |
| Entitlement source of truth | `public.subscriptions` plus `src/lib/entitlements/*` |
| End-to-end TypeScript | Generated Supabase types + typed rules modules |
| Rate limiting in the abstract | Postgres tables + restricted roles, or Upstash, could hold counters. The spike uses rate-limit *as the demo subject* because the public support form currently has no server limiter — not because Convex is the only limiter |
| "Postgres cannot isolate" | False. `CREATE ROLE` + schema `GRANT`s (or a second database) can shrink blast radius. Verdant **does not do this today** (zero `CREATE ROLE` in migrations). A Postgres-roles spike would also address part of the operational gap. It is **out of this slice** unless Cheek names it separately |

### 4.3 Success definition for the gap

`GAP-CONVEX-001` is **demonstrated** (`PASS`) only when all of the following
are true on the spike:

1. A parent module inserts a synthetic `grower_notes` row containing a secret
   string that must never leave the parent.
2. An `abuse_guard` component stores only opaque rate-limit keys and counts.
3. A committed test (or `npx convex run` recipe documented in the spike README)
   shows the component **cannot** query `grower_notes`.
4. A committed test shows the parent **cannot** `db.patch` the component's
   counter table except via `components.abuse_guard.*`.
5. The parent **can** call `abuse_guard.check` with a hashed key and receive
   allow/deny.
6. No grower, sensor, billing, or Action Queue data is copied into Convex.

If (3) or (4) cannot be shown, the gap is `FAIL` as a reason to keep Convex,
and the spike should be deleted rather than "made to work" by weakening
isolation.

---

## 5. Spike architecture

### 5.1 Placement

```text
spikes/convex-component-sandbox/
  README.md                 # how to run; what this is not
  package.json              # private; convex + typescript only
  convex/
    convex.config.ts        # defineApp + abuse_guard component
    schema.ts               # parent synthetic grower_notes only
    notes.ts                # parent mutations/queries for grower_notes
    guardBridge.ts          # parent orchestration: hash key → component
    components/
      abuse_guard/
        convex.config.ts    # defineComponent("abuse_guard")
        schema.ts           # rate_limit_buckets table
        check.ts            # check / consume / snapshot
        isolationProbe.ts   # MUST NOT successfully read parent tables
  test/
    isolation.test.ts       # proof tests (vitest or convex-test)
    orchestration.test.ts
  .env.example              # CONVEX_AGENT_MODE=anonymous only; no secrets
```

**Why not `convex/` at repo root:** the spike must be obviously disposable and
must not be importable by Vite, TanStack routes, or edge functions by default.
`inference` from "isolated spike" approval.

**Why a local component, not `@convex-dev/ratelimiter` first:** the official
rate limiter would prove "we can install npm." It would not prove *our* parent
table is unreachable. Phase 1 authors `abuse_guard`. Optionally comparing
behavior to `@convex-dev/ratelimiter` is Phase 1.5 and must not replace the
isolation proofs. `inference`

### 5.2 Data model (spike only)

**Parent `grower_notes`**

| Field | Type | Rules |
| --- | --- | --- |
| `body` | string | Synthetic. Fixture value `PARENT_SECRET_MUST_NOT_LEAK` |
| `createdAt` | number | Injectable in tests; no `Date.now()` inside queries ([Convex query rule](https://docs.convex.dev/understanding/best-practices/) — `source claim`) |

No `userId` column typed as a Verdant UUID. If a subject key is needed, store
an opaque string `subjectKey` generated in the parent.

**Component `rate_limit_buckets`**

| Field | Type | Rules |
| --- | --- | --- |
| `keyHash` | string | SHA-256 (or Convex-available equivalent) of caller-provided key. Never raw email, grow UUID, or JWT |
| `windowStartMs` | number | Injected `now` from the parent call args — component queries must not call `Date.now()` |
| `count` | number | Integer ≥ 0 |
| Index | `by_key_and_window` on `["keyHash", "windowStartMs"]` | Required; no `.filter()` table scans |

### 5.3 Public component API (only these)

All args/returns validated. Exhaustive handling of the result union.

```text
check(args: { keyHash: string, nowMs: number, windowMs: number, max: number })
  → { status: "allow", remaining: number }
    | { status: "deny", remaining: 0, retryAfterMs: number }

consume(args: same as check)
  → same union; increments count on allow inside the component transaction

snapshot(args: { keyHash: string, nowMs: number, windowMs: number })
  → { count: number }   # no other fields
```

Internal helpers stay unexported. No `ctx.scheduler` calling a public `api.*`
function (Convex scheduler rule: internal only). Phase 1 should not need a
scheduler at all.

### 5.4 Parent orchestration

`guardBridge.consumeForSubject({ subjectKey, nowMs })`:

1. Validate `subjectKey` non-empty string.
2. Hash with a spike-local pepper from the **parent** env, not the component
   env (component env is an allowlist; do not pass the pepper into the
   component — pass only `keyHash`). `source claim` from Convex component env
   isolation docs.
3. `ctx.runMutation(components.abuse_guard.check.consume, { keyHash, nowMs, windowMs: 60_000, max: 5 })`.
4. Never pass `body` from `grower_notes` into the component.

### 5.5 Communication rules (copy from Convex; bind to this spike)

| Direction | Allowed? |
| --- | --- |
| Parent → component via `components.abuse_guard.*` | Yes |
| Parent → component with hashed key + numbers only | Yes |
| Component → parent tables | No — proof test |
| Component → sibling (none in Phase 1) | No |
| Client browser → component functions | No — do not re-export to HTTP |
| Spike → `src/`, `supabase/`, production `.env` | No |

`source claim` for the platform rules: Convex authoring/understanding docs
fetched 2026-08-13. Spike binding is this spec.

---

## 6. Codex file-level plan (Phase 1)

Do this in one small PR after this spec merges. Do not combine with SEO,
Quick Log, or credits UI work.

1. Add `spikes/convex-component-sandbox/` as specified in §5.1.
2. Root `package.json`: **no** `convex` dependency. Optional npm script
   `"test:spike:convex-sandbox": "npm test --prefix spikes/convex-component-sandbox"`
   is allowed if it does not install Convex into the app lockfile. Prefer a
   nested lockfile inside the spike directory.
3. Add a **root** static fence test, e.g.
   `src/test/convex-production-isolation-fence.test.ts`, that fails if
   `src/`, `supabase/functions/`, or production `scripts/` (exclude
   `spikes/` and this spec path) contain `from "convex"` / `@convex-dev/`.
4. Spike README: `CONVEX_AGENT_MODE=anonymous`; `npx convex dev` only; never
   `npx convex deploy` unless Cheek later approves a disposable cloud project.
5. `.gitignore` inside the spike: `.env.local`, Convex admin keys, `.convex/`.
   Do not gitignore the spike source.
6. No changes under `supabase/migrations/`.
7. No changes to grower-facing pages or edge functions.
8. Do not edit the twelve versioned governance files. `CURRENT_STATE.md` may
   record Phase 1 completion in a follow-up.

If Convex CLI cannot run in CI without credentials, document the blocker as
`BLOCKED` and keep the static fence + unit tests that do not need a cloud
deployment. Do not fake a `PASS` on isolation that was not executed.

---

## 7. Proof tests (acceptance)

Codex must add tests that cover happy path, edges, nulls, determinism, and
the isolation regression. Suggested names; keep them in the spike or as
documented `npx convex run` recipes if the official `convex-test` harness
cannot express a cross-component denial.

| ID | Assertion |
| --- | --- |
| P1 | `consume` five times with the same hash in one window → five `allow`, sixth `deny` |
| P2 | `nowMs` at window boundary starts a new count (explicit `nowMs`, not wall clock) |
| P3 | Empty `keyHash`, `max < 1`, `windowMs < 1` → validated error; no table write |
| P4 | Same args twice → same allow/deny (deterministic) |
| P5 | Component module that attempts `ctx.db.query("grower_notes")` fails compile and/or runtime. If Convex simply has no such table in the component schema, that failure **is** the proof — commit the failing probe behind a test that expects the error. Do not "fix" the probe so it succeeds |
| P6 | Parent code that attempts to import component `dataModel` `Id<"rate_limit_buckets">` and patch it as a parent table fails typecheck |
| P7 | `grower_notes.body` never appears in component function args/returns (static scan of `spikes/convex-component-sandbox/convex/components/`) |
| P8 | Fixture secret string `PARENT_SECRET_MUST_NOT_LEAK` does not appear under `components/abuse_guard/` |
| P9 | Repeat P1 in a second process / test worker → same numeric remaining (no hidden randomness) |

Report exact pass/fail counts. A skipped Convex cloud deploy is `SKIPPED` with
reason, not a pass.

---

## 8. Safety fences (non-negotiable)

The spike must not:

- Read or write production Supabase (`knkwiiywfkbqznbxwqfh` or sandbox
  `bzatgtgjvuojpoxcknaa`)
- Store live, manual, csv, demo, stale, or invalid sensor readings
- Call AI Doctor / AI Coach / any model
- Create Action Queue rows or device commands
- Read `public.subscriptions`, `billing_subscriptions`, `profiles.tier`, or
  AI credit ledgers
- Import grower PII (emails, photos, diary text) as rate-limit keys
- Ship `CONVEX_DEPLOY_KEY`, Convex admin keys, or service-role keys in the
  spike
- Re-export component functions to the browser
- Treat synthetic `grower_notes` as a real diary. README must say **synthetic
  fixture, not plant memory**
- Recommend nutrient/irrigation/equipment changes (not an AI surface)

If a dependency CVE is introduced inside the spike, it stays in the spike
lockfile and is not merged into the app lockfile.

---

## 9. Promotion gates

Use these literals. Do not convert an unrun check into `PASS`.

| Gate | Default | What would change it |
| --- | --- | --- |
| Phase 1 isolated spike in `spikes/` | Approved by this spec after merge | Codex implements |
| Import Convex from `src/` or `supabase/functions/` | `REJECT` | Separate Cheek approval + Security review |
| `npx convex deploy` (any cloud) | `REJECT` until Cheek names a disposable project and Security reviews egress | Then still not production |
| Wire abuse_guard to `/support` forms | `REJECT` | New slice; would also need a server path that is not this spike |
| Move AI credits onto Convex | `REJECT` | Constitution: server-side Postgres ledger remains SoT |
| Move Action Queue onto Convex | `REJECT` | Approval-required queue stays on current RPC |
| Move sensor snapshots onto Convex | `REJECT` | Sensor truth rules and source labels stay on Supabase |
| Replace Supabase Auth | `REJECT` | Out of product priority |
| Device control via Convex scheduler | `REJECT` | Hard safety rule |

Council Chair may recommend after Phase 1 evidence exists. Only Cheek
approves promotion.

---

## 10. Validation (this spec PR)

| Check | Status | Notes |
| --- | --- | --- |
| Application typecheck / unit tests | `NOT_APPLICABLE` | Docs only |
| Convex CLI | `NOT_MEASURED` | No spike code in this PR |
| Production Convex | `NOT_APPLICABLE` | Forbidden |
| Open-PR collision | `PASS` | No Convex PRs open as of 2026-08-13 list |
| Capability gap evidence | `PASS` | §3–§4 enumerated from `6434ea2a8` |

---

## 11. Unknowns and blockers

| Item | Status | Owner |
| --- | --- | --- |
| Whether Convex CLI + `convex-test` can express P5/P6 without a cloud deployment in this VM | `unknown` | Codex, Phase 1 |
| Whether Cursor Cloud egress allows `convex.dev` | `BLOCKED` until Codex tries; do not assume | Codex |
| Whether a disposable Convex project will be created | `REJECT` until Cheek says so | Cheek |
| Postgres restricted-role alternative | Specified as out of slice; not measured | Unassigned |
| Live production service_role blast radius (whether any current function actually cross-reads diaries) | `NOT_MEASURED` | Not required to justify the *capability* gap; do not hunt production data |

---

## 12. Handoff

```text
HANDOFF
from_agent: Claude
to_agent: Codex
sentinel_version: 2026-08-09.1
date: 2026-08-13

completed:
  - Named slice CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE
  - Documented GAP-CONVEX-001 against deploy-branch audit 6434ea2a8
  - Isolated spike architecture, API, proof tests, REJECT promotion list
  - Cheek in-session approval recorded

verified_by:
  - git rev-parse on verdant-grow-diary: 6434ea2a83503bbe161624f2c6770f8a5eaa6aac
  - Glob/search: no convex.config.ts, no convex dependency
  - Enumerated service_role env reads in supabase/functions/*/index.ts
  - CREATE ROLE search empty under supabase/migrations/
  - gh pr list --state open: no Convex collision
  - Convex component isolation: docs.convex.dev/components and /understanding fetched 2026-08-13

not_done:
  - No Convex runtime, lockfile, or spike folder in this spec PR
  - No production wiring
  - No Postgres-roles alternative spike
  - No Security review (nothing to review yet)

unknowns:
  - CI/cloud Convex availability (see §11)
  - Exact convex-test API for cross-schema denial

blocked:
  - Production Convex deploy: Cheek + Security, not this handoff

assumptions:
  - In-session "Cheek explicitly approves" is owner authorization for this
    named isolated spike. If that message was not Cheek, this spec is void.
  - Convex docs fetched 2026-08-13 still describe physical table sandboxing.
    If a later Convex release weakens that, P5/P6 fail and the spike dies.

next_slice:
  - Codex: Phase 1 implementation exactly as §5–§8, on a new branch, after
    this spec merges. Do not start if an overlapping Convex PR appears.

files_touched:
  - docs/specs/convex-component-physical-sandbox-spike.md
  - docs/agents/CURRENT_STATE.md
```

---

## 13. Verdict

```text
PROCEED — EVIDENCE SUPPORTS ARCHITECTURE WORK
```

Proceed **only** on the isolated spike. Production Convex remains `HOLD`.
