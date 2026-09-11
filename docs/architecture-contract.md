# Verdant — Current Architecture Contract

**Scope:** the permanent architectural invariants of the Verdant Grow OS application.
**Verified from source at:** `7c46855b7fd49651cf8ed080a5a931ff8fbdd640` (deploy branch
`verdant-grow-diary`), 2026-09-05, by Grok (round-2 docs fix on PR #1281).
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

**AC-1.3 — Route access policy is declared data; layout mounts are the access reality until parity
exists. Route gating is presentation-only.**
`src/lib/appRouteManifest.ts` holds the **declared** access policy as pure data (`access` over
`public | auth | operator | internal | redirect`). It is **not** authoritative for who can reach a
route until every entry's `access` matches the TanStack layout that actually mounts it
(`_app` / `_operator` / public roots). Today the layout tree is the stronger signal for real access
behaviour; the manifest is the intended policy table. A route guard is a convenience for the grower,
never an authorization control — **RLS is the boundary** (see AC-2.2). Adding a route without a
manifest entry is still drift of the declared set.
_Source:_ `src/lib/appRouteManifest.ts:52,70-88`; `src/routes/_app.tsx`;
`src/routes/_app/_operator.tsx`. `established fact`.
_Enforcement:_ **partial.** The sync harness cross-checks the mounted **URL set**, and
`findAccessGroupMismatches` (`src/test/helpers/routeManifestSyncHarness.ts:243-260`) checks only that
`/operator/`-shaped paths carry `operator` or `internal`. **No test compares a route's declared
`access` against the layout it actually sits in**, so moving an authenticated route out of `_app`
into a public root file keeps the URL, keeps a stale `access: "auth"`, and stays green. Full
public/auth/operator layout parity is unenforced (T7).

**AC-1.4 — `vite.config.ts` stays a thin wrapper over the Lovable preset.**
`@lovable.dev/vite-tanstack-config` already supplies TanStack devtools, `tanstackStart`,
`viteReact`, `tailwindcss`, `tsConfigPaths`, Nitro, `VITE_*` injection, the `@` alias and
React/TanStack dedupe. Re-adding any of them duplicates a plugin and breaks the app. The preset must
be imported from its explicit ESM path (`/dist/index.js`); the bare specifier resolves the CJS
`main`, whose `require("vite")` throws `ERR_REQUIRE_CYCLE_MODULE`.
_Source:_ `vite.config.ts:1-12`. `established fact`.
_Enforcement:_ `convention only` — the failure is a broken build, not a gate.

**AC-1.5 — CSRF protection for server functions requires explicit middleware registration.**
`src/start.ts` registers `createCsrfMiddleware` filtered to `handlerType === "serverFn"` in
`requestMiddleware`. That registration is what keeps server functions protected. **There is no
automatic CSRF default to fall back on** if the middleware is removed — deleting it removes
protection silently. An in-file comment that claims defining `src/start.ts` "opts out" of an
automatic install is **not** treated as contract evidence; measure the installed Start behaviour,
not the comment.
_Source:_ `src/start.ts:24-30` (middleware registration). `established fact` for the explicit
registration; the absent automatic install is `established fact` against the installed
`@tanstack/react-start` package behaviour (default start entry does not inject CSRF middleware).
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
Client access is `@supabase/supabase-js` with `@supabase/ssr`. Server-trusted logic lives in **two**
places, not one: Deno edge functions under `supabase/functions/`, and `SECURITY DEFINER` database
RPCs defined by migrations — `quicklog_save_manual`, `action_queue_create`, `ai_credit_spend` and
others, some invoked directly from the client (`src/lib/actionQueueCreateService.ts:43`) and guarded
by `auth.uid()` inside the function body. Treating edge functions as the only trusted server layer
would direct new work away from half the existing boundary.
_Source:_ `package.json` dependencies; `supabase/functions/` (edge functions plus `_shared`).
Function inventories live in `docs/codebase-map.md`, not here. `established fact`.

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

**AC-3.3 — Copy that is pinned, reused, or safety-bearing is data, not markup.**
Such strings live in `src/constants/*Copy.ts` / `*Messages.ts` or as `as const` exports in rules
modules, so tests can pin exact wording.

**Scope, narrowed to what is true.** This is not a blanket rule and never was: the stamped tree keeps
ordinary presentational prose inline in JSX across many pages — `src/pages/GuidesIndex.tsx:57-68` is
a representative example, not an outlier. Stating the invariant unqualified would declare most
existing presentation code noncompliant and produce misleading review guidance. The boundary is
purpose, not location: **copy a test pins, copy reused across surfaces, and copy that carries a
safety or entitlement claim** belong in constants. One-off page prose may stay inline.
_Source:_ `src/constants/`; inline-copy boundary observed at `src/pages/GuidesIndex.tsx:57-68`.
`established fact` for the constants pattern; `inference` for the boundary.

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

**AC-4.1 — Normalizer and display resolve every reading to exactly six trust labels.**

```text
live · manual · csv · demo · stale · invalid
```

These six are the **resolved** vocabulary: every source the application **normalizes or displays**
must land on one of them. Unknown or missing input resolves to `invalid`, never to `live` or any
other healthy label, and only `live` is healthy — `manual` and `csv` are trusted-as-entered but are
not live data.

**Schema is wider than the resolved vocabulary — recorded, not narrowed here.** The latest
`validate_sensor_reading` trigger (migration `20260617164759_…`) admits **nineteen** `source`
tokens: the six above, plus `pi_bridge`, `sim`, `webhook_generic`, `node_red_bridge`,
`esp32_arduino`, `esp32_arduino_sht31`, `esp32_esphome`, `esp32_mqtt_bridge`,
`home_assistant_bridge`, `ha_forwarded`, `ecowitt`, `mqtt`, and `webhook`. That admit-list is the
storage contract for replayed and historically populated environments. **Schema-narrow (shrinking
the trigger to six, or rewriting historical rows) is OUT OF SCOPE for this contract and requires
its own approved migration slice — never do it as a drive-by.**

Read AC-4.1 as normalizer+display truth. AC-4.4 names the one **first-party write** that stores a
non-canonical token and promotes it to `live` on read. Other schema-admitted tokens may exist as
stored values without that promotion.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:16,86`;
`src/constants/sensorIngestProvenance.ts:15`;
`supabase/migrations/20260617164759_407c0f40-1f3a-4ac8-a25e-289c175f87fc.sql` (trigger admit-list).
`established fact`.
_Enforcement:_ **unenforced** as a vocabulary gate — see §11; T2/T3 are proposed. Schema width is
measured fact, not a gate.

**AC-4.2 — Trust state and provenance are separate axes, and provenance may never widen the
resolved vocabulary.**
`source` answers "how should Verdant treat this reading". Vendor, transport, bridge, app, protocol
and device identity answer "how did it arrive", and belong in `raw_payload` or the provenance
registry — `SENSOR_PROVENANCE_TRANSPORTS`, `SENSOR_PROVENANCE_APPS`. Collapsing the two would let a
vendor name imply health.

`NON_CANONICAL_SOURCE_ALIASES` names eighteen tokens (`home_assistant`, `mqtt`, `pi_bridge`,
`eco_witt`, `unknown`, …) that **must not be treated as resolved trust labels**. That list is data.

**It is not an ingest reject-list today.** Measured at the stamped SHA:

| Helper | Non-test callers |
| ------ | ---------------- |
| `isRejectedSourceAlias` (`src/lib/sensorIngestProvenanceRules.ts:110`) | **zero** |
| `isNonCanonicalSourceAlias` | only the unused `isRejectedSourceAlias` wrapper above |

Do **not** claim that either helper binds generic ingest, client write paths, or edge functions. A
wrapper with no callers is not enforcement.

**Two real storage behaviours, distinguished:**

1. **Generic ingest (never-stored transport aliases at the storage boundary).**
   `supabase/functions/sensor-ingest-webhook/storageMapping.ts` maps inbound transport/vendor
   labels (`ecowitt`, `mqtt`, `webhook`, …) to a **canonical** stored `source` and keeps transport
   identity in `raw_payload` (`transport_source` / vendor). That path is the working
   "do not store the transport name as trust state" boundary for the generic webhook.
2. **First-party Pi persist exception.** `pi-ingest-readings` deliberately stores `pi_bridge` as
   `sensor_readings.source` and the read normalizer promotes it to `live`. That is AC-4.4 — an
   exception, not a pattern — and it is outside the unused reject helpers entirely (edge code
   cannot import `src/lib` per AC-2.3).

Schema still admits the wider token set for historical rows (AC-4.1). Schema-narrow remains out of
scope.
_Source:_ `src/constants/sensorIngestProvenance.ts:1-13,26-70,130`;
`src/lib/sensorIngestProvenanceRules.ts:110-112` (definition only; zero non-test callers);
`supabase/functions/sensor-ingest-webhook/storageMapping.ts:4-7,60-82,161-185`;
consumer set established by grep at the stamped SHA. Reasoning adjudicated in
`docs/audits/architecture-audit-adjudication-2026-08-21.md` §5. `established fact`.
_Enforcement:_ **unenforced** for the `NON_CANONICAL_SOURCE_ALIASES` helpers. Generic-webhook
canonicalization is structural in that edge path; the Pi exception is deliberate (AC-4.4).

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

**The contract for `src/`:** new code under `src/` imports `SensorSource` from
`src/lib/sensor/sensorSourceRules.ts`. New inline union literals over source names are not
permitted there. The two divergences above are grandfathered and allowlisted so that the count can
shrink but not grow. **Edge functions are out of this import rule** — they cannot import `src/lib`
(AC-2.3), and `sensorSourceRules.ts` has no `_shared` mirror today; an edge ingest path needs its
own mirrored or local vocabulary, not a forbidden cross-import.
_Source:_ measured by grep at the stamped SHA. `established fact` for the declarations and the two
drifts; `inference` for the risk assessment.
_Enforcement:_ **none today.** T3 in §11 is the proposed gate.

**AC-4.4 — `pi_bridge` is the first-party stored non-canonical source that the read path promotes
to `live`. It is the one sanctioned transport-to-trust exception, and it spans write and read.**

The first-party Pi ingest edge function writes the token directly into the row:
`source: "pi_bridge"` at `supabase/functions/pi-ingest-readings/index.ts:454` and
`.../commitBatch.ts:130`, whose row type fixes `source: "pi_bridge"` at `commitBatch.ts:40`. So
`pi_bridge` reaches `sensor_readings.source` as a **stored value**, outside the six resolved labels
of AC-4.1. On read, `sensorSourceRules.ALIAS` maps it to `live`, and `isHealthySensorSource` treats
`live` as the only healthy source. A transport name therefore reaches the healthy label across both
layers, not merely as a badge.

**Scope of the exception.** `pi_bridge` is **not** "the only value ever stored outside the six" —
the schema admit-list is wider (AC-4.1), and historical or alternate paths may leave other
non-canonical tokens on disk. What is unique here is the **promotion**: this is the sole
non-canonical token the normalizer maps to `live`. Generic webhook ingest does the opposite —
canonicalizes at storage (`storageMapping.ts`) so transport names are not stored as trust state
(AC-4.2). The unused `isRejectedSourceAlias` helpers do not participate in either path.

This is deliberate — the first-party bridge is trusted as live telemetry — and it is **not** recorded
here as a defect. It is recorded because it is the single place where the vendor-name-implies-health
collapse that AC-4.2 forbids is actually permitted, and a contract that left it implicit would let
the next such request cite it as precedent. **It is an exception, not a pattern. Adding a second
one, or extending this one to a third-party bridge, requires an approved slice.**

> An earlier draft of this clause claimed `pi_bridge` was "forbidden as a stored value while still
> normalizing on read". That was **wrong in the direction that matters** — it described the write
> path as prohibited when a first-party function performs it — and is corrected here rather than
> quietly reworded. A later draft then over-claimed that `pi_bridge` was the only stored
> non-canonical value; schema width (AC-4.1) and the unused reject wrappers (AC-4.2) make that
> false.

_Source:_ `supabase/functions/pi-ingest-readings/index.ts:454`,
`supabase/functions/pi-ingest-readings/commitBatch.ts:40,130`;
`src/lib/sensor/sensorSourceRules.ts:23-27,86`;
`supabase/functions/sensor-ingest-webhook/storageMapping.ts`. `established fact`.

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
call reverses through `ai_credit_refund` with its own key. Reversals are append-only.

**`idempotencyKey` has a request-body path.** The edge function validates
`request.idempotencyKey` as a UUID (`ai-doctor-review/index.ts:335-338`) and passes it to
`p_idempotency_key` (`:388`). Protection is **not** structural absence of a client field — it is
**RPC / runtime enforcement**: atomic spend semantics, conflict detection, and append-only refunds
in the database functions (exercised by `scripts/run-ai-credits-rls-harness.ts`).

**A legitimate replay is not a conflict, and the two must not be conflated.**
`classifyAiDoctorCreditSpend` resolves a same-key replay to **`cached`**, **`pending`** or
**`stale`**; only an _incompatible_ reuse — the RPC returning `reason === "idempotency_key_conflict"`
— takes the **`conflict`** branch. Reserve the conflict label for that incompatible case alone.
Retry protocols must be written against those four outcomes.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:335-338,382-388,405-408,443,595`;
`src/lib/aiDoctorCreditReplayRules.ts:18-23,63,70,84,89,92`. `established fact`.
_Enforcement:_ **runtime boundary** — see §11.

**AC-5.5 — AI Doctor writes no cultivation or queue rows, and controls no devices. It does write
billing, receipt and measurement rows.**
The boundary is specific: no `ai_doctor_sessions`, `alerts`, `action_queue` or `sensor_readings`
writes, and no equipment or device control. It may _suggest_ an Action Queue item; it may not create
one (AC-7.1).

It is **not** a no-write endpoint, and calling it one would hide real persistence from a privacy or
data-flow audit. Through RPCs it writes the credit ledger (`ai_credit_spend`, `ai_credit_refund`),
finalizes results and evidence receipts (`ai_doctor_finalize_review`), and records a completion row
(`record_ai_doctor_review_completion`).
_Source:_ `supabase/functions/ai-doctor-review/index.ts:8-9` for the prohibition;
`:233,382,405,595` for the writes it does perform. `established fact`.

**AC-5.6 — Sensor readings reaching model context keep their trust labels. Once a row carries an
explicit quality, only `ok` contributes current values.**

**The null case is a deliberate compatibility exception, not an oversight.**
`hasUsablePersistedQuality` returns `true` when `quality` is `null` or `undefined`, so older rows
predating quality classification still contribute. Writing "only `ok` contributes" would erase that
and invite a future refactor to silently drop legacy sensor evidence. Changing this behaviour is a
separate safety-reviewed slice, not a tidy-up.

Grounding is reject-only: the backstop refuses ungrounded output rather than rewriting it.
_Source:_ `src/lib/aiDoctorCurrentSensorSnapshotRules.ts` — `hasUsablePersistedQuality`;
`supabase/functions/_shared/lib/lib/aiDoctorCurrentSensorSnapshotRules.ts:116,194`;
`aiDoctorReviewGroundingRules.ts:10`. `established fact`.

**AC-5.7 — Output must be cautious and state what it does not know. The output _shape_ is enforced;
the _calibration_ is not.**
The response contract includes confidence, evidence, missing information, what not to do, and a risk
level, and the grounding validator rejects absolute-certainty wording.

**The one-photo ceiling is convention, not construction.** No photo-count or visual-evidence
cardinality signal reaches the confidence decision: the packet carries photo activity only as a
generic `recentEvents` category, and `packetHasAffirmativeEvidence`
(`src/lib/aiDoctorReviewGroundingRules.ts:519-525`) accepts any non-empty recent-event list toward a
`high` result. Calling this "cautious by construction" would mask an unguarded safety rule. An
enforceable cardinality signal plus a confidence cap is the fix, and it is deferred (§13).
_Source:_ `AGENTS.md` AI Doctor Rules; `docs/ai-doctor-output-contract.md`,
`docs/ai-doctor-safety-contract.md`; `src/lib/aiDoctorReviewGroundingRules.ts:519-525`.
`established fact` for the shape; `established fact` for the absent ceiling.

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
`planCatalog` hard-pins `founder_lifetime.aiMonthlyCredits` at **100**. Server-side,
`ai_credit_allowance('founder_lifetime')` returns the same monthly cap, and `ai_credit_spend`
resolves founder rows through that allowance before metering — so the cap is a **runtime boundary**,
not an unenforced peer review hope.
_Source:_ `src/lib/entitlements/planCatalog.ts:9-12,46-48,58`;
`public.ai_credit_allowance` / `public.ai_credit_spend` (migrations under
`supabase/migrations/*ai_credit*`); `AGENTS.md` Monetization and AI Credit rules.
`established fact`.
_Enforcement:_ **runtime boundary** — see §11.

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

**AC-9.3 — A merge is not a deployment, a committed migration is not an applied one, and a
published frontend is not deployed edge code.**
Never infer applied schema, or deployed function code, from repository presence.

**Three artifacts, three different paths, none of them a merge:**

| Artifact       | What the repository establishes                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend       | reaches an environment through the publish/build path                                                                                                                                                        |
| Migrations     | reach an environment through a separate operator apply path                                                                                                                                                  |
| Edge functions | **not** deployed by any workflow under `.github/workflows/` (grep at the stamped SHA). Separate `supabase functions deploy` scripts exist in `package.json` / `Makefile`                                     |

**Who triggers edge deploy is `NOT_MEASURED` from the repository alone.** Absence of a GitHub
Actions deploy proves only that Actions does not deploy them. A `Makefile` comment
(`functions-deploy: … # Lovable does this automatically`) is **comment text, not measurement** —
do not treat it as publisher evidence. Label the edge path as separate and environment-verified;
do not assert "manual only" or "Lovable automatic" until the publish trigger is measured
(§14; release topology deferred — #1221 / #1175).

An earlier draft said publishing "ships frontend and edge functions". No repository evidence supports
an automatic joint ship, and a release operator relying on it could publish a frontend expecting
newer edge code while the backend stays stale.
_Source:_ `package.json` deploy scripts; absence established by grep over `.github/workflows/` at the
stamped SHA; `Makefile` `functions-deploy` target comment (non-authoritative); `AGENTS.md`.
`established fact` for the scripts and for the Actions absence; trigger identity `NOT_MEASURED`.

---

## 10. Statistical methods are bounded by evidence

**AC-10.1 — VPD drift uses an EWMA with fixed default parameters. They are documented here, not pinned by a test.**
`DEFAULT_VPD_DRIFT_ALPHA = 0.3` and `DEFAULT_VPD_DRIFT_MIN_READINGS = 6`, with the recurrence
`ewma = α·v + (1−α)·ewma` and classifications `insufficient` / `in_band` / `sustained_high` /
`sustained_low`. An α outside `(0, 1]` is **replaced with the default** — a fallback, not a clamp: an
input of `5` becomes `0.3`, not `1`. The module is mirrored into `_shared` per AC-2.3. **Do not
silently move α to 0.2.**
_Source:_ `src/lib/vpdDriftRules.ts:56-57,64-70,86`;
`supabase/functions/_shared/lib/lib/vpdDriftRules.ts`. `established fact`.
_Enforcement:_ **`convention only` — the parameter is NOT pinned.** An earlier draft claimed
`src/test/vpd-drift-ewma.test.ts` pinned it. It does not: that file never references `alpha`,
`DEFAULT_VPD_DRIFT_ALPHA` or `0.3`, and its classification cases are broad enough to keep passing if
the default moved to 0.2. Claiming a pin that does not exist is the precise failure this document
exists to prevent, so it is corrected rather than quietly dropped. An exact resolved-value assertion
is proposed as **T6** in §11.

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

Honest accounting of which clauses are held by a gate and which by convention. **All 47 clauses
are classified below** (no omissions). §0.2 promises each clause names the mechanism that keeps it
true; a clause missing from this table would be an unstated gap.

| Clause   | Enforcement                                                                                                | Kind                |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| AC-1.1   | build / regeneration                                                                                       | structural          |
| AC-1.2   | build / regeneration                                                                                       | structural          |
| AC-1.3   | manifest-vs-tree **URL-set** parity + `/operator/` shape only; full access↔layout parity unenforced (T7)  | **partially gated** |
| AC-1.4   | comment and review                                                                                         | `convention only`   |
| AC-1.5   | comment and review — explicit CSRF registration; no automatic default                                      | `convention only`   |
| AC-1.6   | comment and review                                                                                         | `convention only`   |
| AC-1.7   | comment and review                                                                                         | `convention only`   |
| AC-2.1   | shape of the code as written                                                                               | structural          |
| AC-2.2   | RLS and server-side checks at runtime                                                                      | runtime boundary    |
| AC-2.3   | `scripts/check-no-src-lib-imports.mjs`, `scripts/verify-edge-shared-in-sync.mjs` (prebuild + required CI)  | **gated**           |
| AC-2.4   | comment and review                                                                                         | `convention only`   |
| AC-3.1   | comment and review                                                                                         | `convention only`   |
| AC-3.2   | comment and review                                                                                         | `convention only`   |
| AC-3.3   | comment and review — pinned/reused/safety copy in constants; inline JSX prose allowed                      | `convention only`   |
| AC-3.4   | comment and review                                                                                         | `convention only`   |
| AC-4.1   | no gate proves resolved vocabulary is not widened; schema width is measured fact; T2/T3 proposed           | **unenforced**      |
| AC-4.2   | `isRejectedSourceAlias` has zero non-test callers — unused helpers are not an ingest gate                  | **unenforced**      |
| AC-4.3   | comment and review; T3 proposed                                                                            | `convention only`   |
| AC-4.4   | comment and review — deliberate Pi exception                                                               | `convention only`   |
| AC-4.5   | one-directional only                                                                                       | `convention only`   |
| AC-4.6   | `scripts/sensor-safety-check.mjs` — wording heuristic over `src/lib/sensor` + `src/components/sensor` only | **partially gated** |
| AC-5.1   | shape of the code as written                                                                               | structural          |
| AC-5.2   | no code path from the request body to the model constants                                                  | structural          |
| AC-5.3   | shape of the code as written                                                                               | structural          |
| AC-5.4   | UUID syntax check plus **atomic RPC** spend/refund/conflict; `scripts/run-ai-credits-rls-harness.ts`       | runtime boundary    |
| AC-5.5   | product-safety commitment held by review and by absence of cultivation/queue writes                        | **unenforced**      |
| AC-5.6   | shape of the code as written — null/missing quality still contributes                                      | structural          |
| AC-5.7   | output **shape** enforced by tool schema + grounding validator; **one-photo ceiling convention-only**      | **partially gated** |
| AC-5.8   | shape of the code as written                                                                               | structural          |
| AC-6.1   | RLS and server-side checks at runtime                                                                      | runtime boundary    |
| AC-6.2   | comment and review                                                                                         | `convention only`   |
| AC-6.3   | shape of the code as written                                                                               | structural          |
| AC-6.4   | RLS and server-side checks at runtime                                                                      | runtime boundary    |
| AC-6.5   | `ai_credit_allowance` + `ai_credit_spend` cap founder at 100/month                                         | runtime boundary    |
| AC-7.1   | product-safety commitment held by review                                                                   | **unenforced**      |
| AC-7.2   | product-safety commitment held by review                                                                   | **unenforced**      |
| AC-7.3   | product-safety commitment held by review                                                                   | **unenforced**      |
| AC-8.1   | `scripts/check-bun-lockfile-policy.mjs`                                                                    | **gated**           |
| AC-8.2   | comment and review                                                                                         | `convention only`   |
| AC-8.3   | comment and review                                                                                         | `convention only`   |
| AC-8.4   | ESLint                                                                                                     | **gated**           |
| AC-9.1   | `Published migration integrity` CI check                                                                   | **gated**           |
| AC-9.2   | comment and review                                                                                         | `convention only`   |
| AC-9.3   | comment and review — edge trigger identity `NOT_MEASURED`                                                  | `convention only`   |
| AC-10.1  | **nothing** — `src/test/vpd-drift-ewma.test.ts` does not assert α; T6 is the proposed pin                  | **unenforced**      |
| AC-10.2  | absence of Nelson / MAD implementations; T5 proposed                                                       | **unenforced**      |
| AC-10.3  | product decision recorded in §12                                                                           | **unenforced**      |

**Count check:** 47 rows above = 47 clauses. Kinds used: **gated**, **partially gated**,
structural, runtime boundary, `convention only`, **unenforced**.

**On AC-5.4, corrected.** An earlier draft grouped it with AC-5.2 as "no code path from request body
to constant or key". That is wrong: `idempotencyKey` **does** come from the request
(`ai-doctor-review/index.ts:335-338` validates `request.idempotencyKey` as a UUID, and `:388` passes
it to `p_idempotency_key`). UUID validation is only syntax. Double-spend prevention, replay
classification, and append-only refunds are **RPC/runtime**. AC-5.2's boundary is structural;
AC-5.4's is a runtime boundary. Conflating them records the wrong trust boundary.

**On AC-6.5, corrected.** An earlier draft listed it with unenforced product-safety peers. Founder
credits are capped by `ai_credit_allowance` / `ai_credit_spend` at runtime — same kind as AC-6.1 /
AC-6.4.

**Proposed gates.** These do not exist yet and are named so the gap is visible rather than implied:

| ID  | Test                                                                                                                                                         | Guards        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| T1  | Every path cited by a clause in this file exists at the stamped SHA                                                                                          | this document |
| T2  | `SENSOR_SOURCES` and `CANONICAL_SENSOR_SOURCES` resolve **equal** — by import and object comparison, not by regex                                            | AC-4.1        |
| T3  | No module outside the two canonical files declares a sensor-source union literal, with the two known drifts allowlisted so the count can shrink but not grow | AC-4.3        |
| T4  | `MODEL` and `MODEL_TIER` are module constants and not request-derived                                                                                        | AC-5.2        |
| T5  | Zero occurrences of Nelson / modified-Z / MAD across `src/` and `supabase/`                                                                                  | AC-10.2       |
| T6  | `DEFAULT_VPD_DRIFT_ALPHA === 0.3`, `DEFAULT_VPD_DRIFT_MIN_READINGS === 6`, and one exact numeric recurrence step                                             | AC-10.1       |
| T7  | Every route's declared `access` matches the layout it is mounted under, for all four groups — not just `/operator/`                                          | AC-1.3        |

**Each test needs the technique its claim actually admits — they are not all import tests.**

| Test | Technique             | Why                                                                                                                                                                                                      |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2   | **resolved import**   | Both are runtime `as const` arrays, so the values exist at runtime and can be compared as objects                                                                                                        |
| T3   | **source / AST scan** | Sensor-source unions are **type-level and erased at runtime**. No import can observe a declaration that does not exist in the emitted output; finding declarations outside the canonical files needs AST |
| T4   | **source / AST scan only** | `MODEL` and `MODEL_TIER` in `ai-doctor-review/index.ts` are **unexported** module constants, and importing that entrypoint executes `Deno.serve(...)`. A resolved-value import assertion is not available without a structure change; do not fake one. Scan for the const declarations and prove no request field reaches model selection |
| T5   | **source scan**       | Proving a token is **absent** is exactly what scanning is good for                                                                                                                                       |
| T6   | **resolved import**   | Both are exported runtime numbers; assert the values and one hand-computed EWMA step so a default change fails loudly                                                                                    |
| T7   | **route-tree traversal** | Access group is a property of the mounted layout, so the check must walk the tree, not the manifest alone                                                                                             |

**`scripts/check-contract-test-resolution.mjs` does not apply to any of these.** It flags only tests
that read the source of `playwright.config` or `vitest.config` without importing them
(`CONFIG_FILES = ["playwright.config", "vitest.config"]`). Citing it as the reason T2–T4 must import
was wrong: the underlying principle — verify effective configuration by resolving it when possible,
and use scanning to prove absence, structure, or unexported Deno-entry constants — is what governs
here, not that checker's scope.

---

## 12. Rejected alternatives

Rejected means decided, with a reason. Re-proposing one requires new evidence, not a new preference.

| Alternative                                            | Verdict      | Why                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nelson Rules** for telemetry anomalies               | **REJECTED** | Environmental telemetry violates textbook SPC assumptions — day/night cycles, uneven sampling intervals, stage transitions, maintenance windows, sensor replacement. Wholesale adoption would manufacture alarms |
| **Modified Z-Score / MAD**                             | **REJECTED** | Same class of assumption violation; no evidence of need, and no implementation to preserve                                                                                                                       |
| **Moving VPD α from 0.3 to 0.2**                       | **REJECTED** | Named explicitly in the 2026-08-21 adjudication as a change not to make silently. α is a tuned parameter that is **currently unpinned** (AC-10.1 / T6); do not assume CI catches a silent move |
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
| An enforceable visual-evidence cardinality signal plus a confidence cap for AI Doctor (AC-5.7)          | Safety-bearing; needs a packet-shape change, so it is its own reviewed slice                            |
| Making the AC-4.5 pin bidirectional, or restating its comment                                           | Small, but it changes a safety-adjacent normalizer                                                      |
| **Authoritative Release Topology Specification**                                                        | §14 — blocked on evidence this contract does not have; deferred work tracked via #1221 / #1175          |

---

## 14. What this contract does not settle

Stated as unknowns rather than omitted, so nobody reads silence as agreement.

**Release topology is deliberately not settled here, and the dated evidence for it lives elsewhere.**
An earlier draft of this section recorded current hosting observations and publisher evidence
directly. That contradicted this document's own header — production axes are absent, and
`docs/agents/CURRENT_STATE.md` is strictly disjoint — and would have made a permanent contract go
stale every time the operating picture moved. Only the durable rules stay:

- **Publisher identity is not established by response headers.** Serving infrastructure and publisher
  identity are different claims; measuring the first says nothing about the second. Repository
  documents currently disagree (`CLAUDE.md` names Lovable; `docs/agents/CURRENT_STATE.md` carries
  Vercel as a source claim while retracting an earlier header-based proof), and one dated
  repository observation in `scripts/stamp-version.mjs` bears on it. **`Makefile:77`'s
  "Lovable does this automatically" line is a Make recipe comment only — not publisher
  evidence.** The evidence and its dates belong in `docs/agents/CURRENT_STATE.md`, not here. The
  durable requirement: **measure the publish trigger before asserting a publisher.**
  `NOT_MEASURED`.
- **The build target is not the serving target, and neither may be assumed from the other.** The
  Lovable preset configures Nitro against one target while production is served through another;
  reconciling them requires deployment metadata this repository does not contain. The durable
  requirement: **a release topology claim is measured or it is `NOT_MEASURED`** — never inferred from
  build configuration, response headers, Make comments, or tip-equals-live parity. Resolving it is
  the Release Topology Specification's job (§13; #1221 / #1175).
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
