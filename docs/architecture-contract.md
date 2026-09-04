# Verdant — Current Architecture Contract

**Scope:** the permanent architectural invariants of the Verdant Grow OS application.
**Verified from source at:** `dd54f23cfa59eb001d07c94b0c5415c164542f44` (deploy branch
`verdant-grow-diary`), 2026-09-04, by Claude.
**Carries no `Sentinel-Version`.** This is not one of the twelve governance files; editing it does
not require a parity bump. See §15 for how it is amended.

The stamped SHA above is **verification provenance, not an operating claim**. It records the tree
each clause was read against so a reviewer can reproduce every citation. It says nothing about what
is deployed, applied, or live — those axes belong to `docs/agents/CURRENT_STATE.md` and are
deliberately absent here.

---

## 0. What this document is

A contract states what must remain true and why, so that a change which would break it is
recognisable as a breaking change rather than as ordinary refactoring. It is not an inventory, not
a status report, and not a roadmap.

### 0.1 Boundary against documents it must not duplicate

Verdant already carries four documents adjacent to this one. This contract **cites** them and does
not restate their contents.

| Document                                                    | Owns                                                                            | This contract's relationship                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                 | Universal product, safety, and process rules for every agent                    | Downstream. Where a clause here restates an `AGENTS.md` rule, it does so to bind it to a **source path**   |
| `docs/agents/CURRENT_STATE.md`                              | Operating state — branch, production, applied migrations, blockers, assignments | **Strictly disjoint.** Nothing that changes daily belongs here; nothing permanent belongs there            |
| `docs/codebase-map.md`                                      | Exhaustive inventories — full route table, all edge functions, all workflows    | Complementary. The map answers "what exists"; this answers "what may not change"                           |
| `docs/audits/architecture-audit-adjudication-2026-08-21.md` | Adjudicated verdicts on a prior external architecture audit                     | **Prior art, reused.** Its §4.1 rows are not re-litigated here; §10 and AC-4.2 cite its reasoning directly |

### 0.2 How to read a clause

Every clause carries a statement, the source it was verified against, and the mechanism that keeps
it true. A clause whose **Enforcement** reads `convention only` is an invariant nothing currently
prevents you from breaking — those are the ones worth adding a gate for, and they are marked so
honestly rather than dressed up as enforced.

Evidence labels follow `AGENTS.md`: `established fact` is direct source evidence; `inference` is
reasoning over it; `source claim` is carried from another document and not re-measured here.

---

## 1. Runtime and rendering

**AC-1.1 — Verdant is a server-rendered TanStack Start application, not a SPA.**
The SSR entry `src/server.ts` wraps `@tanstack/react-start/server-entry`; `src/start.ts` calls
`createStart`; `src/router.tsx` calls `createRouter` over the generated route tree. Any document or
comment describing Verdant as a "React + Vite SPA" is stale wording, not a description of the code.
_Source:_ `src/server.ts`, `src/start.ts`, `src/router.tsx`. `established fact`.
_Enforcement:_ build and typecheck — the app does not start without these entries.

**AC-1.2 — Routing is file-based and its compiled artifact is generated, never authored.**
Routes live under `src/routes/` and compile into `src/routeTree.gen.ts`. That file, together with
`src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts` and
`supabase/functions/_shared/lib`, is machine-produced. Hand-editing any of them produces a diff that
the next generation silently reverts.
_Source:_ `src/routeTree.gen.ts` header; `vite.config.ts` MCP note. `established fact`.
_Enforcement:_ regeneration overwrite; `TREE_HASH_ROOTS` participation for the MCP bundle.

**AC-1.3 — Route access policy is data, and route gating is presentation-only.**
`src/lib/appRouteManifest.ts` is the single source of truth for route access, as pure data with an
`access` field over `public | auth | operator | internal | redirect`. A route guard is a
convenience for the grower, never an authorization control — **RLS is the boundary** (see AC-2.2).
Adding a route without a manifest entry is drift.
_Source:_ `src/lib/appRouteManifest.ts:52,70-88`. `established fact`.
_Enforcement:_ a test cross-checks the manifest against the mounted tree.

**AC-1.4 — `vite.config.ts` stays a thin wrapper over the Lovable preset.**
`@lovable.dev/vite-tanstack-config` already supplies TanStack devtools, `tanstackStart`,
`viteReact`, `tailwindcss`, `tsConfigPaths`, Nitro, `VITE_*` injection, the `@` alias and
React/TanStack dedupe. Re-adding any of them duplicates a plugin and breaks the app. The preset must
be imported from its explicit ESM path (`/dist/index.js`); the bare specifier resolves the CJS
`main`, whose `require("vite")` throws `ERR_REQUIRE_CYCLE_MODULE`.
_Source:_ `vite.config.ts:1-12`. `established fact`.
_Enforcement:_ `convention only` — the failure is a broken build, not a gate.

**AC-1.5 — Defining `src/start.ts` opts out of Start's automatic CSRF middleware, so it is
re-registered explicitly.**
`createCsrfMiddleware` filtered to `handlerType === "serverFn"` is present **because** the file
exists. Removing it does not restore the default; it removes CSRF protection from server functions
silently.
_Source:_ `src/start.ts:21-30`. `established fact`.
_Enforcement:_ `convention only`. This is the highest-value unguarded invariant in §1.

**AC-1.6 — SSR failures must not be served as h3's JSON 500.**
h3 swallows in-handler throws into a normal `500` carrying
`{"unhandled":true,"message":"HTTPError"}`, which no `try`/`catch` ever sees. `src/server.ts`
detects that body shape and substitutes a rendered error page. A refactor that trusts `try`/`catch`
alone reintroduces a JSON blob as the user-visible error.
_Source:_ `src/server.ts` — `normalizeCatastrophicSsrResponse`, `isH3SwallowedErrorBody`.
`established fact`.
_Enforcement:_ `convention only`.

**AC-1.7 — Provider order in `src/routes/__root.tsx` is load-bearing.**
`AnalyticsShell` and `FunnelEventDbSink` must precede `<Outlet/>` in JSX order. React fires sibling
mount effects in JSX order and `Outlet`'s content is a sibling, not a descendant — placing the sink
later loses mount-effect funnel events on cold loads. The reason is committed as a comment beside
the code.
_Source:_ `src/routes/__root.tsx:232-242`. `established fact`.
_Enforcement:_ `convention only`, plus the in-file comment.

---

## 2. Data, trust boundary, and Supabase

**AC-2.1 — Hosted Supabase is the data platform: Postgres, Auth, RLS, RPC, and Edge Functions.**
Client access is `@supabase/supabase-js` with `@supabase/ssr`; server logic that must not be
client-trusted lives in Deno edge functions under `supabase/functions/`.
_Source:_ `package.json` dependencies; `supabase/functions/` (34 functions plus `_shared`).
`established fact`.

**AC-2.2 — RLS is the authorization boundary. Nothing in the client is.**
Route guards (AC-1.3), UI gating, and client entitlement reads are presentation. Server-side checks
are authoritative for anything paid, costly, or privileged, and server code resolves identity from
`auth.uid()` or the verified JWT — never from a client-supplied `user_id`.
_Source:_ `AGENTS.md` Supabase/Data Safety; `supabase/functions/rls-selftest/`. `established fact`
for the rule, `source claim` for per-table policy state (owned by migrations, not by this file).

**AC-2.3 — Edge functions may not import from `src/lib`.**
Shared logic is mirrored into `supabase/functions/_shared`, and the mirror must stay in sync.
_Source:_ `supabase/functions/_shared/lib/`. `established fact`.
_Enforcement:_ **gated** — `scripts/check-no-src-lib-imports.mjs` and
`scripts/verify-edge-shared-in-sync.mjs` both run in `prebuild`, and the mirror has a required CI
check of its own.

**AC-2.4 — `src/integrations/supabase/client.ts` is generated but carries a deliberate hardening.**
It sets `storage: window.sessionStorage`, not `localStorage`. The file is header-marked
"generated, do not edit"; regenerating it drops the hardening, so the line must be re-applied by
hand afterwards.
_Source:_ `src/integrations/supabase/client.ts`. `established fact`.
_Enforcement:_ `convention only`.

---

## 3. Module layering

**AC-3.1 — Business logic lives in typed modules, not in JSX.**
The intended layering is constants → `*Rules.ts` (pure) → `*Service.ts` (I/O) → `*ViewModel.ts`
(presentation shaping) → components and pages as presenters, with hooks as the React data seam.
_Source:_ `AGENTS.md` Architecture Rules; `src/lib/`. `established fact`.

**AC-3.2 — `*Rules.ts` means pure and deterministic: no React, no Supabase, no fetch, no ambient
clock, no randomness. Time is injected.**
This is the contract for **new** code. It is not a description of every existing file: measured
drift is recorded in `docs/codebase-map.md` (`*Rules.ts` modules calling `Date.now()` or
`Math.random()` directly, and two importing Supabase). Those files are legacy, not precedent. Do not
cite them, and do not extend the pattern.
_Source:_ `AGENTS.md`; drift inventory in `docs/codebase-map.md`. `established fact` for the rule;
the drift counts are `source claim` carried from the map and not re-measured here.
_Enforcement:_ `convention only`.

**AC-3.3 — User-facing copy is data, not markup.**
Strings live in `src/constants/*Copy.ts` / `*Messages.ts` or as `as const` exports in rules modules,
so tests can pin exact wording.
_Source:_ `src/constants/`. `established fact`.

**AC-3.4 — Component code routes through the react-router compat shim, not TanStack Router
directly.**
`src/lib/react-router-compat.tsx` re-implements the react-router-dom v6 surface on TanStack Router.
Measured at the stamped SHA: **683** files import the shim, and **zero** files under
`src/components/` or `src/pages/` import `@tanstack/react-router`. Vitest aliases the shim to a real
MemoryRouter, so idiomatic TanStack hooks in a component look correct and fail in tests.
_Source:_ `src/lib/react-router-compat.tsx`; measured by import-statement grep at the stamped SHA.
`established fact`.
_Enforcement:_ `convention only`, plus the test-time alias.

---

## 4. Sensor truth

This section is where the contract does the most work, because the vocabulary it governs is
currently correct but not structurally protected.

**AC-4.1 — The canonical sensor source vocabulary is exactly six values.**

```text
live · manual · csv · demo · stale · invalid
```

These six are the canonical vocabulary: every source **read** by the application resolves to one of
them. Unknown or missing input resolves to `invalid`, never to `live` or any other healthy label,
and only `live` is healthy — `manual` and `csv` are trusted-as-entered but are not live data.

**One stored value sits outside this set** and is not an oversight: the first-party Pi ingest
function writes `pi_bridge`, which the read path normalizes to `live`. AC-4.4 states that exception
in full. Read AC-4.1 as the contract for the resolved vocabulary, and AC-4.4 as the one admitted
divergence in what is stored.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:16,86`;
`src/constants/sensorIngestProvenance.ts:15`. `established fact`.

**AC-4.2 — Trust state and provenance are separate axes, and provenance may never widen the
vocabulary.**
`source` answers "how should Verdant treat this reading". Vendor, transport, bridge, app, protocol
and device identity answer "how did it arrive", and belong in `raw_payload` or the provenance
registry — `SENSOR_PROVENANCE_TRANSPORTS`, `SENSOR_PROVENANCE_APPS`. Collapsing the two would let a
vendor name imply health.

`NON_CANONICAL_SOURCE_ALIASES` names eighteen tokens (`home_assistant`, `mqtt`, `pi_bridge`,
`eco_witt`, `unknown`, …) that generic ingest must not accept as a source.

**Scope, stated precisely, because it is narrower than the list implies.** The reject-list is
reachable only through `isNonCanonicalSourceAlias`, whose sole non-test consumer is
`src/lib/sensorIngestProvenanceRules.ts:111`. That is a pure module under `src/`, so the rule binds
the **generic ingest and client paths**. It does **not** bind the edge functions, which cannot
import from `src/lib` at all (AC-2.3) and do not carry a mirrored copy of this check. AC-4.4 records
the first-party path that writes one of these tokens directly.
_Source:_ `src/constants/sensorIngestProvenance.ts:1-13,26-70`;
`src/lib/sensorIngestProvenanceRules.ts:111`; consumer set established by grep at the stamped SHA.
Reasoning adjudicated in `docs/audits/architecture-audit-adjudication-2026-08-21.md` §5.
`established fact`.

**AC-4.3 — One canonical union. Every other module derives from it.**

This clause is **aspirational-with-a-known-gap**, stated plainly rather than asserted as current
truth. At the stamped SHA the vocabulary is declared **twice** independently —
`SENSOR_SOURCES` in `src/lib/sensor/sensorSourceRules.ts` and `CANONICAL_SENSOR_SOURCES` in
`src/constants/sensorIngestProvenance.ts` — and re-declared as inline union literals in roughly
ninety further places across `src/`. Two of those have already drifted:

| Module                          | Declared union                                           | Drift                           |
| ------------------------------- | -------------------------------------------------------- | ------------------------------- |
| `src/lib/ai/types.ts:15`        | `live \| manual \| demo \| stale \| invalid \| imported` | invents `imported`, drops `csv` |
| `src/lib/aiDoctorEngine.ts:151` | `live \| csv \| manual \| stale \| invalid`              | drops `demo`                    |

Neither drift is known to mislabel a reading today — both are type-level and narrowing or renaming
rather than promoting anything to `live` — but nothing structurally prevents the third divergence
from being the one that does.

**The contract:** new code imports `SensorSource` from `src/lib/sensor/sensorSourceRules.ts`. New
inline union literals over source names are not permitted. The two divergences above are grandfathered
and allowlisted so that the count can shrink but not grow.
_Source:_ measured by grep at the stamped SHA. `established fact` for the declarations and the two
drifts; `inference` for the risk assessment.
_Enforcement:_ **none today.** T3 in §11 is the proposed gate.

**AC-4.4 — `pi_bridge` is a stored non-canonical source that the read path promotes to `live`. It
is the one sanctioned transport-to-trust exception, and it spans write and read.**

The first-party Pi ingest edge function writes the token directly into the row:
`source: "pi_bridge"` at `supabase/functions/pi-ingest-readings/index.ts:454` and
`.../commitBatch.ts:130`, whose row type fixes `source: "pi_bridge"` at `commitBatch.ts:40`. So
`pi_bridge` reaches `sensor_readings.source` as a **stored value**, outside the six of AC-4.1 and
outside the reach of AC-4.2's reject-list (that list binds `src/` only — see its scope note). On
read, `sensorSourceRules.ALIAS` maps it to `live`, and `isHealthySensorSource` treats `live` as the
only healthy source. A transport name therefore reaches the healthy label across both layers, not
merely as a badge.

This is deliberate — the first-party bridge is trusted as live telemetry — and it is **not** recorded
here as a defect. It is recorded because it is the single place where the vendor-name-implies-health
collapse that AC-4.2 forbids is actually permitted, and a contract that left it implicit would let
the next such request cite it as precedent. **It is an exception, not a pattern. Adding a second
one, or extending this one to a third-party bridge, requires an approved slice.**

> An earlier draft of this clause claimed `pi_bridge` was "forbidden as a stored value while still
> normalizing on read". That was **wrong in the direction that matters** — it described the write
> path as prohibited when a first-party function performs it — and is corrected here rather than
> quietly reworded.

_Source:_ `supabase/functions/pi-ingest-readings/index.ts:454`,
`supabase/functions/pi-ingest-readings/commitBatch.ts:40,130`;
`src/lib/sensor/sensorSourceRules.ts:23-27,86`. `established fact`.

**AC-4.5 — The `TRUST_LIVE_ALIASES` pin is one-directional, and the comment beside it overstates
what it enforces.**
`sensorSourceRules.ts:46` says "Keep `TRUST_LIVE_ALIASES` and `ALIAS` live entries aligned", but the
loop below it can only **add** aliases missing from `ALIAS`. It cannot detect an `ALIAS` live-entry
absent from `TRUST_LIVE_ALIASES` — which is exactly the state `pi_bridge` is in
(`TRUST_LIVE_ALIASES = {live, sensor, realtime}`). The invariant as stated is stronger than the
invariant as enforced.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:46-51`; `src/lib/sensorLiveMembership.ts:79`.
`established fact`.
_Enforcement:_ one-directional only. Either enforce both directions or restate the comment; do not
leave the stronger claim standing.

**AC-4.6 — Bad or unknown telemetry is never presented as healthy.**
Demo, manual, CSV, stale and invalid readings keep their labels everywhere they surface, including
into AI Doctor context (AC-5.6). Suspicious telemetry — Celsius shown as Fahrenheit, EC unit
mismatch, humidity or soil moisture pinned at 0 or 100, out-of-range pH, old readings shown as
current — is flagged, not smoothed.
_Source:_ `AGENTS.md` Sensor Truth Rules; `supabase/functions/_shared/lib/constants/sensorTruthRanges.ts`.
`established fact`.
_Enforcement:_ **partially gated** — `scripts/sensor-safety-check.mjs` statically refuses fake-live
wording, `service_role` references, automation language, and unguarded "healthy" near degraded
tokens, across `src/lib/sensor` and `src/components/sensor`.

---

## 5. AI Doctor

**AC-5.1 — Inference is reached through the Lovable AI gateway.**
`https://ai.gateway.lovable.dev/v1/chat/completions`, credentialed by a server-side-only
`LOVABLE_API_KEY`. Three functions use it: `ai-doctor-review`, `ai-coach`, `ai-cultivar-qa`.
_Source:_ `supabase/functions/ai-doctor-review/index.ts`, `ai-coach/`, `ai-cultivar-qa/`.
`established fact`.

**AC-5.2 — Model and tier are server constants. The client cannot influence either.**
`MODEL` and `MODEL_TIER` are module-level constants, not request-derived; the client cannot set
model, tier, weight, plan, or `user_id`, and therefore cannot self-discount.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:13,66,69`. `established fact`.
_Enforcement:_ structural — there is no code path from the request body to either constant.

**AC-5.3 — Model output is structured and validated, never free text.**
The call forces a single tool (`tool_choice: {type: "function", function: {name:
"submit_ai_doctor_review"}}` against `TOOL_SCHEMA`), and the returned arguments are parsed and
schema-checked before use. Raw model text is never returned to the client, written to a row, or
logged; logs carry safe status and reason codes only.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:2,14,179-180,515-516,575,643-644`.
`established fact`.

**AC-5.4 — Credits are metered server-side before the model call, with idempotency, and refunded on
failure.**
`ai_credit_spend` is called with a UUID-validated `p_idempotency_key` before inference; a failed
call reverses through `ai_credit_refund` with its own key; a replayed key resolves to a calm
`idempotency_conflict` status rather than a crash or a double charge. Reversals are append-only.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:335-338,382-388,405-408,443,595`.
`established fact`.

**AC-5.5 — AI Doctor writes no operational rows and controls no devices.**
No `ai_doctor_sessions`, `alerts`, `action_queue` or `sensor_readings` writes; no equipment or
device control. It may _suggest_ an Action Queue item; it may not create one (AC-7.1).
_Source:_ `supabase/functions/ai-doctor-review/index.ts:8-9`. `established fact`.

**AC-5.6 — Sensor readings reaching model context keep their trust labels, and only `ok` readings
contribute current values.**
Grounding is reject-only: the backstop refuses ungrounded output rather than rewriting it.
_Source:_ `supabase/functions/_shared/lib/lib/aiDoctorCurrentSensorSnapshotRules.ts:116,194`;
`aiDoctorReviewGroundingRules.ts:10`. `established fact`.

**AC-5.7 — Output is cautious by construction and states what it does not know.**
The response contract includes confidence, evidence, missing information, what not to do, and a risk
level. A one-photo diagnosis is never presented as certain, and missing context is named rather than
guessed.
_Source:_ `AGENTS.md` AI Doctor Rules; `docs/ai-doctor-output-contract.md`,
`docs/ai-doctor-safety-contract.md`. `established fact`.

**AC-5.8 — Evidence receipts do not participate in authorization or pricing.**
The receipt records what the review was based on. Its HMAC is not used to authorize a call, price
it, or select a model.
_Source:_ `supabase/functions/_shared/lib/lib/aiDoctorReviewEvidenceReceiptRules.ts:265`;
`supabase/functions/ai-doctor-review/index.ts:166`. `established fact`.

---

## 6. Entitlements, billing, and credits

**AC-6.1 — `public.subscriptions` is the billing entitlement source of truth.**
`profiles.tier` is XP and gamification only and must never be read as billing.
`public.billing_subscriptions` is a legacy sandbox and operator-audit surface that must never grant
an entitlement. Absence of an entitling row resolves to Free.
_Source:_ `src/hooks/useMyEntitlements.ts:90` reads `.from("subscriptions")`; `AGENTS.md`
Monetization rules. `established fact`.

> **Naming hazard, recorded so it is not mistaken for a violation.** The row type is named
> `BillingSubscriptionRow` and its doc comment still refers to `public.billing_subscriptions`
> (`src/lib/entitlements/types.ts:17`), while the actual read is from `subscriptions`. The behaviour
> is correct; the name is misleading. Renaming is a `convention only` cleanup, not a contract
> change — but do not "fix" the read to match the type name.

**AC-6.2 — Capability logic lives in `src/lib/entitlements/*`, expressed as capabilities rather than
plan comparisons.**
Prefer `canUseCapability(entitlement, "advancedExports")` over `if (plan === "pro")`. Plan gates do
not belong in JSX.
_Source:_ `src/lib/entitlements/capabilities.ts`, `src/lib/entitlements/capabilityAccess.ts`,
`src/lib/entitlements/planCatalog.ts`.
`established fact`.

**AC-6.3 — `resolveEntitlements` is pure and takes `now` as a parameter.**
It has no React, no Supabase, no fetch, and no internal clock, so entitlement resolution is
deterministic and testable at any instant.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:1-16`. `established fact`.

**AC-6.4 — Client entitlement reads are presentation-only; the server is authoritative for cost and
security.**
The staff override lifts capabilities for presentation and is explicitly never authoritative: AI
credit spend stays capped and metered server-side regardless.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:7-15`. `established fact`.

**AC-6.5 — Founder Lifetime is Pro-like access with capped AI credits. It is never unlimited AI.**
_Source:_ `AGENTS.md` Monetization and AI Credit rules. `established fact`.

---

## 7. Action Queue

**AC-7.1 — The Action Queue is approval-required, and its default state says so.**
Rows default to `pending_approval`. AI and alerts may suggest; the grower decides. Verdant does not
execute device commands, and there is no device-control surface to add one to.
_Source:_ `src/lib/actionQueueCreateRules.ts:198`; `src/lib/actionQueueProvenanceRules.ts:175,187`.
`established fact`.

**AC-7.2 — No affordance may make approval accidental.**
Keyboard navigation never maps a key to Approve, Reject, Retry, Complete or Cancel; presentation
must not imply an action is already approved or executed.
_Source:_ `src/lib/actionQueueKeyboardNavigationRules.ts:8`;
`src/lib/actionQueueEvidenceViewModel.ts:53,62`. `established fact`.

**AC-7.3 — Action Queue items are not auto-created.**
Alerts and AI Doctor output do not write queue rows unless a task explicitly asks for it.
_Source:_ `AGENTS.md` Action Queue Rules; AC-5.5. `established fact`.

---

## 8. Toolchain and dependency management

**AC-8.1 — Bun is canonical; `package-lock.json` is a synchronized compatibility artifact.**
`bun.lock` is authoritative. The npm lockfile exists for compatibility and must stay in sync; it is
never the source of truth.
_Source:_ `scripts/check-bun-lockfile-policy.mjs:5,22,177-180`; `bunfig.toml`. `established fact`.
_Enforcement:_ **gated** — the lockfile policy checker requires both files and rejects a transition
config that does not keep Bun canonical.

**AC-8.2 — New dependency versions wait 24 hours.**
`bunfig.toml` sets `minimumReleaseAge = 86400` as a supply-chain guard. Each entry in
`minimumReleaseAgeExcludes` bypasses it for one package and must be confirmed with the owner before
being added.
_Source:_ `bunfig.toml`. `established fact`.

**AC-8.3 — TypeScript strictness is deliberately partial.**
`tsconfig.json` runs `strict: true` while keeping `noImplicitAny: false` and three further flags
off, with the reasons recorded in the file. Turning them on is a project, not a side quest.
_Source:_ `tsconfig.json`. `established fact`.

**AC-8.4 — `server-only` is banned.**
It is a Next.js idiom. Use `*.server.ts` or `@tanstack/react-start/server-only`.
_Source:_ ESLint configuration. `established fact`.
_Enforcement:_ **gated** — ESLint rule.

---

## 9. Migration history

**AC-9.1 — A merged migration is permanent history and is never edited.**
Not to correct it, not to no-op it, not because it "could never have succeeded anywhere". Ship a new
additive migration instead. Editing history does not change what already ran; it changes what a
freshly provisioned environment ends up with, silently.
_Source:_ `AGENTS.md` Migration Immutability Rules. `established fact`.
_Enforcement:_ **gated** — the `Published migration integrity` check compares SHA-256 against the
base branch.

**AC-9.2 — When a published migration is genuinely broken, the sanctioned mechanism patches a
disposable copy.**
`config/local-supabase-replay-compatibility.json` declares per-file `compatibility_noops` or
`compatibility_patches`, verified by `source_sha256` and applied to a copy inside a disposable
workdir at replay time. The committed file is never modified. Check this config **before** proposing
any correction — the defect may already be handled, in which case the correct change is none.
_Source:_ `config/local-supabase-replay-compatibility.json`; `AGENTS.md`. `established fact`.

**AC-9.3 — A merge is not a deployment, and a committed migration is not an applied one.**
Publishing ships frontend and edge functions; migrations reach an environment through a separate
apply path. Never infer applied schema from repository presence.
_Source:_ `AGENTS.md`; `CLAUDE.md` repository traps. `established fact`.

---

## 10. Statistical methods are bounded by evidence

**AC-10.1 — VPD drift uses an EWMA, and its parameters are pinned.**
`DEFAULT_VPD_DRIFT_ALPHA = 0.3` and `DEFAULT_VPD_DRIFT_MIN_READINGS = 6`, with the recurrence
`ewma = α·v + (1−α)·ewma` and classifications `insufficient` / `in_band` / `sustained_high` /
`sustained_low`. Alpha is clamped to `(0, 1]` and falls back to the default. The module is mirrored
into `_shared` per AC-2.3. **Do not silently move α to 0.2.**
_Source:_ `src/lib/vpdDriftRules.ts:56-57,64-70,86`;
`supabase/functions/_shared/lib/lib/vpdDriftRules.ts`. `established fact`.
_Enforcement:_ pinned by `src/test/vpd-drift-ewma.test.ts`.

**AC-10.2 — Nelson Rules and Modified Z-Score / MAD are NOT implemented, and must never be
described as implemented.**
Case-insensitive search across `src/` and `supabase/` at the stamped SHA returns **zero** hits for
either. The only repository mention of Nelson is the 2026-08-21 adjudication recording that it is
not implemented.
_Source:_ measured at the stamped SHA; `docs/audits/architecture-audit-adjudication-2026-08-21.md`
§4.1. `established fact`.

**AC-10.3 — Both are rejected, not deferred. See §12.**

---

## 11. Enforcement map

Honest accounting of which clauses are held by a gate and which by convention. **Every one of the 47
clauses appears below**, because §0.2 promises each clause names the mechanism that keeps it true;
a clause omitted from this table would be an unstated gap rather than an accounted one.

| Clause                                                                                            | Enforcement                                                                                                | Kind                |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| AC-2.3                                                                                            | `scripts/check-no-src-lib-imports.mjs`, `scripts/verify-edge-shared-in-sync.mjs` (prebuild + required CI)  | **gated**           |
| AC-8.1                                                                                            | `scripts/check-bun-lockfile-policy.mjs`                                                                    | **gated**           |
| AC-8.4                                                                                            | ESLint                                                                                                     | **gated**           |
| AC-9.1                                                                                            | `Published migration integrity` CI check                                                                   | **gated**           |
| AC-4.6                                                                                            | `scripts/sensor-safety-check.mjs` — wording heuristic over `src/lib/sensor` + `src/components/sensor` only | **partially gated** |
| AC-10.1                                                                                           | `src/test/vpd-drift-ewma.test.ts`                                                                          | **pinned**          |
| AC-1.3                                                                                            | manifest-vs-tree cross-check test                                                                          | **pinned**          |
| AC-1.1, AC-1.2                                                                                    | build / regeneration                                                                                       | structural          |
| AC-5.2                                                                                            | no code path from the request body to the model constants                                                  | structural          |
| AC-5.4                                                                                            | UUID validation of a **client-supplied** key plus atomic RPC semantics — see the note below                | validated input     |
| AC-2.1, AC-5.1, AC-5.3, AC-5.6, AC-5.8, AC-6.3                                                    | shape of the code as written; a change would be visible in review, not caught by a gate                    | structural          |
| AC-2.2, AC-6.1, AC-6.4                                                                            | RLS and server-side checks at runtime; no static gate proves the client cannot be trusted                  | runtime boundary    |
| AC-1.4 – AC-1.7, AC-2.4, AC-3.1 – AC-3.4, AC-4.3 – AC-4.5, AC-6.2, AC-8.2, AC-8.3, AC-9.2, AC-9.3 | comment and review                                                                                         | `convention only`   |
| AC-4.1, AC-4.2                                                                                    | no gate proves the vocabulary is not widened; T2/T3 are the proposed cover                                 | **unenforced**      |
| AC-5.5, AC-5.7, AC-6.5, AC-7.1, AC-7.2, AC-7.3, AC-10.2, AC-10.3                                  | product-safety commitments held by review and by the absence of the code that would break them             | **unenforced**      |

**On AC-5.4, corrected.** An earlier draft grouped it with AC-5.2 as "no code path from request body
to constant or key". That is wrong: `idempotencyKey` **does** come from the request
(`ai-doctor-review/index.ts:335-338` validates `request.idempotencyKey` as a UUID, and `:388` passes
it to `p_idempotency_key`). Its safety comes from validation plus the atomic credit RPC, not from
being server-constant. AC-5.2's boundary is genuinely structural; AC-5.4's is validated client
input, and conflating them records the wrong trust boundary.

**Proposed gates.** These do not exist yet and are named so the gap is visible rather than implied:

| ID  | Test                                                                                                                                                         | Guards        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| T1  | Every path cited by a clause in this file exists at the stamped SHA                                                                                          | this document |
| T2  | `SENSOR_SOURCES` and `CANONICAL_SENSOR_SOURCES` resolve **equal** — by import and object comparison, not by regex                                            | AC-4.1        |
| T3  | No module outside the two canonical files declares a sensor-source union literal, with the two known drifts allowlisted so the count can shrink but not grow | AC-4.3        |
| T4  | `MODEL` and `MODEL_TIER` are module constants and not request-derived                                                                                        | AC-5.2        |
| T5  | Zero occurrences of Nelson / modified-Z / MAD across `src/` and `supabase/`                                                                                  | AC-10.2       |

**Each test needs the technique its claim actually admits — they are not all import tests.**

| Test | Technique                | Why                                                                                                                                                                                                      |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2   | **resolved import**      | Both are runtime `as const` arrays, so the values exist at runtime and can be compared as objects                                                                                                        |
| T3   | **source / AST scan**    | Sensor-source unions are **type-level and erased at runtime**. No import can observe a declaration that does not exist in the emitted output; finding declarations outside the canonical files needs AST |
| T4   | **import + source scan** | Importing can assert the constants' values, but it cannot prove a **negative** — that no request field reaches model selection. That half is a source/AST claim                                          |
| T5   | **source scan**          | Proving a token is **absent** is exactly what scanning is good for                                                                                                                                       |

**`scripts/check-contract-test-resolution.mjs` does not apply to any of these.** It flags only tests
that read the source of `playwright.config` or `vitest.config` without importing them
(`CONFIG_FILES = ["playwright.config", "vitest.config"]`). Citing it as the reason T2–T4 must import
was wrong: the underlying principle — verify effective configuration by resolving it, and use
scanning only to prove absence or structure — is what governs here, not that checker's scope.

---

## 12. Rejected alternatives

Rejected means decided, with a reason. Re-proposing one requires new evidence, not a new preference.

| Alternative                                            | Verdict      | Why                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nelson Rules** for telemetry anomalies               | **REJECTED** | Environmental telemetry violates textbook SPC assumptions — day/night cycles, uneven sampling intervals, stage transitions, maintenance windows, sensor replacement. Wholesale adoption would manufacture alarms |
| **Modified Z-Score / MAD**                             | **REJECTED** | Same class of assumption violation; no evidence of need, and no implementation to preserve                                                                                                                       |
| **Moving VPD α from 0.3 to 0.2**                       | **REJECTED** | Named explicitly in the 2026-08-21 adjudication as a change not to make silently. α is a tuned, test-pinned parameter                                                                                            |
| **Next.js migration**                                  | **REJECTED** | No source pressure. TanStack Start SSR is working, `server-only` is already banned as a foreign idiom (AC-8.4), and the cost is the whole route tree and the 683-file shim                                       |
| **Drizzle**                                            | **REJECTED** | Would sit beside an append-only migration history and generated Supabase types; introduces a second schema truth                                                                                                 |
| **tRPC**                                               | **REJECTED** | Server functions plus edge functions already cover the seam, and RLS — not a typed RPC layer — is the boundary that matters (AC-2.2)                                                                             |
| **Auth migration off Supabase Auth**                   | **REJECTED** | Auth, RLS, and `auth.uid()` are one system. Replacing the first breaks the authorization model                                                                                                                   |
| **Collapsing vendor/transport into `source`**          | **REJECTED** | Directly contradicts AC-4.2. Would let a vendor name imply health                                                                                                                                                |
| **Device control / automatic Action Queue**            | **REJECTED** | Product-level safety commitment, not a technical one (AC-7.1)                                                                                                                                                    |
| **Treating `vercel.json` as production configuration** | **REJECTED** | Its runtime directives are measured as not applied in production. Never reason about production redirects or headers from that file                                                                              |

---

## 13. Deferred

Not rejected — sequenced.

| Item                                                                                                    | Gate                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| The gates T1–T5 in §11                                                                                  | Their own slice; T2 and T3 are the highest value                                                        |
| Consolidating `docs/architecture.md`, `docs/grow-os-architecture.md`, `docs/grow-diary-architecture.md` | All three predate or contradict the current stack in places; retiring them is a separate reviewed slice |
| Enumerating the remaining sensor-source union re-declarations                                           | Bounded by T3 rather than by hand                                                                       |
| Renaming `BillingSubscriptionRow` (AC-6.1 hazard)                                                       | Cosmetic; touches entitlement types, so it wants its own diff                                           |
| Making the AC-4.5 pin bidirectional, or restating its comment                                           | Small, but it changes a safety-adjacent normalizer                                                      |
| **Authoritative Release Topology Specification**                                                        | §14 — blocked on evidence this contract does not have                                                   |

---

## 14. What this contract does not settle

Stated as unknowns rather than omitted, so nobody reads silence as agreement.

- **Publisher identity is unresolved.** `CLAUDE.md` states Lovable is the production publisher;
  `docs/agents/CURRENT_STATE.md` carries Vercel as a source claim while explicitly retracting an
  earlier header-based proof. Serving infrastructure and publisher identity are different claims and
  only the former has ever been measured. One piece of repository evidence bears on it and is
  recorded here without being treated as decisive: `scripts/stamp-version.mjs` states that "the
  production publisher (Lovable) sometimes builds from a history-less snapshot — a freshly
  `git init`-ed directory with zero commits and no `GITHUB_*` env (observed 2026-08-05, when
  production served `commit: "unknown"`)", which is behaviour a Git-connected host build would not
  produce. That is a dated `source claim` plus one observation, not a measurement of who publishes
  today. **`NOT_MEASURED`.**
- **The build-target-to-serving path is unexplained.** The Lovable preset configures Nitro with
  **Cloudflare as the default target** and emits `dist/server/index.mjs`, and `vite.config.ts`
  warns about Cloudflare asset serving — while production responses have been measured as served
  through Vercel. How one reaches the other is **`NOT_MEASURED`**, and it is the central question the
  Release Topology Specification must answer. This contract deliberately declines to guess.
- **Applied production schema is `NOT_MEASURED`** here and belongs to `docs/agents/CURRENT_STATE.md` (AC-9.3).
- **Per-table RLS policy state** is owned by migrations, not by this file.
- **Runtime drift among the ~90 unenumerated sensor-source union literals** is `NOT_MEASURED`; two
  are confirmed divergent by reading (AC-4.3), the rest were not enumerated.

---

## 15. Amending this contract

1. A clause changes only in a slice that changes the code it governs, or in a slice whose stated
   purpose is to amend the contract. Never as a drive-by edit.
2. Re-stamp the verification SHA in the header and re-verify every clause you touched. A clause
   carried forward unverified must be relabelled `source claim`.
3. Moving a clause from `convention only` to **gated** is always in scope and never needs a contract
   amendment — it needs a test.
4. Removing a clause requires stating what replaced it. A clause that is merely inconvenient is not
   obsolete.
5. This file carries no `Sentinel-Version` and is not one of the twelve governance files. Editing it
   alone requires no parity bump.

   **Why, stated correctly.** `scripts/check-sentinel-version-parity.mjs` iterates a fixed
   `ALL = [CANONICAL, ...MIRRORS]` array naming exactly those twelve files (`:31-45`), so adding a
   version header here would **not**, on its own, pull this file into the parity gate — an earlier
   draft claimed it would, and that was factually wrong. The reason to leave the header off is
   different and weaker: a `Sentinel-Version` line signals governance-file status this document does
   not have, and invites a future editor to add it to `MIRRORS` and turn every amendment into a
   twelve-file change. Adding this file to that list is a deliberate decision for Cheek, not a side
   effect of a header.
