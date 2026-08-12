# EcoWitt Real Ingest — Phase 1.8 Specification (Schema / RLS / Idempotency)

**Status:** Specification. Paper only — approving this document clears Phase 2 gate item 3
once its verification items pass. It authorizes **no** code, migration, policy change, or
deployment. Persistence remains blocked behind gate items 2 and 4 (owner-only).
**Basis:** [Phase 1.8 grounding audit](./ecowitt-real-ingest-phase-1-8-grounding-audit.md)
(deploy-branch-verified, 2026-08-07). Claims below inherit its evidence labels.
**Author:** Claude (Knowledge Library & Product Specification Architect)

> **Owner rulings recorded 2026-08-12** (Cheek), against frozen head `15e161885`:
> **D2 APPROVED** (Option A now, Option C destination), **D3 APPROVED** (fail-closed),
> **D4 APPROVED** (evidence-only fencing). Fences recorded inline in each section below.
> V1 and V4 were authorized and attempted the same day; both returned `BLOCKED` on access
> — see the verification attempt record. Verdict remains `HOLD — approvable`; it must not
> advance to `APPROVED` until V1–V4 all have recorded passing evidence.

## Executive recommendation

The write path to approve is the one that already exists: `ecowitt-ingest`-style
service-role upserts into long-format `public.sensor_readings`, deduplicated by
`sensor_readings_dedupe_uidx`. Phase 1.8 should **ratify and fence** that design — six
decisions below — not introduce a parallel key table, new columns, or `ecowitt_*` schema.
Three decisions are agent-resolvable; three are owner calls. Two hazards must be
empirically verified before sign-off.

## Decisions

### D1 — Authoritative idempotency mechanism (recommend: the unique index) — decider: audit (this doc), owner ratifies

**Decision:** the sole enforcement layer for EcoWitt real ingest is
`sensor_readings_dedupe_uidx (user_id, tent_id, source, metric, captured_at)` consumed via
`upsert(..., ignoreDuplicates: true)`. The `ecowitt:v1:` string key remains what it is
today — response-level traceability — and, when persistence arrives, is folded into
`raw_payload` exactly as the webhook folds `Idempotency-Key`. No key table, no key column.

**Why:** the index is shipped, CI-pinned (column order and non-partial form), and both Edge
writers already consume it. A persisted key table would duplicate the pi-path machinery
while adding no guarantee the index doesn't already provide, and a top-level key column is
contract-forbidden (`stored_row_top_level_columns_must_not_include`). The gates doc's two
candidate mechanisms both part-exist; this closes that question in favor of the one doing
the work in production.

**D1a — NULL `captured_at` rule (recommend: fail closed at the contract).** EcoWitt rows
must never be written with NULL `captured_at`. A candidate without a parseable gateway
timestamp is rejected — never defaulted to server time — matching the validator's existing
requirement and the "captured_at is sensor capture time, not receive time" rule. The index
itself is not changed (CI forbids the partial predicate; `NULLS NOT DISTINCT` would alter
semantics for every other path). Enforcement point: the write-path contract + a targeted
test; optionally a later trigger tightening scoped to `source='live'`.

**D1b — timestamp canonicalization.** If the `ecowitt:v1` key is ever compared or
persisted, `captured_at` must first pass the same normalization the pi path uses
(`normalizeTimestamp` → ISO). Until then this is a documented landmine, not a change.

### D2 — Channel identity for multi-channel air/soil — decider: **Cheek (owner)**, after V2

One (tent, captured_at) POST can yield multiple rows with the same `metric`; the dedupe
index then treats later channels as duplicates and `ignoreDuplicates` silently drops them.
Channel today lives only in `raw_payload.channel`, which the index cannot see.

| Option                                                                                                                                   | Effect                                                                              | Cost                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A. Designated channel per metric per tent, configured in `tents.hardware_config` (`air_channels`/`soil_channels` already exist for this) | One honest row per metric; other channels explicitly not stored; UI names the probe | Loses non-designated probes; per-plant soil deferred                                                   |
| B. Channel folded into `device_id` (column exists, nullable, unused by EcoWitt path) **and** `device_id` added to the dedupe index       | Preserves all channels with real identity                                           | Index migration + same-PR update of the pinned index test; `device_id` backfill semantics for old rows |
| C. Per-plant binding: channel → `plant_id` via a mapping surface (`soil_moisture_calibrations` already carries `plant_id`+`device_id`)   | Truest to Sensor Truth (`plant_id` when relevant)                                   | Largest scope; needs a binding UI; likely Phase 2+, not 1.8                                            |

**Recommendation:** A now, C as the stated destination, B rejected (mutating a CI-pinned
dedupe key for a transitional state churns row identity twice). Averaging channels stays
rejected outright. This is a data-meaning decision — owner's call.

> **RULED 2026-08-12 — APPROVED, Option A now; Option C is the destination.** Owner
> fences: the selected probe identity must be visible to the grower; never silently store
> whichever channel arrives first; never average probes; do not modify the pinned dedupe
> index to add `device_id`. Option C waits for a proper mapping and approval surface.
> Implementation remains blocked until **V2** reproduces and documents the actual
> collision behavior.

### D3 — Fail-open unknown→`live` in `mapStoredSourceForTransport` — decider: **Cheek (owner, gate 4)**

**Recommendation: flip to fail-closed.** Unknown or empty transport labels map to
`invalid`, not `live`, matching `sensor-source-badges.md` ("Unknown / missing source →
invalid") and AGENTS.md's rule that unknown telemetry never presents as healthy. Known
transport labels (`ecowitt`, `mqtt`, `webhook`, …) keep collapsing to `live` — that
mapping is correct and documented. Applies to new rows only; **no relabeling of stored
rows** (`source` is a dedupe-key column; relabeling changes row identity and can resurrect
duplicates). The deploy-only client-INSERT fence (`manual`/`csv`) already closes the
client path; this closes the token path.

> **RULED 2026-08-12 — APPROVED, fail-closed.** Contract: known, explicitly enumerated
> live transports → `live`; unknown, empty, malformed, or unsupported transport →
> `invalid`. Owner fences: new rows only; no migration, backfill, or relabeling of
> existing rows; no fallback from missing provenance to `live`; `ecowitt`, `mqtt`,
> `webhook`, and other specifically approved transports may continue mapping to `live`;
> invalid provenance must remain visibly invalid and never be interpreted as healthy
> sensor truth.

### D4 — May `stale` be persisted? — decider: **Cheek (owner)**

Three docs say "no unless explicitly approved" and no approval is recorded — so the
current answer is **no**. But the deploy-branch webhook already narrows `live → stale` at
ingest and stores the row, which is a de-facto yes on that path. **Recommendation:**
approve stale persistence explicitly (it preserves evidence and the freshness resolver
already fences display), and note the D1 interaction: a late redelivery re-labeled `stale`
misses the `live` row's index entry and stores twice. If approved, the duplicate is
tolerable and honest (two rows, two labels, same instant, display layer prefers neither as
current); if rejected, the webhook's narrowing branch is a defect to fix at gate 4.

> **RULED 2026-08-12 — APPROVED, with evidence-only fencing.** `stale` readings may be
> persisted as append-only historical evidence. Owner fences: preserve the original sensor
> `captured_at` (never substitute receipt time); preserve provenance and relevant raw
> evidence; never present as a current reading; excluded from "latest healthy sensor
> state"; must not independently increase AI Doctor confidence or trigger an
> alert/recommendation; never create an Action Queue item without current corroborating
> evidence and grower approval; never convert by mutating an existing row's `source`. The
> dual `live`/`stale` identity for one capture instant is acceptable **for this phase
> only** if freshness and analytical read models do not double-count the measurement. No
> dedupe-index migration is authorized in Phase 1.8.

### D5 — V0 contract vs schema (`plant_id`, `confidence`) — decider: audit (this doc)

**Decision: amend the contract doc, not the schema.** `plant_id` (until D2 option C) and
`confidence` travel in `raw_payload`; `quality` is the stored analog of confidence. Adding
columns is out of Phase 1.8 scope and the contract text is the thing that's wrong.

### D6 — Single source-of-truth for the canonical six labels — decider: audit; implementer: Codex

The six-value union is redeclared in 7+ modules with one pinned pair, and two docs
contradict it. **Decision:** `src/constants/sensorIngestProvenance.ts` is canonical. App
modules import it; the Edge copy (`storageMapping.ts`) cannot import across the boundary,
so it gets a pinned-equality test instead (same pattern as the ecowitt parity tests).
Doc fixes: `data-labeling-spec.md` gains `csv`; `sensor-truth-rules.md` field model marked
aspirational. Mechanical, non-owner, safe for the same PR series as D3's fix.

## RLS review (gate item 3 component)

Current deploy posture is **adequate for the approved write path** and should be frozen as
part of this approval: owner-scoped SELECT + restrictive 90-day free cap; client INSERT
limited to `manual`/`csv` with tent-ownership check; no client UPDATE/DELETE; EcoWitt
writes exclusively via service-role Edge upsert. Required assertions for the runtime
harness when implementation opens: (1) authenticated client cannot insert `source='live'`;
(2) client cannot insert into another user's tent; (3) no UPDATE path can mutate `source`
post-insert; (4) operator role cannot read `sensor_readings` (known asymmetry — confirm it
holds). Two duplicate validation triggers should be collapsed to one in some later
housekeeping migration — noted, not required for approval.

## Verification items (all must pass before this spec is marked approved)

| #   | Item                                                                                                        | Method                                                                                                                                                                     | Status    |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| V1  | Live trigger allow-list matches migration `20260617164759`                                                  | Re-run `scripts/audit-csv-source-allow-list.ts` against `knkwiiywfkbqznbxwqfh`; update the frozen test in the same PR                                                      | `BLOCKED` |
| V2  | Channel-collision behavior of the deployed row builder (does multi-channel drop rows?)                      | Fixture POST with 2 air + 2 soil channels through `buildEcoWittRoutedRows`/`buildEcoWittStoredRows` on the deploy branch; assert emitted row count and index-collision set | `NOT_RUN` |
| V3  | Deployed `ecowitt-ingest` matches deploy-branch source (writes `live`, not `ecowitt`)                       | Compare deployed function body via Supabase API to `origin/verdant-grow-diary`                                                                                             | `NOT_RUN` |
| V4  | No `source='live'` EcoWitt rows exist that predate gate approval — or they are enumerated and dispositioned | Read-only query, owner-visible output                                                                                                                                      | `BLOCKED` |

### Verification attempt record — 2026-08-12 (V1, V4: `BLOCKED`)

Both items were authorized by the owner and attempted the same day from the agent
environment. Neither could reach the live project. Nothing was mutated; no probe SQL was
ever sent. Per `AGENTS.md`, `BLOCKED` is not converted to `PASS` and no substitute harness
was improvised.

**V1 — `BLOCKED — no database access from this environment`.**

- The committed script (`scripts/audit-csv-source-allow-list.ts`; worktree copy differs
  from deploy blob `08f13cf78` by Prettier whitespace only) transports via `psql` using
  `PGHOST`/`PGUSER`/`PGDATABASE`. On this machine: all three env vars absent, `psql`
  binary absent. The script's own guard would exit 0 as "skipping" — a skip, not a pass.
- The Supabase MCP connection denied access to project `knkwiiywfkbqznbxwqfh`:
  `get_project` and a trivial read-only `execute_sql` (`select current_user`) both
  returned "You do not have permission to perform this action". Connecting role category:
  unknown — the connection was refused before any role was established. No credentials
  were printed or exist in this environment beyond the client publishable key.

**V4 — `BLOCKED — same access denial`.** The read-only query was not executed. Note the
client publishable (anon) key in `.env` is not a valid substitute transport: RLS
owner-scopes `SELECT`, so an anon query returns zero rows regardless of truth — absence of
evidence, not evidence of absence.

**Unblock paths (owner's choice, any one suffices):**

1. Grant the MCP connection SQL access to `knkwiiywfkbqznbxwqfh`, then re-authorize the
   run.
2. Supply session-pooler `PG*` env (+ `psql`) on a machine running the committed script.
3. Run both from Supabase Studio directly. V1: run the committed script's probe matrix, or
   read the deployed definition (pure read):
   `select pg_get_functiondef(oid) from pg_proc where proname = 'validate_sensor_reading';`
   and compare to migration `20260617164759`. V4 (read-only, masked, no raw_payload dump):

   ```sql
   select
     id,
     left(user_id::text, 8) || '…' as user_masked,
     left(tent_id::text, 8) || '…' as tent_masked,
     metric,
     captured_at,
     created_at,
     device_id,
     raw_payload ->> 'channel' as channel,
     raw_payload ->> 'vendor' as vendor,
     raw_payload -> 'metadata' ->> 'transport_source' as transport_source,
     (raw_payload ->> 'passkey_fingerprint') is not null as has_fingerprint
   from public.sensor_readings
   where source = 'live'
     and (
       raw_payload ->> 'vendor' ilike '%ecowitt%'
       or raw_payload -> 'metadata' ->> 'transport_source' = 'ecowitt'
       or raw_payload ? 'passkey_fingerprint'
     )
   order by captured_at desc
   limit 200;
   ```

   Also useful context (count only): the same query with `source = 'ecowitt'` for
   pre-canonical legacy rows.

4. Hand both to Lovable, which has authed access to the live project, as a
   verification-only prompt.

## Out of scope, restated

No migrations, no Edge deploys, no UI, no alerts, no Action Queue writes, no device
control, no soil-alert thresholds (remain null/unconfigured), no relabeling of stored
rows. Gate item 2 (token policy) remains owner-only and unresolved. Gate 4's policy
substance was ruled 2026-08-12 (D3/D4, recorded above); its implementation still waits on
this spec reaching `APPROVED`. Both remain prerequisites for any implementation PR that
follows this spec.

## Handoff

Per `docs/agents/HANDOFF_PROTOCOL.md`: D2/D3/D4 were ruled 2026-08-12, so Codex
implements nothing until V1–V4 pass and this spec reaches `APPROVED`. First implementable
slice after approval: D6 consolidation + the D1a contract test (both pure/test-only, no
schema).

## Verdict

**HOLD — approvable.** The design is settled, evidence-grounded, and owner-ruled
(D2/D3/D4, 2026-08-12); approval is now blocked only on the four verification items
(V1/V4 `BLOCKED` on access, V2/V3 `NOT_RUN`).
Nothing discovered in the audit requires new schema. The shortest honest path to real
EcoWitt persistence runs through ratifying what already ships, not extending it.

## Rollback

Delete this file. It specifies; nothing executes from it.
