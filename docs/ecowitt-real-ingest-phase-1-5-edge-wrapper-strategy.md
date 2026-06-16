# EcoWitt Real Ingest — Phase 1.5: Edge Wrapper Strategy

## Status

- **Phase 1.5 does not enable live ingest.**
- **No endpoint is deployed** in this phase.
- **No payload is persisted.**
- **No sensor readings are stored.**
- **No live dashboard label is enabled.**
- Phase 2 persistence remains **blocked** until the strategy + token policy + parity-test plan + schema/RLS audit are approved.

## Deployability gap

| Layer                             | State                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/ecowittRealIngest*.ts`   | Pure TS, no Deno-incompatible imports, fully unit-tested.                      |
| Phase 1 handler                   | `src/lib/ecowittRealIngestEndpoint.ts` — exercised by Vitest, not by Edge.     |
| Supabase Edge runtime             | Functions in `supabase/functions/*` import only from `npm:` and `_shared/*`.   |
| Cross-boundary imports            | Edge cannot import `src/lib/*` (different tsconfig root, different runtime).   |

## Audit table

| Area                                       | Existing evidence                                                                                  | Safe for Edge wrapper today? | Risk                                                       | Decision                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Edge import convention                     | All existing fns import from `npm:` + `../_shared/*.ts` (e.g. `ecowitt-ingest/index.ts:31-40`)     | Yes for `_shared/` only      | Importing `src/lib` would break Deno resolution            | New code must live under `supabase/functions/_shared/` for Edge use      |
| Existing `_shared/` mirror precedent       | `supabase/functions/_shared/vpdRules.ts` is a documented subset mirror of `src/lib/vpdRules.ts`    | Established                  | Drift between mirror and lib                               | Mirror pattern is the repo's accepted answer to this exact problem       |
| Phase 0/1 core purity                      | Validator, redaction, dedupe, auth, endpoint helpers do no I/O, no Supabase, no fetch              | Content-safe to mirror       | None at content level                                      | Code is mirror-ready when strategy is approved                           |
| Edge config / deno.json                    | No `deno.json` / `import_map.json` / per-function tsconfig in repo                                 | Cannot share via path alias  | Reconfiguring would touch every fn                         | Do **not** introduce shared tsconfig in Phase 1.5                        |
| Bridge token storage                       | Existing `bridge_tokens` table is hashed-token + RLS; this is a *different* model (env-injected)   | Not yet                      | Conflating user bridge tokens with a single ingest secret  | Token policy must be designed before any wrapper is deployed             |
| Static safety scan                         | `src/test/ecowitt-real-ingest-static-safety.test.ts` covers Phase 0/1 lib files                    | Needs extension              | Edge wrapper would need its own scan rules                 | Extend scan when wrapper lands; do not weaken it now                     |
| Parity test infra                          | No existing parity harness between `src/lib/*` and `_shared/*`                                     | Missing                      | Mirror drift undetected                                    | Build fixture-driven parity tests before mirror is written               |

## Strategy options

### Option A — Move shared real-ingest core to an Edge-safe shared package/path

Promote `ecowittRealIngest*.ts` to a path importable by both Vite and Deno
(e.g. a `packages/ecowitt-real-ingest/` workspace, or a deno-friendly
relative path with `import_map.json`).

- **Pros:** Single source of truth. No drift. App and Edge share tests.
- **Cons:** Touches tsconfig/build/import paths repo-wide. Requires a
  workspace layout this repo does not currently use. High blast radius
  for the value delivered. None of the other Edge functions use this
  pattern.
- **Implementation impact:** large (tooling/layout change).
- **Test impact:** large (re-route every existing import).
- **Safety risk:** medium — refactor touches unrelated code.

### Option B — Mirror to `supabase/functions/_shared/ecowittRealIngest*.ts` with parity tests

Copy the pure modules into `_shared/` exactly as `vpdRules.ts` already
does. Add fixture-driven parity tests that run the **same inputs**
through `src/lib/*` (via Vitest) and assert the expected outputs; when
the mirror lands, the same fixtures drive a Deno-side parity check.

- **Pros:** Matches established repo convention. Thin Edge wrapper. No
  tooling changes. Easy to ship behind a feature flag.
- **Cons:** Two copies of the code; relies on parity tests + reviewer
  discipline to prevent drift.
- **Implementation impact:** small.
- **Test impact:** small (fixtures + parity assertions).
- **Safety risk:** low — bounded to four pure files, drift caught by tests.

### Option C — Keep Phase 1 lib-side only and defer Edge wrapper

Do not deploy any wrapper. Validator/handler remain unit-test surfaces
only. Real-ingest persistence track stays paused.

- **Pros:** Zero duplication, zero runtime risk.
- **Cons:** No deployable ingest endpoint; Phase 2 blocked indefinitely.
- **Implementation impact:** none.
- **Test impact:** none.
- **Safety risk:** none, but product risk: ingest never ships.

## Recommendation

**Option B**, with the following preconditions enforced before any
wrapper is created:

1. Fixture-driven parity tests exist (see Phase 1.5 fixtures below) and
   pass against the `src/lib/*` modules.
2. A static-safety scan is added for the `_shared/ecowittRealIngest*`
   mirrors using the same rules as `src/test/ecowitt-real-ingest-static-safety.test.ts`.
3. The token policy below is approved.
4. The schema/RLS/idempotency audit for Phase 2 is approved separately.

Rationale: the repo already uses the mirror pattern (`_shared/vpdRules.ts`)
for the same shape of problem. Option A is correct in principle but
disproportionate for four small pure modules and would touch unrelated
build tooling. Option C blocks Phase 2 forever.

## Required parity / contract tests (before wrapper deploys)

For each module pair (lib ↔ `_shared/`):

- Auth helper:
  - missing header → `unauthorized`
  - malformed / non-Bearer → `unauthorized`
  - missing expected token → `not_configured`
  - wrong token → `forbidden`
  - correct token → `authorized`
  - token value never appears in result
- Validator:
  - accepted live candidate
  - rejected: non-uuid tent, source != live, stale snapshot, suspicious
    unit, stuck humidity, missing required metric
- Redaction:
  - passkey / token / mac / ip / station / gateway redacted
  - safe fields preserved
  - non-object inputs returned unchanged
- Dedupe:
  - deterministic key with `ecowitt:v1:` prefix
  - sorted metric key segment is stable across input ordering
- Endpoint handler:
  - 401 / 403 / 503 / 400 / 422 / 202 status mapping
  - response never echoes bearer token
  - redacted preview present on both accepted and rejected paths
  - deterministic given fixed `reference_time`
  - no persistence side-effects (asserted by repository spy in tests)
- Cross-runtime parity:
  - same fixture input → identical JSON output (modulo key ordering)
    from `src/lib/*` and `_shared/*` modules.

## Token storage / rotation policy

- Token comes from Edge env var `ECOWITT_BRIDGE_TOKEN`. Never committed.
- Never returned in any HTTP response.
- Never logged (including not in error paths).
- Missing token → endpoint fails closed with `503 not_configured`.
- Rotation: dual-token window (`ECOWITT_BRIDGE_TOKEN` +
  `ECOWITT_BRIDGE_TOKEN_NEXT`) supported by the wrapper before live use;
  operator rotates by setting `_NEXT`, switching bridges, then
  promoting `_NEXT` to the primary and clearing the old value.
- Revocation: clearing `ECOWITT_BRIDGE_TOKEN` is sufficient to fail-
  closed immediately.
- This is **not** the same surface as `public.bridge_tokens` (per-user
  hashed bridge tokens). The ingest secret is operator-scoped, not
  user-scoped, and must not be persisted in that table.

## Static safety requirements for the future wrapper

The wrapper file (when it lands) and the `_shared/ecowittRealIngest*`
mirrors must be scanned for:

- no `service_role`
- no committed token literals
- no `.insert(` / `.update(` / `.upsert(` / `.delete(` / `.rpc(`
- no `supabase.from(`
- no writes to `alerts` / `action_queue`
- no AI/model invocation
- no device-control identifiers or command strings
- no raw secret logging (no `console.log(token)`, no echoing payload
  keys named `passkey|token|secret|mac|ip|station|gateway`)
- no flag/string enabling a `live` dashboard label
- `fetch(` allowed only inside the Edge wrapper for *inbound* request
  handling; outbound `fetch` remains forbidden

## Phase 2 gate

Phase 2 persistence remains **blocked** until **all** of the following
are explicitly approved:

1. Edge wrapper strategy (this doc — Option B).
2. Token storage + rotation + revocation policy.
3. Parity / contract test plan (fixtures shipped in Phase 1.5).
4. Schema / RLS / idempotency audit for `sensor_readings` writes from
   ingest, including: which auth boundary inserts (JWT vs server-only),
   which unique constraint enforces dedupe, and what `raw_payload`
   redaction is persisted vs dropped.

Until each of those is approved separately, no persistence code may be
written and the live dashboard label remains disabled.

## Files in scope for Phase 1.5

- `docs/ecowitt-real-ingest-phase-1-5-edge-wrapper-strategy.md` (this doc)
- `src/test/fixtures/ecowitt-real-ingest-phase1-fixtures.ts` (parity fixtures)
- `src/test/ecowitt-real-ingest-phase1-fixtures.test.ts` (fixture safety)

No production code is added. No Edge wrapper file is created. No
existing Phase 0/1 files are modified.
