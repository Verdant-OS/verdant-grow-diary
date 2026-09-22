# Verdant — Current Architecture Contract

**Scope:** the permanent architectural invariants of the Verdant Grow OS application.
**Verified from source at:** `387a00067a76ca9e2ced453d6b6a0f580e33209b` (deploy branch
`verdant-grow-diary`), 2026-09-22, by Claude (§15 re-verification amendment; see §15.1). Every
clause was re-read against `8fc3840743ed58e8a27dc6b39f68563e16a8e48e`. The only file that differs
between that tree and the stamped tip is `docs/agents/CURRENT_STATE.md`, which this contract does
not cite for any clause. First verified at `7c46855b7fd49651cf8ed080a5a931ff8fbdd640` on 2026-09-05
by Grok (PR #1281).
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
_Source:_ `src/server.ts:14,47-61`, `src/start.ts:28`, `src/router.tsx:2,8-9`. `established fact`.
_Enforcement:_ build and typecheck — the app does not start without these entries.

**AC-1.2 — Machine-produced files are never hand-authored.**
Routes live under `src/routes/` and compile into `src/routeTree.gen.ts`. That file, together with
`src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts` and
`supabase/functions/_shared/lib`, is machine-produced. Do not hand-edit any of them.

**The protection is not the same for all four, so it is not stated as one mechanism.** For
`src/routeTree.gen.ts` and `supabase/functions/_shared/lib`, the next generation overwrites a hand
edit. `supabase/functions/mcp/index.ts` is different. Its codegen plugin is deliberately **not**
wired, so "the committed bundle stays hand-synced" and nothing regenerates it on build. A hand edit
there persists until someone re-runs the generator deliberately. The bundle's own banner still says
"Regenerated by the Vite plugin", which contradicts `vite.config.ts`; trust the config, not the
banner. `src/integrations/supabase/types.ts`
is produced by Supabase type generation, but it carries no in-file banner that says so.
_Source:_ `src/routeTree.gen.ts:7-8`; `supabase/functions/mcp/index.ts:1`;
`vite.config.ts:25-30` (MCP note, including "stays hand-synced"); `_shared/lib` files carry
`@generated by scripts/sync-edge-shared.mjs`; `scripts/lib/tree-hash.mjs:43-70` (`TREE_HASH_ROOTS`
includes `supabase`). `established fact`.
_Enforcement:_ regeneration overwrite for the route tree and the `_shared` mirror. For the MCP bundle,
`TREE_HASH_ROOTS` participation, plus `src/test/vite-mcp-windows-codegen-safety.test.ts:43-45`,
which forbids wiring the codegen plugin. For `types.ts`, `convention only`.

**AC-1.3 — Route access policy is declared data; layout mounts are the access reality until parity
exists. Route gating is presentation-only.**
`src/lib/appRouteManifest.ts` holds the **declared** access policy as pure data (`access` over
`public | auth | operator | internal | redirect`). It is **not** authoritative for who can reach a
route until every entry's `access` matches the TanStack layout that actually mounts it
(`_app` / `_operator` / public roots). Today the layout tree is the stronger signal for real access
behaviour; the manifest is the intended policy table. A route guard is a convenience for the grower,
never an authorization control — **RLS is the boundary** (see AC-2.2). Adding a route without a
manifest entry is still drift of the declared set.
_Source:_ `src/lib/appRouteManifest.ts:38` (the `AppRouteAccess` union), `:52` (the field), `:69-88`
(the start of `APP_ROUTES`); `src/routes/_app.tsx`; `src/routes/_app/_operator.tsx`.
`established fact`. The doc comments inside `appRouteManifest.ts` (for example `:49`) still describe
the pre-SSR `App.tsx` mount. That is stale wording in the cited file, not a description of the code.
_Enforcement:_ **partial**, and narrower in its gap than first recorded. What is tested:

- the mounted **URL set** against the manifest (the sync harness);
- `/operator/`-shaped paths carry `operator` or `internal`
  (`findAccessGroupMismatches`, `src/test/helpers/routeManifestSyncHarness.ts:243-256`);
- every `operator` / `internal` manifest entry is mounted under `/_app/_operator`
  (`src/test/route-manifest-operator-gating.test.ts:45-63`), and operator-shaped paths sit under that
  layout (`src/test/route-manifest-sync.test.ts:97-101`);
- `/sensors/*` parity in both directions (`src/test/sensor-route-guard-parity.test.ts:113-128`).

What is **not** tested is general `auth` ↔ `_app` and `public` ↔ public-root parity.
`isMountedUnderAppShell` is used only for spot checks. So moving an authenticated route out of
`_app` into a public root file keeps the URL, keeps a stale `access: "auth"`, and stays green (T7).

> An earlier version of this clause said no test compares declared `access` against the mounting
> layout. That was already wrong at the first stamp, because the operator-gating test predates it.
> It is corrected here, not quietly reworded.

**AC-1.4 — `vite.config.ts` stays a thin wrapper over the Lovable preset.**
`@lovable.dev/vite-tanstack-config` already supplies TanStack devtools, `tanstackStart`,
`viteReact`, `tailwindcss`, `tsConfigPaths`, Nitro, `VITE_*` injection, the `@` alias and
React/TanStack dedupe. Re-adding any of them duplicates a plugin and breaks the app. The preset must
be imported from its explicit ESM path (`/dist/index.js`); the bare specifier resolves the CJS
`main`, whose `require("vite")` throws `ERR_REQUIRE_CYCLE_MODULE`.
_Source:_ `vite.config.ts:1-5` (the preset's plugin list, as stated in the file), `:7-11` (the CJS
note), `:12` (the ESM import). `established fact` for what the file says and imports. The preset's
actual internals are a `source claim` carried from the first stamp. They could not be re-read here:
`node_modules` was absent at re-verification. `bun.lock` resolves the preset at 2.8.5 with peers
consistent with the comment.
_Enforcement:_ **partially gated.** The ESM-path rule is pinned: `src/test/vite-dev-server-binding.test.ts:34-39`
requires `/dist/index.js` and forbids the bare specifier. "Do not re-add a preset plugin" stays
`convention only`; the failure there is a broken build, not a gate.

**AC-1.5 — CSRF protection for server functions requires explicit middleware registration.**
`src/start.ts` registers `createCsrfMiddleware` filtered to `handlerType === "serverFn"` in
`requestMiddleware`. That registration is what keeps server functions protected. **There is no
automatic CSRF default to fall back on** if the middleware is removed — deleting it removes
protection silently. An in-file comment that claims defining `src/start.ts` "opts out" of an
automatic install is **not** treated as contract evidence; measure the installed Start behaviour,
not the comment.
_Source:_ `src/start.ts:24-26` (`createCsrfMiddleware`), `:30` (`requestMiddleware:
[errorMiddleware, csrfMiddleware]`); the discounted comment is at `:21-23`. `established fact` for the
explicit registration. The absent automatic install is a **`source claim`** carried from the first
stamp, where it was measured against the installed package. It could not be re-measured here,
because `node_modules` was absent. `bun.lock` resolves `@tanstack/react-start` at 1.168.34.
_Enforcement:_ `convention only`. A search of `src/test`, `scripts` and `e2e` for
`createCsrfMiddleware`, `csrfMiddleware` or `src/start.ts` finds no hits. This is the highest-value
unguarded invariant in §1.

**AC-1.6 — SSR failures must not be served as h3's JSON 500.**
h3 swallows in-handler throws into a normal `500` carrying
`{"unhandled":true,"message":"HTTPError"}`, which no `try`/`catch` ever sees. `src/server.ts`
detects that body shape and substitutes a rendered error page. A refactor that trusts `try`/`catch`
alone reintroduces a JSON blob as the user-visible error.
_Source:_ `src/server.ts:23-36` (`normalizeCatastrophicSsrResponse`), `:38-45`
(`isH3SwallowedErrorBody`), `:52` (where it is applied). `established fact`.
_Enforcement:_ `convention only`. No test references `src/server.ts`.

**AC-1.7 — Provider order in `src/routes/__root.tsx` is load-bearing.**
`AnalyticsShell` and `FunnelEventDbSink` must precede `<Outlet/>` in JSX order. React fires sibling
mount effects in JSX order and `Outlet`'s content is a sibling, not a descendant — placing the sink
later loses mount-effect funnel events on cold loads. The reason is committed as a comment beside
the code.
_Source:_ `src/routes/__root.tsx:243-256`: the comment is at `:244-253`, followed by
`<AnalyticsShell />` `:254`, `<FunnelEventDbSink />` `:255`, `<Outlet />` `:256`. `established fact`.
_Enforcement:_ **gated, by source scan.** `src/test/funnel-event-db-sink.test.tsx:132-135` pins
`AnalyticsShell` immediately followed by the sink, and `:144-150` asserts the sink precedes
`<Outlet />`. This is ordering structure, which a scan can prove.

> Earlier versions cited `:232-242` and called this `convention only`. The citation ended two lines
> before the sink and the outlet even at the first stamp, and the guarding test predates that stamp.

**AC-1.8 — The UI and client-data stack is React 19, Tailwind v4 (CSS-first), shadcn/ui over
Radix, and TanStack Query.**
These are the current major lines, and the layers above assume them. Moving any of them to a new
major is an architecture change that needs its own reviewed slice, not a dependency bump.

- **React** 19.x: `react` and `react-dom` declared `^19.2.0`, resolved 19.2.8.
- **Tailwind** v4, CSS-first: `tailwindcss` and `@tailwindcss/vite` `^4.2.1`, resolved 4.3.3.
  `src/styles.css:1` is `@import "tailwindcss" source(none);`, and there is no `tailwind.config.*`.
- **shadcn/ui** (`components.json`: style `new-york`, `rsc: false`, `cssVariables: true`, icons
  `lucide`) over **Radix**: 27 `@radix-ui/*` packages are declared directly. The primitives live in
  `src/components/ui/`.
- **TanStack Query** 5 as a **direct** dependency: `@tanstack/react-query` `^5.101.1`, resolved
  5.101.4.
- Build and server layers: Vite 8 (`^8.1.5`, resolved 8.2.0) and Nitro 3 beta (`3.0.260603-beta`),
  both through the Lovable preset (AC-1.4). Router 1.170.18 and Start 1.168.34.
- Validation is `zod` 3 (`^3.24.2`, resolved 3.25.76). The lockfile also carries a zod 4 copy, pulled
  in only by build tooling and the MCP SDK. No non-test file under `src/` imports `zod/v4`.

_Source:_ `package.json` (declared versions); `bun.lock` (resolved versions; `package-lock.json`
agrees on every row); `components.json`; `src/styles.css:1`. `established fact` at the stamped SHA.
Exact patch versions are dated evidence, not invariants. The major lines are the contract.
_Enforcement:_ `convention only`, apart from the 24-hour release-age guard on new versions (AC-8.2).

---

## 2. Data, trust boundary, and Supabase

**AC-2.1 — Hosted Supabase is the data platform: Postgres, Auth, RLS, RPC, and Edge Functions.**
Client access is **`@supabase/supabase-js` only**. `@supabase/ssr` is declared in `package.json`,
but nothing imports it, and a test forbids importing it anywhere in `src/`.

Server-trusted logic lives in **two** places, not one: Deno edge functions under
`supabase/functions/`, and `SECURITY DEFINER` database RPCs defined by migrations. The RPCs reach the
boundary in two different ways:

- **Client-invoked, guarded by `auth.uid()` inside the body.** Examples are `quicklog_save_manual`
  and `action_queue_create`, the latter called directly from `src/lib/actionQueueCreateService.ts:43`.
- **Service-role only.** `ai_credit_spend` takes an explicit `p_user_id`, and `EXECUTE` is revoked
  from `anon` and `authenticated` and granted to `service_role` only. Edge functions call it after
  resolving the user from the verified JWT. It is not a client-callable example.

Treating edge functions as the only trusted server layer would steer new work away from half of the
boundary that already exists.
_Source:_ `package.json:359` (`@supabase/ssr` declared); `src/test/auth-hardening-static-safety.test.ts:101-108`
(forbids the import); clients at `src/integrations/supabase/client.ts`, `client.server.ts` and
`auth-middleware.ts`. `quicklog_save_manual`:
`supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql:762,778,782` (latest
`CREATE`). `action_queue_create`:
`supabase/migrations/20260807140000_action_queue_create_allow_ai_coach.sql:13,29,33`. `ai_credit_spend`:
`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:31-42,385-390`. There are 34 edge
function directories plus `_shared`; inventories live in `docs/codebase-map.md`, not here.
`established fact`.

> An earlier version said client access was supabase-js "with `@supabase/ssr`", and cited
> `ai_credit_spend` alongside the client-invoked, `auth.uid()`-guarded RPCs. Both were wrong at the
> first stamp.

**AC-2.2 — RLS is the authorization boundary. Nothing in the client is.**
Route guards (AC-1.3), UI gating, and client entitlement reads are presentation. Server-side checks
are authoritative for anything paid, costly, or privileged, and server code resolves identity from
`auth.uid()` or the verified JWT — never from a client-supplied `user_id`.
_Source:_ `AGENTS.md` Supabase/Data Safety; `supabase/functions/rls-selftest/`. `established fact`
for the rule, `source claim` for per-table policy state (owned by migrations, not by this file).

**AC-2.3 — Edge functions may not import from `src/lib`.**
Shared logic is mirrored into `supabase/functions/_shared`, and the mirror must stay in sync.
_Source:_ `supabase/functions/_shared/lib/`. `established fact`.
_Enforcement:_ **gated in CI.** The required context `Preflight — edge shared-lib mirror in sync`
(`.github/workflows/ci.yml:26`) runs `check-no-src-lib-imports.mjs` (`:46`) and
`verify-edge-shared-in-sync.mjs --check-only` (`:56`), and a drift fails it. Both scripts also run
in `prebuild` (`package.json:9`). There, `verify-edge-shared-in-sync.mjs` **regenerates** a drifted
mirror rather than failing, unless `CI`, `VERIFY_EDGE_SHARED_CHECK_ONLY` or `--check-only` is set
(`scripts/verify-edge-shared-in-sync.mjs:8-19`). A local build therefore silently repairs a drift
that CI rejects.

**AC-2.4 — `src/integrations/supabase/client.ts` is generated but carries a deliberate hardening.**
It uses `window.sessionStorage` for auth storage, guarded for SSR, never `localStorage`. The file is
header-marked "generated, do not edit". Regenerating it drops the hardening, so the line must be
re-applied by hand afterwards.
_Source:_ `src/integrations/supabase/client.ts:1` (banner), `:2-5` (hardening note), `:18`
(`storage: typeof window !== "undefined" ? window.sessionStorage : undefined`). `established fact`.
_Enforcement:_ **gated, by source scan.** `src/test/auth-hardening-static-safety.test.ts:19-22`
requires `window.sessionStorage` and forbids `localStorage` in this file, so a regeneration that
drops the line fails the required test shards. An earlier version called this `convention only`;
the test predates the first stamp.

---

## 3. Module layering

**AC-3.1 — Business logic lives in typed modules, not in JSX.**
The intended layering is constants → `*Rules.ts` (pure) → `*Service.ts` (I/O) → `*ViewModel.ts`
(presentation shaping) → components and pages as presenters, with hooks as the React data seam.
_Source:_ `AGENTS.md` Architecture Rules; `src/lib/`. `established fact`.

**AC-3.2 — `*Rules.ts` means pure and deterministic: no React, no Supabase, no fetch, no ambient
clock, no randomness. Time is injected.**
This is the contract for **new** code, not a description of every existing file. Re-measured at the
stamped SHA, over the root-level `src/lib/*Rules.ts` glob:

| Measure                               | Count | Files                                                              |
| ------------------------------------- | ----: | ------------------------------------------------------------------ |
| `*Rules.ts` files                     |   517 | —                                                                  |
| contain a direct `Date.now()` call    |    55 | raw-text match                                                     |
| contain a direct `Math.random()` call |     7 | the seven named in `CLAUDE.md` "Layering, as actually practised"   |
| import the Supabase client            |     2 | `sensorIngestNormalizationRules.ts`, `sensorWebhookIngestRules.ts` |

Those files are legacy, not precedent. Do not cite them, and do not extend the pattern.
_Source:_ `AGENTS.md`; counts measured by `ls` and `grep -l` at the stamped SHA. The narrative drift
inventory is in `CLAUDE.md`. `docs/codebase-map.md` records only the two Supabase importers
(`:466-467`), and an earlier version wrongly pointed here for the `Date.now()` / `Math.random()`
drift. `established fact`.
_Enforcement:_ `convention only`.

**AC-3.3 — Copy that is pinned, reused, or safety-bearing is data, not markup.**
Such strings live in `src/constants/*Copy.ts` / `*Messages.ts` or as `as const` exports in rules
modules, so tests can pin exact wording.

**Scope, narrowed to what is true.** This is not a blanket rule and never was. The stamped tree keeps
ordinary presentational prose inline in JSX across many pages, and stating the invariant without
qualification would declare most existing presentation code noncompliant and mislead reviewers. The
boundary is purpose, not location: **copy a test pins, copy reused across surfaces, and copy that
carries a safety or entitlement claim** belong in constants. One-off page prose may stay inline.

**The earlier example was a poor one, and is recorded as drift instead.** Earlier versions offered
`src/pages/GuidesIndex.tsx:57-68` as representative inline prose. That block inlines copy the clause
says belongs in constants:

- `:60` inlines the pinned positioning tagline, which lives at
  `src/constants/verdantPositioningCopy.ts:20`;
- `:63` inlines the reused safety claim "Verdant cannot touch your equipment.".

Treat that block as legacy drift, not precedent.
_Source:_ `src/constants/`; `src/pages/GuidesIndex.tsx:60,63`; `src/constants/verdantPositioningCopy.ts:20`.
`established fact` for the constants pattern and the drift; `inference` for the boundary.

**AC-3.4 — Component code routes through the react-router compat shim, not TanStack Router
directly.**
`src/lib/react-router-compat.tsx` re-implements the react-router-dom v6 surface on TanStack Router.
Measured at the stamped SHA, **743** files statically import the shim (511 under `src/test`, 131
under `src/components`, 94 under `src/pages`, 7 under `src/hooks`). **Zero** files under
`src/components/` or `src/pages/` mention `@tanstack/react-router` at all. Vitest aliases the shim to
a real MemoryRouter, so idiomatic TanStack hooks in a component look correct and fail in tests.
_Source:_ `src/lib/react-router-compat.tsx`; the Vitest alias is at `vitest.config.ts:50-52`. The count
is by import statement, cross-checked with Bun's import scanner. The same method gives 682 at the
first stamp, which recorded 683. The shim's `useNavigate` now returns the navigate promise, which
does not affect this clause. `established fact`.
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

**Known defect in the "resolves to `invalid`" half: prototype keys.** `normalizeSensorSource` returns
`ALIAS[v] ?? "invalid"` over a plain object literal. So two inputs return an inherited prototype member
instead of `invalid`:

- `"constructor"` returns a function;
- `"__proto__"` returns an object.

Neither result is a `SensorSource`. Both are still **non-healthy**, because `isHealthySensorSource` is
`=== "live"`. So "never healthy" holds, and "always one of the six" does not. The defect predates
the first stamp. A guard exists as `fd33e8ff9` (`guard normalizeSensorSource against prototype
keys`), but only on the unmerged, stacked PR #1620. It is recorded here and not fixed, because this
contract is not a code slice.

**Schema is wider than the resolved vocabulary — recorded, not narrowed here.** The latest
`validate_sensor_reading` trigger (migration `20260617164759_…`) admits **nineteen** `source`
tokens: the six above, plus `pi_bridge`, `sim`, `webhook_generic`, `node_red_bridge`,
`esp32_arduino`, `esp32_arduino_sht31`, `esp32_esphome`, `esp32_mqtt_bridge`,
`home_assistant_bridge`, `ha_forwarded`, `ecowitt`, `mqtt`, and `webhook`. That admit-list is the
storage contract for replayed and historically populated environments. **Schema-narrow (shrinking
the trigger to six, or rewriting historical rows) is OUT OF SCOPE for this contract and requires
its own approved migration slice — never do it as a drive-by.**

**The client write path is narrower than the schema.** The authenticated client insert policy admits
only `source IN ('manual', 'csv')`, with `auth.uid() = user_id`. The wider admit-list is reachable
only from server-side writers such as edge functions.

Read AC-4.1 as normalizer+display truth. AC-4.4 names the one **first-party write** that stores a
non-canonical token and promotes it to `live` on read. Other schema-admitted tokens may exist as
stored values without that promotion.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:16` (`SENSOR_SOURCES`), `:80` (`ALIAS[v] ?? "invalid"`),
`:86` (`=== "live"`); `src/constants/sensorIngestProvenance.ts:15`;
`supabase/migrations/20260617164759_407c0f40-1f3a-4ac8-a25e-289c175f87fc.sql:21-28` (trigger
admit-list; still the latest of the six migrations that define `validate_sensor_reading`); client
fence at `supabase/migrations/20260718054345_sensor_readings_client_source_fence.sql:14`, restated
at `20260827010000_sensor_readings_insert_current_contract.sql:16`. The prototype-key behaviour was
reproduced by running `normalizeSensorSource` under Bun at the stamped SHA. `established fact`.
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

| Helper                                                                 | Non-test callers                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `isRejectedSourceAlias` (`src/lib/sensorIngestProvenanceRules.ts:110`) | **zero**                                              |
| `isNonCanonicalSourceAlias`                                            | only the unused `isRejectedSourceAlias` wrapper above |

Do **not** claim that either helper binds generic ingest, client write paths, or edge functions. A
wrapper with no callers is not enforcement.

**Two real storage behaviours, distinguished:**

1. **Generic ingest (never-stored transport aliases at the storage boundary).**
   `supabase/functions/sensor-ingest-webhook/storageMapping.ts` maps inbound transport/vendor
   labels (`ecowitt`, `mqtt`, `webhook`, …) to a **canonical** stored `source` and keeps transport
   identity in `raw_payload` (`transport_source` / vendor). That path is the working
   "do not store the transport name as trust state" boundary for the generic webhook.
   **The mapping is a catch-all, not a list.** Any non-canonical input, including an unknown or
   missing label, maps to the candidate `live` (`:59-78`). That candidate is then narrowed: it is
   downgraded to `demo`, `stale` or `invalid` by the caller's reported confidence or Verdant source,
   or by the Windows-testbench rule (`:130-139`). It is then forced to `stale` from the server clock
   when `captured_at` is outside the freshness window (`:144-150`). So on this path, an unknown
   label on a fresh, undowngraded packet is stored as `live`, not `invalid`. That is the webhook's
   authenticated-bridge trust model, not the normalizer's unknown → `invalid` rule, and the two must
   not be confused.
2. **First-party Pi persist exception.** `pi-ingest-readings` deliberately stores `pi_bridge` as
   `sensor_readings.source` and the read normalizer promotes it to `live`. That is AC-4.4 — an
   exception, not a pattern — and it is outside the unused reject helpers entirely (edge code
   cannot import `src/lib` per AC-2.3).

Schema still admits the wider token set for historical rows (AC-4.1). Schema-narrow remains out of
scope.
**A second provenance envelope exists, and its tokens do not match the registry.** Manual rows now
carry `raw_payload.manual_provenance = { source: "manual", source_identity: "manual_entry",
transport: "manual", confidence: null }` (#1492). `source` stays `manual`, so AC-4.2 holds. But
`transport: "manual"` is not a member of `SENSOR_PROVENANCE_TRANSPORTS`, which spells it
`manual_entry`, and `source_identity` is a key the registry does not define. The divergence is
recorded rather than resolved here (§13).
_Source:_ `src/constants/sensorIngestProvenance.ts:1-13` (header), `:26-35`
(`SENSOR_PROVENANCE_TRANSPORTS`), `:39-47` (`SENSOR_PROVENANCE_APPS`), `:51-70`
(`NON_CANONICAL_SOURCE_ALIASES`, 18 tokens), `:130` (`isNonCanonicalSourceAlias`);
`src/lib/sensorIngestProvenanceRules.ts:110-112` (definition only; zero non-test callers in `src/`,
`supabase/` or `scripts/`); `supabase/functions/sensor-ingest-webhook/storageMapping.ts:4-8,59-78,130-150,161,174-178,185`;
`src/lib/manualSensorProvenanceRules.ts` (#1492). The consumer set was established by grep at the
stamped SHA. The reasoning is adjudicated in `docs/audits/architecture-audit-adjudication-2026-08-21.md`
§5. `established fact`.
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

**Corrected: the `aiDoctorEngine.ts` drift is not type-level only.** Its `classifySource`
(`src/lib/aiDoctorEngine.ts:266-276`) returns `"live"` for every source that is not `csv` or
`manual`, including `demo` and unknown labels, unless `quality` is `stale` or `invalid`. That is a
promotion to `live` in code. It mislabels nothing today only because the path is unreachable:

- its only caller is the legacy `compilePlantContextFromRows` in the same file (`:291`);
- that function's only caller is `compilePlantContext` (`:389-397`), which passes `sensorReadings: []`;
- `compilePlantContext` has no non-test callers.

The live AI Doctor path goes through the unrelated same-named function in
`src/lib/aiDoctorContextCompiler.ts`. **Wiring the legacy engine back in would reintroduce a
demo-to-live promotion.** The `ai/types.ts` drift remains type-level. Nothing structurally prevents
the next divergence from being a reachable one.

**The contract for `src/`:** new code under `src/` imports `SensorSource` from
`src/lib/sensor/sensorSourceRules.ts`. New inline union literals over source names are not
permitted there. The two divergences above are grandfathered and allowlisted so that the count can
shrink but not grow. **Edge functions are out of this import rule** — they cannot import `src/lib`
(AC-2.3), and `sensorSourceRules.ts` has no `_shared` mirror today; an edge ingest path needs its
own mirrored or local vocabulary, not a forbidden cross-import.
**"Roughly ninety", measured.** Single-line union literals over two or more of the source names,
outside tests:

- **76 lines in 66 files**, identical to the count at the first stamp, so the number has not grown;
- a wider pattern that also counts `"stale" | "invalid"` pairs, which catches quality unions, gives
  105 lines in 85 files;
- multi-line unions add 12 matching lines in 6 files.

_Source:_ `src/lib/sensor/sensorSourceRules.ts:16`; `src/constants/sensorIngestProvenance.ts:15`;
`src/lib/ai/types.ts:15`; `src/lib/aiDoctorEngine.ts:151,266-276,291,389-397`; counts by `grep -rnE`
over `src/**/*.{ts,tsx}` excluding `src/test/` and `*.test.*` / `*.spec.*`. `established fact` for the
declarations, the two drifts and the unreachable promotion; `inference` for the risk assessment.
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
`supabase/functions/pi-ingest-readings/commitBatch.ts:40,108,130` (`:108` refuses any source other
than `pi_bridge`); `src/lib/sensor/sensorSourceRules.ts:24-26,86`;
`src/lib/sensorLiveMembership.ts:70-73` (`VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES` = `{live, pi_bridge}`);
`supabase/functions/sensor-ingest-webhook/storageMapping.ts`. `established fact`.

**AC-4.5 — The `TRUST_LIVE_ALIASES` pin is one-directional, and the comment beside it overstates
what it enforces.**
`sensorSourceRules.ts:46` says "Keep `TRUST_LIVE_ALIASES` and `ALIAS` live entries aligned", but the
loop below it can only **add** aliases missing from `ALIAS`. It cannot detect an `ALIAS` live-entry
absent from `TRUST_LIVE_ALIASES` — which is exactly the state `pi_bridge` is in
(`TRUST_LIVE_ALIASES = {live, sensor, realtime}`). The invariant as stated is stronger than the
invariant as enforced. A second overstatement sits beside the constant: the doc comment at
`sensorLiveMembership.ts:76-77` calls these "Trust-label aliases that normalizeSensorSource maps to
live". But `pi_bridge` also maps to `live` and is not listed.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:46-51`; `src/lib/sensorLiveMembership.ts:76-79`.
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
_Enforcement:_ **partially gated, and not by a required check.** `scripts/sensor-safety-check.mjs`
statically refuses the following, across `ROOTS = ["src/lib/sensor", "src/components/sensor"]` (`:14`):

- fake-live wording, automation language, device-control wording and any `service_role` mention
  (`:17-23`);
- "healthy" on the same line as a degraded token unless the line negates it (`:25-26,72-80`).

That is five files at the stamped SHA. It does **not** scan `src/lib/sensors/`, the root-level
`src/lib/sensor*.ts` modules, or edge functions. It is **not** invoked by `ci.yml`, which supplies
every required context. It runs from:

- the pre-commit hook, through `scripts/assert-docs-safety.mjs`;
- `vitest-batched-full-suite.yml`, on manual dispatch only;
- `release-receipt-ci.yml`, on `main` only;
- a path-filtered strain-library gate.

---

## 5. AI Doctor

**AC-5.1 — Inference is reached through the Lovable AI gateway.**
`https://ai.gateway.lovable.dev/v1/chat/completions`, credentialed by a server-side-only
`LOVABLE_API_KEY`. Three functions call the gateway for inference: `ai-doctor-review`, `ai-coach`,
`ai-cultivar-qa`. No other function calls a chat-completions provider. No non-test file under `src/`
references the gateway URL or the key.

**The key is not AI-specific.** `LOVABLE_API_KEY` is also read by the email functions
(`auth-email-hook`, `handle-email-suppression`, `preview-transactional-email`,
`process-email-queue`) and by the Paddle connector in `_shared/paddle.ts`. So "who holds
`LOVABLE_API_KEY`" is a wider question than "who reaches the AI gateway". Rotating or scoping the key
touches billing and email too.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:65` (`GATEWAY_URL`), `:307` (key read), `:502`
(fetch); `ai-coach/index.ts:288,611`; `ai-cultivar-qa/index.ts:73,91`; wider key readers found by grep
over `supabase/functions/`. `established fact`.

**AC-5.2 — Model and tier are server constants. The client cannot influence either.**
`MODEL` and `MODEL_TIER` are module-level constants, not request-derived; the client cannot set
model, tier, weight, plan, or `user_id`, and therefore cannot self-discount. `user_id` comes from
`auth.getUser()`. At the stamped SHA the pinned values are `MODEL = "google/gemini-3-flash-preview"`,
`FEATURE = "ai_doctor_review"` and `MODEL_TIER = "standard"`. Those values are dated evidence. The
invariant is that they are server constants, and changing the model is a provider decision outside
this contract.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:13` (the "decided SERVER-SIDE" comment),
`:66-69` (constants), `:282-284` (`auth.getUser()`). `established fact`.
_Enforcement:_ structural — there is no code path from the request body to either constant.

**AC-5.3 — Model output is structured and validated, never free text.**
The call forces a single tool (`tool_choice: {type: "function", function: {name:
"submit_ai_doctor_review"}}` against `TOOL_SCHEMA`), and the returned arguments are parsed and
schema-checked before use. Raw model text is never returned to the client, written to a row, or
logged; logs carry safe status and reason codes only.
_Source:_ `supabase/functions/ai-doctor-review/index.ts`:

- `:2` ("Never returns raw model text") and `:14` (the safe-log rule);
- `:81` (`TOOL_SCHEMA`) and `:515-519` (the live `tools` and `tool_choice`);
- `:575` (`JSON.parse`), `:581` (`validateAiDoctorReviewResult`), `:586` (the grounding check);
- `:643-644` (`readToolArguments`).

`:179-180` repeat `tools` / `tool_choice` inside the HMAC signing frame, not the live request.
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

**There are now two sites carrying this exception, not one.** #1324 changed
`aiDoctorManualTentSensorSnapshotAdapter.ts` from a strict `quality !== "ok"` reject, under which
null was rejected, to its own null-compatible `hasUsablePersistedQuality`. So the exception now also
covers tent manual rows feeding AI Doctor context. Any change to the null rule must change both
sites together.

**Selection changed since the first stamp; the labels did not.** #1324, #1335, #1345 and #1361
changed how current evidence is chosen:

- live and manual rows are built as separate cohorts;
- a usable live row wins, and otherwise an in-window manual row wins, even over a newer but stale
  live row;
- the stale window depends on the source (`resolveCurrentStateStaleWindowMs`: manual 24 h, live
  15 min);
- a fresh manual row is classified `usable`;
- `currentSensorEvidenceIsFreshLive` is live-only.

Throughout, manual rows keep `source = manual`. They are accepted as manual evidence, never
promoted to live, so this clause holds.

Grounding is reject-only: the backstop refuses ungrounded output rather than rewriting it.
_Source:_ `src/lib/aiDoctorCurrentSensorSnapshotRules.ts:115-117` (null → `true` at `:116`), gate at
`:193`; mirror `supabase/functions/_shared/lib/lib/aiDoctorCurrentSensorSnapshotRules.ts:120-122`,
gate `:198`; `src/lib/aiDoctorManualTentSensorSnapshotAdapter.ts:58-61`, gate `:161`, and its
mirror. Stale windows: `src/lib/sensorTruthCanon.ts:100-104` over `src/constants/sensorTiming.ts:52,80`.
Live-only freshness: `src/lib/aiDoctorCurrentSensorSnapshotRules.ts:396`. Reject-only grounding:
`src/lib/aiDoctorReviewGroundingRules.ts:5`, or `:10` in the `_shared`
mirror. Earlier versions cited `:116,194` and a bare `:10`, which were already off by the mirror's
generated-header offset. `established fact`.

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
_Source:_ client read `src/hooks/useMyEntitlements.ts:90` (`.from("subscriptions")`); server read
`supabase/functions/_shared/unionEntitlementLookup.ts:127`. A null row resolves to Free
(`null_row_free`) in `src/lib/entitlements/resolveEntitlements.ts:94-109`. See `AGENTS.md`
Monetization rules. The only non-test read of `billing_subscriptions` is a legacy read during
account deletion (`supabase/functions/delete-account/index.ts:84`), which grants nothing.
`established fact`.

**Billing changes since the first stamp leave this clause intact.** #1375 blocks a founder purchase
after an earlier refund. #1388 routes approved Paddle refund adjustments to revoke. #1373, #1374 and
#1398 add founder-refund migrations. All of them only revoke or deny founder rows in `subscriptions`
more strictly, through service-role paths. None of them touches `src/lib/entitlements/`,
`ai_credit_*`, `billing_subscriptions` or `profiles.tier`.

> **Naming hazard, recorded so it is not mistaken for a violation.** The row type is named
> `BillingSubscriptionRow` (`src/lib/entitlements/types.ts:21`) and its doc comment still refers to
> `public.billing_subscriptions` (`:17`), while the actual read is from `subscriptions`. The behaviour
> is correct; the name is misleading. Renaming is a `convention only` cleanup, not a contract
> change — but do not "fix" the read to match the type name.

**AC-6.2 — Capability logic lives in `src/lib/entitlements/*`, expressed as capabilities rather than
plan comparisons.**
Prefer `canUseCapability(entitlement, "advancedExports")` over `if (plan === "pro")`. Plan gates do
not belong in JSX.
_Source:_ `src/lib/entitlements/capabilities.ts`, `src/lib/entitlements/capabilityAccess.ts:13-18`
(`canUseCapability`), `src/lib/entitlements/planCatalog.ts`. `established fact`. Two display-only
plan-id comparisons exist in pages (`src/pages/Pricing.tsx:304`, `src/pages/Settings.tsx:324`). Both
predate the first stamp, and neither is a capability gate. They are drift, not precedent.

**AC-6.3 — `resolveEntitlements` is pure and takes `now` as a parameter.**
It has no React, no Supabase, no fetch, and no internal clock, so entitlement resolution is
deterministic and testable at any instant.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:1-16` (docblock), `:18-26` (the only
imports: sibling entitlement modules and an import-free rules file), `:87-90` (signature takes
`now: Date`). `established fact`.

**AC-6.4 — Client entitlement reads are presentation-only; the server is authoritative for cost and
security.**
The staff override lifts capabilities for presentation and is explicitly never authoritative: AI
credit spend stays capped and metered server-side regardless.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:7-15`. Server-side, staff are still metered, at
a 10,000-per-month cap (`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:257-262`).
`established fact`.

**AC-6.5 — Founder Lifetime is Pro-like access with capped AI credits. It is never unlimited AI.**
`planCatalog` hard-pins `founder_lifetime.aiMonthlyCredits` at **100**. Server-side,
`ai_credit_allowance('founder_lifetime')` returns the same monthly cap, and `ai_credit_spend`
resolves founder rows through that allowance before metering — so the cap is a **runtime boundary**,
not an unenforced peer review hope.
_Source:_ `src/lib/entitlements/planCatalog.ts:9-12,46-50,58` (`aiMonthlyCredits: 100` at `:48`).
The effective `ai_credit_allowance` is at
`supabase/migrations/20260721194118_d777533e-a1d4-4b36-a75e-ea7742e7cd6e.sql:15-38`
(`founder_lifetime THEN 100` at `:35`). The effective `ai_credit_spend` is at
`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:31`: it reads `public.subscriptions`
(founder branch `:239`) and calls `ai_credit_allowance(v_plan_id)` at `:255`. See also `AGENTS.md`
Monetization and AI Credit rules. Earlier versions pointed at a `*ai_credit*` filename glob, which
misses the effective allowance file. `established fact`.
_Enforcement:_ **runtime boundary** — see §11.

---

## 7. Action Queue

**AC-7.1 — The Action Queue is approval-required, and its default state says so.**
Rows default to `pending_approval`. AI and alerts may suggest; the grower decides. Verdant does not
execute device commands, and there is no device-control surface to add one to.
_Source:_ the row default is `status text NOT NULL DEFAULT 'pending_approval'`
(`supabase/migrations/20260520153605_05bd55b2-5cf8-4c1f-9fac-ebb4a328736c.sql:16`).
`src/lib/actionQueueCreateRules.ts:198` is the client-side fallback when parsing the RPC response, not
the row default. Also `src/lib/actionQueueProvenanceRules.ts:175,187`. `established fact`.

**AC-7.2 — No affordance may make approval accidental.**
Keyboard navigation never maps a key to Approve, Reject, Retry, Complete or Cancel; presentation
must not imply an action is already approved or executed.
_Source:_ `src/lib/actionQueueKeyboardNavigationRules.ts:8`;
`src/lib/actionQueueEvidenceViewModel.ts:53,62`. `established fact`.

**AC-7.3 — Action Queue items are not auto-created.**
Alerts and AI Doctor output do not write queue rows unless a task explicitly asks for it.

**The one edge path that does insert queue rows is explicit, not automatic.**
`create-breeding-suggestions` inserts into `action_queue`. It is invoked only by a grower action
(`src/components/genetics/BreedingLogContainer.tsx:141`), runs under the caller's JWT with the anon
key so RLS applies, and writes `status: "pending_approval"` workflow reminders. That fits this clause.
A second automatic writer would not.
_Source:_ `AGENTS.md` Action Queue Rules; AC-5.5; `supabase/functions/ai-doctor-review/index.ts:8`
and `supabase/functions/ai-cultivar-qa/index.ts:14` (no queue writes);
`supabase/functions/create-breeding-suggestions/index.ts:88-91`;
`src/lib/genetics/breedingActionQueue.ts:61`. `established fact`.

---

## 8. Toolchain and dependency management

**AC-8.1 — Bun is canonical; `package-lock.json` is a synchronized compatibility artifact.**
`bun.lock` is authoritative. The npm lockfile exists for compatibility and must stay in sync; it is
never the source of truth.
The repository has `bun.lock`, a text lockfile, and `package-lock.json`. **There is no `bun.lockb`.**
Governance prose that calls `bun.lockb` authoritative is stale.
_Source:_ `scripts/check-bun-lockfile-policy.mjs:5` ("Bun and bun.lock are canonical"), `:22`
(`REQUIRED_LOCKFILES`), `:175-180` (the canonical check and throw); `bunfig.toml`. `established fact`.
_Enforcement:_ **gated.** `src/test/check-bun-lockfile-policy.test.ts:387` runs the checker against
the repository in the required test shards. It requires both files and rejects a transition config
that does not keep Bun canonical. The non-required `dependency-security-ci.yml` also runs it.

**AC-8.2 — New dependency versions wait 24 hours.**
`bunfig.toml` sets `minimumReleaseAge = 86400` as a supply-chain guard. Each entry in
`minimumReleaseAgeExcludes` bypasses it for one package and must be confirmed with the owner before
being added.
_Source:_ `bunfig.toml:4` (`minimumReleaseAge`), `:7` (six excludes, all `@lovable.dev/*`:
`vite-tanstack-config`, `mcp-js`, `vite-plugin-dev-server-bridge`, `vite-plugin-hmr-gate`, `email-js`,
`webhooks-js`). `established fact`.

**AC-8.3 — TypeScript strictness is deliberately partial.**
`tsconfig.json` runs `strict: true` while keeping `noImplicitAny: false` and three further flags
off, with the reasons recorded in the file. Turning them on is a project, not a side quest.
_Source:_ `tsconfig.json:16` (`strict`), `:34` (`noImplicitAny`), `:35-37`
(`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
with the rationale at `:22-33`. `established fact`.

**AC-8.4 — `server-only` is banned.**
It is a Next.js idiom. Use `*.server.ts` or `@tanstack/react-start/server-only`.
_Source:_ `eslint.config.js:34-45` (`no-restricted-imports`, `server-only` at `:39`). `established fact`.
_Enforcement:_ **gated.** It is an ESLint error, and ESLint runs in the required
`Lint, typecheck, test, build` job.

---

## 9. Migration history

**AC-9.1 — A merged migration is permanent history and is never edited.**
Not to correct it, not to no-op it, not because it "could never have succeeded anywhere". Ship a new
additive migration instead. Editing history does not change what already ran; it changes what a
freshly provisioned environment ends up with, silently.
_Source:_ `AGENTS.md` Migration Immutability Rules. `established fact`.
_Enforcement:_ **partially gated.** `.github/workflows/published-migration-integrity.yml` compares
SHA-256 against the PR's base branch: path filter at `:18-23`, job at `:30-31`, gate step at
`:67-73`, hashing in `scripts/verify-published-migration-integrity.mjs`. The check runs on every PR
that touches `supabase/migrations/**`, and a red result is visible. **It is not one of the 35
required contexts**, nor in `mustBeGreen`, in `config/required-status-checks.json`, captured
2026-08-10. By that mirror, a red result would not block a merge. Whether the live ruleset requires
it is `NOT_MEASURED`.

> Earlier versions called this **gated**, and `AGENTS.md` says the check "will fail the PR". Both
> are true of the check's result. Neither establishes that the result blocks the merge queue.

**AC-9.2 — When a published migration is genuinely broken, the sanctioned mechanism patches a
disposable copy.**
`config/local-supabase-replay-compatibility.json` declares per-file entries in three categories,
each checked by hash, and applies them to a copy inside a disposable workdir at replay time:

| Category                   | Entries | Hash check                                |
| -------------------------- | ------: | ----------------------------------------- |
| `compatibility_noops`      |      18 | `canonical_sha256` and `duplicate_sha256` |
| `compatibility_patches`    |       4 | `source_sha256`                           |
| `compatibility_injections` |       2 | `template_sha256`                         |

Earlier versions named only the first two categories and attributed `source_sha256` to both. The committed file is never modified. Check this config **before** proposing
any correction — the defect may already be handled, in which case the correct change is none.
_Source:_ `config/local-supabase-replay-compatibility.json`; `AGENTS.md`. `established fact`.

**AC-9.3 — A merge is not a deployment, a committed migration is not an applied one, and a
published frontend is not deployed edge code.**
Never infer applied schema, or deployed function code, from repository presence.

**Three artifacts, three different paths, none of them a merge:**

| Artifact       | What the repository establishes                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend       | reaches an environment through the publish/build path                                                                                                                    |
| Migrations     | reach an environment through a separate operator apply path                                                                                                              |
| Edge functions | **not** deployed by any workflow under `.github/workflows/` (grep at the stamped SHA). Separate `supabase functions deploy` scripts exist in `package.json` / `Makefile` |

**Who triggers edge deploy is `NOT_MEASURED` from the repository alone.** Absence of a GitHub
Actions deploy proves only that Actions does not deploy them. A `Makefile` comment
(`functions-deploy: … # Lovable does this automatically`) is **comment text, not measurement** —
do not treat it as publisher evidence. Label the edge path as separate and environment-verified;
do not assert "manual only" or "Lovable automatic" until the publish trigger is measured
(§14; release topology deferred — #1221 / #1175).

An earlier draft said publishing "ships frontend and edge functions". No repository evidence supports
an automatic joint ship, and a release operator relying on it could publish a frontend expecting
newer edge code while the backend stays stale.
_Source:_ `package.json:20-21` (`deploy:functions`, `deploy:functions:all`) and `:218`
(`sb:functions:deploy`). The Actions absence was established by grep over `.github/workflows/` at the
stamped SHA for `functions deploy`, `supabase functions`, `supabase link` and `db push`: only comments
and help text match. The seven workflows that install the Supabase CLI run local stacks only.
`Makefile:77-78` holds the `functions-deploy` target and its comment (non-authoritative). See also
`AGENTS.md`.
`established fact` for the scripts and for the Actions absence; trigger identity `NOT_MEASURED`.

---

## 10. Statistical methods are bounded by evidence

**AC-10.1 — VPD drift uses an EWMA with fixed default parameters. They are documented here, not pinned by a test.**
`DEFAULT_VPD_DRIFT_ALPHA = 0.3` and `DEFAULT_VPD_DRIFT_MIN_READINGS = 6`, with the recurrence
`ewma = α·v + (1−α)·ewma` and classifications `insufficient` / `in_band` / `sustained_high` /
`sustained_low`. An α outside `(0, 1]` is **replaced with the default** — a fallback, not a clamp: an
input of `5` becomes `0.3`, not `1`. The module is mirrored into `_shared` per AC-2.3. **Do not
silently move α to 0.2.**
_Source:_ `src/lib/vpdDriftRules.ts:20` (classifications), `:56-57` (defaults), `:64-65` (fallback),
`:67-70` (minimum readings), `:86` (recurrence);
`supabase/functions/_shared/lib/lib/vpdDriftRules.ts` (byte-identical apart from its generated
header). Re-checked at the stamped SHA: zero references to `DEFAULT_VPD_DRIFT_ALPHA` or
`DEFAULT_VPD_DRIFT_MIN_READINGS` outside the two source files. `established fact`.
_Enforcement:_ **`convention only` — the parameter is NOT pinned.** An earlier draft claimed
`src/test/vpd-drift-ewma.test.ts` pinned it. It does not: that file never references `alpha`,
`DEFAULT_VPD_DRIFT_ALPHA` or `0.3`, and its classification cases are broad enough to keep passing if
the default moved to 0.2. Claiming a pin that does not exist is the precise failure this document
exists to prevent, so it is corrected rather than quietly dropped. An exact resolved-value assertion
is proposed as **T6** in §11.

**AC-10.2 — Nelson Rules and Modified Z-Score / MAD are NOT implemented, and must never be
described as implemented.**
Case-insensitive search across `src/` and `supabase/` at the stamped SHA returns **zero** hits for
`nelson`, `modified z`, `modifiedZ`, `median absolute deviation`, `\bMAD\b`, `z-?score`, `zscore`
or `robust ?z`. The only repository mention of Nelson is the 2026-08-21 adjudication recording that it is
not implemented.
_Source:_ measured at the stamped SHA; `docs/audits/architecture-audit-adjudication-2026-08-21.md`
§4.1. `established fact`.

**AC-10.3 — Both are rejected, not deferred. See §12.**

---

## 11. Enforcement map

Honest accounting of which clauses are held by a gate and which by convention. **All 48 clauses
are classified below** (no omissions). §0.2 promises each clause names the mechanism that keeps it
true; a clause missing from this table would be an unstated gap.

| Clause  | Enforcement                                                                                                                                      | Kind                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| AC-1.1  | build / regeneration                                                                                                                             | structural          |
| AC-1.2  | regeneration overwrite (route tree, `_shared`); `TREE_HASH_ROOTS` + codegen-safety test (MCP bundle); `types.ts` by convention                   | **partially gated** |
| AC-1.3  | URL-set parity, `/operator/` shape, operator/internal ↔ `_operator` layout, `/sensors/*` both ways; general auth ↔ `_app` parity unenforced (T7) | **partially gated** |
| AC-1.4  | `vite-dev-server-binding.test.ts` pins the ESM import path; no-duplicate-plugin rule by review                                                   | **partially gated** |
| AC-1.5  | comment and review — explicit CSRF registration; no test references it                                                                           | `convention only`   |
| AC-1.6  | comment and review                                                                                                                               | `convention only`   |
| AC-1.7  | `funnel-event-db-sink.test.tsx` source-scan pins sink-before-Outlet order                                                                        | **gated**           |
| AC-1.8  | lockfile + 24 h release-age guard (AC-8.2); major-line moves by review                                                                           | `convention only`   |
| AC-2.1  | shape of the code as written                                                                                                                     | structural          |
| AC-2.2  | RLS and server-side checks at runtime                                                                                                            | runtime boundary    |
| AC-2.3  | required `Preflight — edge shared-lib mirror in sync` (`--check-only`); local prebuild auto-repairs instead of failing                           | **gated**           |
| AC-2.4  | `auth-hardening-static-safety.test.ts` source-scan requires `sessionStorage`, forbids `localStorage`                                             | **gated**           |
| AC-3.1  | comment and review                                                                                                                               | `convention only`   |
| AC-3.2  | comment and review                                                                                                                               | `convention only`   |
| AC-3.3  | comment and review — pinned/reused/safety copy in constants; inline JSX prose allowed                                                            | `convention only`   |
| AC-3.4  | comment and review                                                                                                                               | `convention only`   |
| AC-4.1  | no gate proves resolved vocabulary is not widened; schema width is measured fact; T2/T3 proposed                                                 | **unenforced**      |
| AC-4.2  | `isRejectedSourceAlias` has zero non-test callers — unused helpers are not an ingest gate                                                        | **unenforced**      |
| AC-4.3  | comment and review; T3 proposed                                                                                                                  | `convention only`   |
| AC-4.4  | comment and review — deliberate Pi exception                                                                                                     | `convention only`   |
| AC-4.5  | one-directional only                                                                                                                             | `convention only`   |
| AC-4.6  | `scripts/sensor-safety-check.mjs` — wording heuristic over 5 files; pre-commit and non-required workflows only, not `ci.yml`                     | **partially gated** |
| AC-5.1  | shape of the code as written                                                                                                                     | structural          |
| AC-5.2  | no code path from the request body to the model constants                                                                                        | structural          |
| AC-5.3  | shape of the code as written                                                                                                                     | structural          |
| AC-5.4  | UUID syntax check plus **atomic RPC** spend/refund/conflict; `scripts/run-ai-credits-rls-harness.ts`                                             | runtime boundary    |
| AC-5.5  | product-safety commitment held by review and by absence of cultivation/queue writes                                                              | **unenforced**      |
| AC-5.6  | shape of the code as written — null/missing quality still contributes                                                                            | structural          |
| AC-5.7  | output **shape** enforced by tool schema + grounding validator; **one-photo ceiling convention-only**                                            | **partially gated** |
| AC-5.8  | shape of the code as written                                                                                                                     | structural          |
| AC-6.1  | RLS and server-side checks at runtime                                                                                                            | runtime boundary    |
| AC-6.2  | comment and review                                                                                                                               | `convention only`   |
| AC-6.3  | shape of the code as written                                                                                                                     | structural          |
| AC-6.4  | RLS and server-side checks at runtime                                                                                                            | runtime boundary    |
| AC-6.5  | `ai_credit_allowance` + `ai_credit_spend` cap founder at 100/month                                                                               | runtime boundary    |
| AC-7.1  | product-safety commitment held by review                                                                                                         | **unenforced**      |
| AC-7.2  | product-safety commitment held by review                                                                                                         | **unenforced**      |
| AC-7.3  | product-safety commitment held by review                                                                                                         | **unenforced**      |
| AC-8.1  | `scripts/check-bun-lockfile-policy.mjs` via `check-bun-lockfile-policy.test.ts` in the required shards                                           | **gated**           |
| AC-8.2  | comment and review                                                                                                                               | `convention only`   |
| AC-8.3  | comment and review                                                                                                                               | `convention only`   |
| AC-8.4  | ESLint                                                                                                                                           | **gated**           |
| AC-9.1  | `Published migration integrity` runs on migration PRs; not a required context per the 2026-08-10 mirror                                          | **partially gated** |
| AC-9.2  | comment and review                                                                                                                               | `convention only`   |
| AC-9.3  | comment and review — edge trigger identity `NOT_MEASURED`                                                                                        | `convention only`   |
| AC-10.1 | **nothing** — `src/test/vpd-drift-ewma.test.ts` does not assert α; T6 is the proposed pin                                                        | **unenforced**      |
| AC-10.2 | absence of Nelson / MAD implementations; T5 proposed                                                                                             | **unenforced**      |
| AC-10.3 | product decision recorded in §12                                                                                                                 | **unenforced**      |

**Count check:** 48 rows above = 48 clauses (AC-1.8 added in the 2026-09-22 amendment). Kinds used: **gated**, **partially gated**,
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

| ID  | Test                                                                                                                                                                         | Guards        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| T1  | Every path cited by a clause in this file exists at the stamped SHA                                                                                                          | this document |
| T2  | `SENSOR_SOURCES` and `CANONICAL_SENSOR_SOURCES` resolve **equal** — by import and object comparison, not by regex                                                            | AC-4.1        |
| T3  | No module outside the two canonical files declares a sensor-source union literal, with the two known drifts allowlisted so the count can shrink but not grow                 | AC-4.3        |
| T4  | `MODEL` and `MODEL_TIER` are module constants and not request-derived                                                                                                        | AC-5.2        |
| T5  | Zero occurrences of Nelson / modified-Z / MAD across `src/` and `supabase/`                                                                                                  | AC-10.2       |
| T6  | `DEFAULT_VPD_DRIFT_ALPHA === 0.3`, `DEFAULT_VPD_DRIFT_MIN_READINGS === 6`, and one exact numeric recurrence step                                                             | AC-10.1       |
| T7  | Every route's declared `access` matches the layout it is mounted under for `auth` ↔ `_app` and `public` ↔ public roots — operator/internal parity is already tested (AC-1.3) | AC-1.3        |

**Each test needs the technique its claim actually admits — they are not all import tests.**

| Test | Technique                  | Why                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2   | **resolved import**        | Both are runtime `as const` arrays, so the values exist at runtime and can be compared as objects                                                                                                                                                                                                                                         |
| T3   | **source / AST scan**      | Sensor-source unions are **type-level and erased at runtime**. No import can observe a declaration that does not exist in the emitted output; finding declarations outside the canonical files needs AST                                                                                                                                  |
| T4   | **source / AST scan only** | `MODEL` and `MODEL_TIER` in `ai-doctor-review/index.ts` are **unexported** module constants, and importing that entrypoint executes `Deno.serve(...)`. A resolved-value import assertion is not available without a structure change; do not fake one. Scan for the const declarations and prove no request field reaches model selection |
| T5   | **source scan**            | Proving a token is **absent** is exactly what scanning is good for                                                                                                                                                                                                                                                                        |
| T6   | **resolved import**        | Both are exported runtime numbers; assert the values and one hand-computed EWMA step so a default change fails loudly                                                                                                                                                                                                                     |
| T7   | **route-tree traversal**   | Access group is a property of the mounted layout, so the check must walk the tree, not the manifest alone                                                                                                                                                                                                                                 |

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
| **Moving VPD α from 0.3 to 0.2**                       | **REJECTED** | Named explicitly in the 2026-08-21 adjudication as a change not to make silently. α is a tuned parameter that is **currently unpinned** (AC-10.1 / T6); do not assume CI catches a silent move                   |
| **Next.js migration**                                  | **REJECTED** | No source pressure. TanStack Start SSR is working, `server-only` is already banned as a foreign idiom (AC-8.4), and the cost is the whole route tree and the 743-file shim                                       |
| **Drizzle**                                            | **REJECTED** | Would sit beside an append-only migration history and generated Supabase types; introduces a second schema truth                                                                                                 |
| **tRPC**                                               | **REJECTED** | Server functions plus edge functions already cover the seam, and RLS — not a typed RPC layer — is the boundary that matters (AC-2.2)                                                                             |
| **Auth migration off Supabase Auth**                   | **REJECTED** | Auth, RLS, and `auth.uid()` are one system. Replacing the first breaks the authorization model                                                                                                                   |
| **Collapsing vendor/transport into `source`**          | **REJECTED** | Directly contradicts AC-4.2. Would let a vendor name imply health                                                                                                                                                |
| **Device control / automatic Action Queue**            | **REJECTED** | Product-level safety commitment, not a technical one (AC-7.1)                                                                                                                                                    |
| **Treating `vercel.json` as production configuration** | **REJECTED** | Its runtime directives are measured as not applied in production. Never reason about production redirects or headers from that file                                                                              |

---

## 13. Deferred

Not rejected — sequenced.

| Item                                                                                                    | Gate                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The gates T1–T7 in §11 (earlier versions of this row said T1–T5 while §11 proposed seven)               | Their own slice; T2 and T3 are the highest value                                                                                            |
| Consolidating `docs/architecture.md`, `docs/grow-os-architecture.md`, `docs/grow-diary-architecture.md` | All three predate or contradict the current stack in places; retiring them is a separate reviewed slice                                     |
| Enumerating the remaining sensor-source union re-declarations                                           | Bounded by T3 rather than by hand                                                                                                           |
| Renaming `BillingSubscriptionRow` (AC-6.1 hazard)                                                       | Cosmetic; touches entitlement types, so it wants its own diff                                                                               |
| An enforceable visual-evidence cardinality signal plus a confidence cap for AI Doctor (AC-5.7)          | Safety-bearing; needs a packet-shape change, so it is its own reviewed slice                                                                |
| Making the AC-4.5 pin bidirectional, or restating its comment                                           | Small, but it changes a safety-adjacent normalizer                                                                                          |
| Guarding `normalizeSensorSource` against prototype keys (AC-4.1)                                        | Already written as `fd33e8ff9` on unmerged PR #1620 (stacked on #1088); lands with that PR, not here                                        |
| Aligning the `manual_provenance` envelope with `SENSOR_PROVENANCE_TRANSPORTS` (AC-4.2)                  | Touches a persisted payload shape and its readers; needs its own reviewed slice                                                             |
| Retiring the unreachable legacy `classifySource` in `aiDoctorEngine.ts` (AC-4.3)                        | Deletion of dead code on a safety surface; its own diff, with a test that the live path is unaffected                                       |
| Making `Published migration integrity` a required context (AC-9.1)                                      | A ruleset change — Cheek's decision, not a code change                                                                                      |
| Removing the declared-but-unimported `@supabase/ssr` dependency (AC-2.1)                                | A dependency change; its own slice under AC-8.2                                                                                             |
| **Authoritative Release Topology Specification**                                                        | §14 — blocked on evidence this contract does not have; tracked via #1175 (with #1619 stacked on it) and #1221, both open at the stamped SHA |

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
  build configuration, response headers, Make comments, vendor SDKs, or tip-equals-live parity.
  Resolving it is the Release Topology Specification's job (§13; #1175 with #1619, and #1221).
- **Applied production schema is `NOT_MEASURED`** here and belongs to `docs/agents/CURRENT_STATE.md` (AC-9.3).
- **Per-table RLS policy state** is owned by migrations, not by this file.
- **Runtime drift among the 76–105 unenumerated sensor-source union literals** (the range depends on
  the pattern, AC-4.3) is `NOT_MEASURED`; two are confirmed divergent by reading, the rest were not
  enumerated.
- **A vendor telemetry SDK is not publisher evidence.** `@vercel/analytics` and
  `@vercel/speed-insights` were added in #1336 and render through
  `src/components/ConsentGatedVercelTelemetry.tsx`. A client-side analytics package says where
  telemetry is sent, not who builds, publishes, or serves the application. The same rule as for
  response headers applies.
- **Two product-surface facts that bear on topology but do not settle it.** The preset comment names
  Nitro's build-only default target as Cloudflare (`vite.config.ts:4`), and `prebuild` runs
  `restore-env-production-from-head.mjs` and `assert-paddle-production-sandbox.mjs` before the edge
  and stamp gates (`package.json:9`). Both are build inputs; neither measures the serving target or
  the publish trigger.

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

### 15.1 Amendment record

| Date       | Verified at                                | By     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | `7c46855b7fd49651cf8ed080a5a931ff8fbdd640` | Grok   | First stamp (PR #1281).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-22 | `387a00067a76ca9e2ced453d6b6a0f580e33209b` | Claude | Full §15 re-verification of all 47 clauses, 327 commits after the first stamp. Added AC-1.8 (stack majors). Corrected enforcement for AC-1.3, 1.4, 1.7, 2.4 (tests existed at the first stamp) and AC-4.6, 9.1 (not required checks). Recorded the AC-4.1 prototype-key defect, the AC-4.2 catch-all and registry divergence, the AC-4.3 unreachable promotion, the AC-5.6 second site, and the AC-7.3 explicit breeding writer. Corrected the AC-2.1 client-library and RPC claims. Re-pointed drifted citations. Carried the AC-1.4 preset internals and the AC-1.5 automatic-CSRF absence as `source claim` (not re-measurable without `node_modules`). |
