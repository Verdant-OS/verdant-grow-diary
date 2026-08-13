# EcoWitt Real Ingest — Phase 1.8 Specification (Schema / RLS / Idempotency)

**Status:** Specification. Paper only — approving this document clears Phase 2 gate item 3
once its verification items pass. It authorizes **no** code, migration, policy change, or
deployment. Gate item 2 was approved 2026-08-12 (`docs/ecowitt-bridge-token-policy.md`);
persistence remains blocked behind
this spec reaching `APPROVED` via its verification items; gate 4's policy was ruled
2026-08-12 (see D3/D4) and D4 was re-confirmed fail-closed on corrected facts 2026-08-13,
clearing that independent prerequisite.
**Basis:** [Phase 1.8 grounding audit](./ecowitt-real-ingest-phase-1-8-grounding-audit.md)
(deploy-branch-verified, 2026-08-07). Claims below inherit its evidence labels.
**Author:** Claude (Knowledge Library & Product Specification Architect)

> **Owner rulings recorded 2026-08-12** (Cheek), against frozen head `15e161885`:
> **D2 APPROVED** (Option A now, Option C destination), **D3 APPROVED** (fail-closed),
> **D4 APPROVED** (evidence-only fencing). Fences recorded inline in each section below.
> **D4 re-confirmed fail-closed 2026-08-13** — that prerequisite is cleared; V5b is
> `NOT_APPLICABLE`. All owner decisions are ruled; approval waits only on verification.
>
> **Verification state as of 2026-08-13:** V1 `PASS`, V2 `PASS`, V4 `PASS`, V5a `PASS`,
> V5b `NOT_APPLICABLE` — **V3 and V6 remain `BLOCKED`**, and the verdict stays
> `HOLD — approvable` until both record passing evidence. See the two 2026-08-13
> verification attempt records, including finding **F1**, which retracts the assumption
> that any stored row can be attributed to the current `ecowitt-ingest` build.

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
> collision behavior. **V2 condition satisfied 2026-08-12 — see the V2 row**: collision
> confirmed for multi-channel-per-class tents; safe under ≤1 channel per class per tent,
> which Option A's designation surface must enforce.

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

> **Premise refined 2026-08-12 (deploy-verified):** on the deploy branch the webhook's
> validator already rejects empty/unknown `source` upstream (`webhookIngest.ts`
> `normalizeWebhookSource` + "invalid source" structural error, :277-282), so
> `mapStoredSourceForTransport`'s fail-open default is currently **unreachable
> defense-in-depth on that path**, not an open ingest hole. The ruling stands unchanged —
> aligning the helper's default with the validator prevents a future refactor from
> resurrecting fail-open — but D3 is correctly described as hardening, not as closing a
> live vulnerability.

### D4 — May `stale` be persisted? — decider: **Cheek (owner)**

Three docs say "no unless explicitly approved" and no approval is recorded — so the
current answer is **no**. ~~But the deploy-branch webhook already narrows `live → stale`
at ingest and stores the row, which is a de-facto yes on that path.~~ **This premise was
wrong — corrected 2026-08-12, verified against deploy tip `cb98fe4e4`:** both handlers
reject stale **before** any upsert. `sensor-ingest-webhook/index.ts:208-219` fails closed
with `reason: "timestamp_stale"`, its comment stating the reason explicitly ("stale would
change that conflict key and create a second row. Fail closed"), and
`ecowitt-ingest/index.ts:336-342` does the same ("so stale packets can never become
live"). The `storageMapping` narrowing branch the grounding audit flagged is unreachable
for stale in practice — the guard rejects first. There is **no** de-facto stale storage,
and the dual `live`/`stale` row hazard is currently prevented by a deliberate, shipped
safeguard.

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

> **RULING PREMISE CORRECTED 2026-08-12 — owner re-confirmation required before
> implementation.** The ruling above was informed by this spec's incorrect claim that the
> deploy webhook already stores narrowed stale rows. It does not: both deployed handlers
> deliberately fail closed on stale (see correction above), and the dual-identity clause
> in the ruling tolerates a scenario the shipped guards currently prevent. Implementing
> D4 as ruled therefore **removes an existing, intentional fail-closed safeguard** rather
> than ratifying existing behavior. The decision remains the owner's; it must be
> re-confirmed against these corrected facts before any implementation PR touches the
> stale guards. Until then, the effective behavior stays fail-closed (stale rejected, not
> stored).

> **RE-CONFIRMED 2026-08-13 — FAIL-CLOSED (final).** On the corrected facts, the owner
> ruled: stale readings stay **rejected, never stored**, ratifying the shipped deliberate
> guards. This supersedes the 2026-08-12 persist ruling, which was made on the incorrect
> premise. Consequences: **V5b resolves `NOT_APPLICABLE`**; the webhook's unreachable
> `live → stale` narrowing branch in `storageMapping` is a confirmed dead branch to
> remove (not extend) at implementation; the dual live/stale row scenario is permanently
> prevented; gate 4 is fully `APPROVED` (D3 + D4).

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
writes exclusively via service-role Edge upsert. The runtime-harness assertions are **V6, a pre-approval verification item**, not
deferred-to-implementation work: (1) authenticated client cannot insert `source='live'`;
(2) client cannot insert into another user's tent; (3) no UPDATE path can mutate `source`
post-insert; (4) an operator (application
role) cannot read another user's `sensor_readings` rows — owner-read of their own rows is
intended policy and must pass. Two duplicate validation triggers should be collapsed to one in some later
housekeeping migration — noted, not required for approval.

## Verification items (all must pass before this spec is marked approved)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Method                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| V1  | Live trigger allow-list matches migration `20260617164759`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Authoritative:** read the deployed definition (`pg_get_functiondef` on `validate_sensor_reading`) and compare it to the validator's `CREATE OR REPLACE FUNCTION` statement **extracted from** the migration, after canonicalizing both (the migration file is multi-statement with comments and a second function, and `pg_get_functiondef` re-serializes — raw byte comparison can never pass). Decisive semantic criteria: the 9-metric, 4-quality, and 19-source allow-lists, the NaN guard, the +5-minute `captured_at` bound, and the `soil_temp_c` −20..80 bound all match exactly. The committed probe script (2 sources × 5 metrics) is supplementary behavioral evidence, never a pass by itself. Update the frozen test in the same PR                                                                                                   | `PASS` — 2026-08-13, owner-run psql against production; see attempt record                                                 |
| V2  | Channel-collision behavior of the deployed row builder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **`PASS` — reproduced 2026-08-12** by running the deploy-branch modules (`ecowittRoutedRowBuilder.ts` + `ecowittChannelTentRouter.ts`, extracted verbatim from `origin/verdant-grow-diary`) against a 2-air + 2-soil-channel fixture. Result: a tent listing **two channels of one class** emits colliding rows — 8 rows, 4 distinct dedupe keys; `ignoreDuplicates` silently drops half, including per-channel derived `vpd_kpa`, first-emitted-channel-wins. A tent with **at most one channel per class** produces zero collisions (8 rows, 8 keys, two tents). **Consequence for D2 Option A:** "designated channel" must mean ≤1 channel per metric class per tent in `hardware_config`; note the `hardware_config` column comment's own example (`"air_channels": [1,2]`) is a collision-shaped config and must be corrected at implementation | `PASS`                                                                                                                     |
| V3  | Deployed `ecowitt-ingest` matches deploy-branch source (writes `live`, not `ecowitt`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Compare deployed function body via Supabase API to `origin/verdant-grow-diary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `BLOCKED` — deployed function bodies/versions unreachable (no dashboard or Management API access); re-attempted 2026-08-13 |
| V4  | No `source='live'` EcoWitt rows exist that predate gate approval — or they are enumerated and dispositioned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Read-only query, owner-visible output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `PASS` — 2026-08-13, 29,743 rows enumerated exhaustively, 0 defects; see attempt record and findings F1—F3                 |
| V5a | **Invalid-provenance read fences — mandatory for spec approval, unconditional.** D3 maps unknown transports to `invalid`; the read layer must honor that or D3's fail-closed contract is defeated at render. Verified counter-evidence at `origin/main`: `src/lib/environmentTrends.ts` `samplesFromReadings` maps every source except `manual`/`sim` to `live`, so `invalid`, `demo`, `csv`, and legacy `ecowitt` rows are promoted **today**, independent of D4; `src/hooks/useReportsHubData.ts` counts `sensor_readings` with no source filter. This is a live defect queued for a dedicated fix session; V5a passes when that fix lands with tests proving non-live sources never classify live/healthy in any read model                                            | **`PASS` — 2026-08-13, PR #917 merged as `e077a0ba0`**: shared fold helpers replace every else→`live` fallthrough across 11+ read models (Environment Trends, Pheno Comparison, Reports Hub, AI Doctor context compiler, alert freshness context, dashboard view models, EcoWitt timeline/snapshot filters), propagating `quality` and `captured_at`; 10+ test files pin that non-canonical sources never classify live/healthy. Scoped deliberate exception: active writers' transport tags (`pi_bridge`, `ecowitt`) map to `live` via the explicit `ACTIVE_LIVE_TRANSPORT_SOURCES` compat set, removable only once those writers persist canonical `live`                                                                                                                                                                                          | `PASS`                                                                                                                     |
| V5b | **Stale-persistence read fences — conditional on D4.** Required before any D4 implementation; `NOT_APPLICABLE` if the owner re-confirms fail-closed rejection. Proves: persisted `stale` rows excluded from latest-healthy state; AI/alert isolation holds; a permitted `live`/`stale` dual row is not double-counted analytically (`useReportsHubData` per-capture identity)                                                                                                                                                                                                                                                                                                                                                                                             | Tests/audits, after and only if D4 is re-confirmed as persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `NOT_APPLICABLE` — D4 re-confirmed fail-closed 2026-08-13                                                                  |
| V6  | **Runtime RLS harness — mandatory for spec approval.** Repo-file policy inspection is not proof (AGENTS.md: static scans are not enough for RLS; prove client roles cannot mutate protected tables). Assertions against the live project: (1) authenticated client cannot INSERT `source='live'`; (2) cannot INSERT into another user's tent; (3) no client UPDATE/DELETE path can mutate `source` or any `sensor_readings` row; (4) an operator (application role, not a PG role) cannot SELECT **another user's** `sensor_readings` rows — owner-read of their own rows via `Users view own readings` is intended and must still pass. All are deny-expected probes — a passing run writes nothing. Same access prerequisites and owner authorization boundary as V1/V4 | Runtime harness against `knkwiiywfkbqznbxwqfh`; needs live access                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `BLOCKED` — connecting role cannot `SET ROLE authenticated`; probes A—D not executed (2026-08-13)                          |

### Verification attempt record — 2026-08-12 (V1, V4: `BLOCKED`)

> **Second attempt, later 2026-08-12:** access remains denied — `execute_sql`
> (`select current_user`) and `get_edge_function` (`ecowitt-ingest`) both returned
> "You do not have permission to perform this action" against `knkwiiywfkbqznbxwqfh`.
> The access-gated set is therefore **V1, V3, V4, V6**. V2 was executed the same day
> without live access (repo-side repro — see the V2 row).

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
   order by captured_at desc;
   -- V4 requires the enumeration to be EXHAUSTIVE: run
   --   select count(*) from public.sensor_readings where source = 'live' and (...same predicate...);
   -- first, and page or export the full set until every row is dispositioned. Do not cap
   -- the result — one gateway sample expands to multiple metric rows, so any LIMIT can
   -- hide pre-approval rows while V4 reads as complete.
   ```

   Also useful context (count only): the same query with `source = 'ecowitt'` for
   pre-canonical legacy rows.

4. Hand both to Lovable, which has authed access to the live project, as a
   verification-only prompt.

### Verification attempt record — 2026-08-13 (V1, V3, V4, V6: `BLOCKED` — root cause isolated: org membership, not connector scope)

Third attempt, authorized by the owner, run from the agent environment with two
transports. Nothing was mutated; no probe SQL ever reached the live project.

**Transport 1 — Supabase MCP connector (re-granted since the 2026-08-12 attempt).**
A connector did attach this time, but its grant is scoped to the **sandbox**:
`list_projects` returned exactly one project — `bzatgtgjvuojpoxcknaa` in org
`yvquibcbreuxktuyozsc` — and the probe `select current_user,
current_setting('transaction_read_only', true)` against `knkwiiywfkbqznbxwqfh` returned
"You do not have permission to perform this action" (established fact, observed twice,
~40 minutes apart). No query was run against the sandbox; per
`docs/agents/CURRENT_STATE.md` any result from `bzatgtgjvuojpoxcknaa` would be invalid.

**Transport 2 — Supabase Studio in the owner's browser (unblock path 3).** Both
connected Chrome instances are signed into the same Supabase user. That account's
organizations page lists exactly two orgs — a personal Free org and the sandbox org
`yvquibcbreuxktuyozsc` (Pro, 1 project). Navigating to
`/dashboard/project/knkwiiywfkbqznbxwqfh/sql/new` and to
`/dashboard/org/wpczgwxsriezaubncuom` both silently redirect back to the account's own
org pages (established fact, observed in both browsers). The SQL editor shell begins to
render before the authorization check completes, then bounces — no query ever executed.

**Root cause (inference, high confidence):** the production org `wpczgwxsriezaubncuom`
has **no membership** for the Supabase user signed in on this machine. The MCP
connector can only be scoped to orgs its authorizing user belongs to — which is why the
re-grant could only land on the sandbox. "Re-scope the connector" is therefore not an
available fix; membership is the prerequisite for both transports.

**Refined unblock paths (owner's choice, any one suffices):**

1. From whichever Supabase identity owns `wpczgwxsriezaubncuom` (the org provisioned
   with the live project — see the Lovable integration), invite this machine's
   dashboard account as an org member. That single grant unblocks both Studio (path 3)
   and, after re-authorizing the connector against the production org, MCP (path 1).
2. Unblock path 4 (Lovable handoff) is unchanged and requires no Supabase membership
   work. A self-contained, guardrailed Studio/Lovable run sheet with every query,
   expected value, and pass criterion for V1/V3/V4/V6 now exists at
   [`docs/ecowitt-phase-1-8-studio-verification-prompt.md`](./ecowitt-phase-1-8-studio-verification-prompt.md).

### Verification attempt record — 2026-08-13, second run (V1 `PASS`, V4 `PASS`, V3 + V6 `BLOCKED`)

**Transport:** the owner ran the run sheet's read-only SQL directly against production
via `psql`, outside the agent environment, and returned a structured report. Project
identity was confirmed in-band (`knkwiiywfkbqznbxwqfh`, org `wpczgwxsriezaubncuom`,
URL `https://knkwiiywfkbqznbxwqfh.supabase.co`), and the sandbox ref
`bzatgtgjvuojpoxcknaa` was explicitly never touched. The report's own header called it a
"sandbox psql run" meaning the **agent-sandbox machine**, not the sandbox project — the
in-band ref confirmation plus the corroborating shape of the data (228,022 rows,
csv-dominant, validator byte-identical in substance to deploy migration
`20260617164759`) resolve that ambiguity toward production. Nothing was written: the one
transaction that attempted a write aborted and rolled back.

**V1 — `PASS`.** `pg_get_functiondef(validate_sensor_reading)` matched every decisive
criterion with no diff: the 9-metric allow-list exactly
(`temperature_c, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, ec, ppfd`),
the 4-quality allow-list (`ok, degraded, stale, invalid`), the **19**-source allow-list
counted exactly, the NaN guard (`NEW.value IS NULL OR NEW.value = 'NaN'::numeric`), the
+5-minute `captured_at` bound, the `soil_temp_c` −20..80 bound, and
`SET search_path TO 'public'`. Both duplicate trigger objects exist and are enabled —
`trg_sensor_readings_validate` and `validate_sensor_reading_trg`, `tgenabled = 'O'`, both
resolving to `validate_sensor_reading`; the validator is raise-only and idempotent, so
double firing is redundant work, not a behavior difference (established fact on
existence; inference on harmlessness). `sensor_readings_dedupe_uidx` is
`UNIQUE btree (user_id, tent_id, source, metric, captured_at)`, non-partial, exact column
order. The committed INSERT-probe script was not run — method-limited under read-only
discipline, **not** a `FAIL`.

**V4 — `PASS`.** Count-first returned **29,743** matching rows and the enumeration
returned 29,743 — exhaustive, no cap. Zero rows carried the DEFECT disposition; zero
required owner review under the row-level criteria. Legacy `source = 'ecowitt'` count is
**0**. Groups (masked): one dominant testbench group under user `a6017097…` / tent
`eec6f7b3…` (`temperature_c` 9,905, `humidity_pct` 9,905, `soil_moisture_pct` 9,904,
spanning 2026-06-17T11:58:58.949Z → 2026-07-14T07:03:04.953Z), plus four small
`verdant-ui-ingest-test` / plain-`ecowitt` groups across three tents on 2026-06-19 and
2026-06-24. Group counts sum to 29,743.

**V3 — `BLOCKED`.** Deployed function bodies, version numbers, `updated_at`, and JWT
verification settings are all `UNKNOWN`: the environment that ran the SQL has no Supabase
dashboard session and no Management API path, and repo source is not deployment evidence.
Repo-side fingerprints at `origin/verdant-grow-diary` all match expectation for both
functions, but that establishes only what _should_ be deployed.

**V6 — `BLOCKED`.** Probe A failed at the role switch:
`ERROR: permission denied to set role "authenticated"`, aborting the transaction
(`ROLLBACK` confirmed). Per the run sheet's stop rule, probes B–D were not attempted.
Static corroboration was captured but explicitly **does not discharge V6** (AGENTS.md:
static scans are not enough for RLS): `pg_policies` on `public.sensor_readings` shows
exactly two policies — `Users insert own readings` (INSERT, `{authenticated}`,
`WITH CHECK auth.uid() = user_id AND source = ANY(ARRAY['manual','csv']) AND EXISTS (SELECT 1 FROM tents t WHERE t.id = sensor_readings.tent_id AND t.user_id = auth.uid())`)
and `Users view own readings` (SELECT, `{public}`, `USING auth.uid() = user_id`). No
UPDATE and no DELETE policy exists at all.

#### Findings from this run

**F1 — the report's V3 runtime-corroboration inference is RETRACTED (this audit's
correction).** The report inferred that the deployed `ecowitt-ingest` must be the current
version because live rows carry `metadata.transport_source = 'ecowitt'` and
`verdant_source = 'live'`. That inference does not hold. The deploy-branch row builder
(`_shared/ecowittRoutedRowBuilder.ts`) makes two invariants unconditional on every stored
row: `raw_payload.passkey_fingerprint` is set on **every** routed row (lines 258 and 296)
and survives the spread in `buildEcoWittStoredRows`, and `vendor` is the type-pinned
literal `"ecowitt"` (`EcoWittStoredRawPayload.vendor: "ecowitt"`). The live table
contradicts both: `passkey_fingerprint` is present on **0** of 29,743 rows, and the
dominant vendor string is `ecowitt_windows_testbench`, not `ecowitt`. Therefore **no row
currently in `public.sensor_readings` was written by the deployed `ecowitt-ingest`
together with the current shared row builder.** Two explanations remain open and both
defeat the inference: the rows arrived by a different deployed path (the Windows-testbench
listener → `sensor-ingest-webhook` hop, consistent with the vendor string), or by an
older revision of the EcoWitt path predating the fingerprint/vendor contract. V3
consequently has **no** runtime corroboration and stands fully `BLOCKED`. V4's `PASS` is
unaffected — those rows remain non-defects (they are not from the DB-clientless
`ecowitt-real-ingest`) — but their disposition is re-labelled from "bearer-authenticated
`ecowitt-ingest` path" to **"bearer-authenticated bridge/webhook path, exact writer
unconfirmed."**

**F2 — 29,738 of 29,743 `source = 'live'` rows are testbench-sourced
(`vendor = 'ecowitt_windows_testbench'`).** Under V4's stated criteria this is not a
defect, and it is recorded as `PASS`. It is nonetheless raised for owner attention
against AGENTS.md's "No fake live data" rule: production's `live` sensor surface is
dominated by bench traffic, and no EcoWitt `live` row has been written since
2026-07-14 (~30 days). Any claim that production carries real live EcoWitt telemetry is
currently **unsupported**. Disposition is the owner's call; this spec authorizes no
relabeling (`source` is a dedupe-key column — see D3's fence).

**F3 — zero tents carry `hardware_config ? 'ecowitt'`.** The deployed `ecowitt-ingest`
routes PASSKEY → tent through `tents.hardware_config->'ecowitt'->>'passkey_fingerprint'`,
so with no tent configured, that path can currently resolve **no** gateway POST at all —
consistent with F1. This also touches **D2**: the handoff assumed
`hardware_config.air_channels`/`soil_channels` is the designation surface for Option A;
that surface exists in the column contract but is **unpopulated in production**, so
Option A's implementation creates the first configs rather than migrating existing ones,
and V2's "≤1 channel per class per tent" rule has no existing configuration to audit.
D2's ruling is unaffected.

**F4 — 9 `source = 'live'` rows match no EcoWitt predicate** (live total 29,752 vs 29,743
matched). Out of V4's scope by construction; recorded so the delta is not mistaken later
for missed enumeration. Full source distribution: `csv` 197,525, `live` 29,752, `manual`
729, `demo` 16 (total 228,022).

#### What remains before `APPROVED`

Exactly two items, both narrower than before:

1. **V3** — needs one read of the deployed function bodies plus their version/updated_at
   and JWT-verify settings. Any of: the Supabase dashboard Functions page, the Management
   API, or an MCP connector scoped to the production org (`get_edge_function`). F1 makes
   this materially more important than it looked: since no stored row can be attributed to
   the current `ecowitt-ingest` build, the deployed body is the **only** remaining evidence
   of what that endpoint would write.
2. **V6** — needs a connection whose role may `SET ROLE authenticated`. The `psql` role
   used on 2026-08-13 could not. The Supabase **Studio SQL editor connects as `postgres`**,
   which can, so re-running probes A–D there is the shortest path; alternatively, mint a
   real user JWT and drive the four assertions through PostgREST, which is the truer
   client-role harness.

Everything else is settled: V1 `PASS`, V2 `PASS`, V4 `PASS`, V5a `PASS`, V5b
`NOT_APPLICABLE`, D1–D6 all ruled.

## Out of scope, restated

No migrations, no Edge deploys, no UI, no alerts, no Action Queue writes, no device
control, no soil-alert thresholds (remain null/unconfigured), no relabeling of stored
rows. Gate item 2 (token policy) was approved 2026-08-12 — see
`docs/ecowitt-bridge-token-policy.md`. Gate 4's policy
substance was ruled 2026-08-12 (D3/D4, recorded above); its implementation still waits on
this spec reaching `APPROVED`. Both remain prerequisites for any implementation PR that
follows this spec.

## Handoff

Per `docs/agents/HANDOFF_PROTOCOL.md`:

```text
HANDOFF
from_agent: Claude (Knowledge Library & Product Specification Architect)
to_agent: Cheek (decisions + access), then Codex (implementation, gated)
sentinel_version: 2026-08-01.2
date: 2026-08-12

completed:
  - Phase 1.7 verified: gate item 1 PASS (22/22 targeted wrapper tests)
  - Grounding audit of schema/source-labels/dedupe/write-path/docs, verified
    against origin/verdant-grow-diary (cb98fe4e4), with self-corrections recorded
  - This specification: D1-D6 with owner rulings D2/D3 recorded; D4 ruled, then
    premise-corrected; verification items V1-V6 defined with pass criteria
  - Gate 2 token policy APPROVED 2026-08-12 (docs/ecowitt-bridge-token-policy.md)

verified_by:
  - bunx vitest run (both Phase 1.7 test files), 2026-08-07, this worktree
  - Source reads at origin/verdant-grow-diary cb98fe4e4 (handlers, migrations,
    storageMapping, ecowitt-ingest auth) and origin/main ae5a81c23 (read models)
  - Branch claude/ecowitt-sensor-verify-98f1bd, PR #907 (base main)

not_done:
  - V2, V3, V5a, V5b: no verification result yet
  - Any implementation, migration, deploy, or policy change (all forbidden here)

unknowns:
  - Live DB trigger state vs migration 20260617164759 (V1)
  - Live source='live' EcoWitt row inventory (V4)
  - Deployed function parity with deploy branch (V3)
  - Multi-channel collision behavior of the deployed row builder (V2)

blocked:
  - V1/V4/V6: live-project access — owner: Cheek; unblock = MCP SQL grant, PG*
    env + psql, Supabase Studio run, or Lovable handoff (see attempt record)
  - D4 re-confirmation on corrected facts — owner: Cheek; verification cannot
    substitute for it

assumptions:
  - Deploy tip cb98fe4e4 is representative of what is live; if the deployed
    functions differ, V3 falsifies this and V1/V2 conclusions must be re-checked
  - tents.hardware_config air_channels/soil_channels are intended as the
    designation surface for D2 Option A; if not, D2 implementation re-opens

next_slice:
  - Cheek: grant live access (unblocks V1/V4/V6) and re-confirm D4
  - Then Codex, after APPROVED: D6 label-consolidation + D1a contract test
    (pure/test-only, no schema)
  - Assignment note: this workstream is NOT the approved slice (SEO repair is);
    whether EcoWitt supersedes it is Cheek's explicit call, still unmade

files_touched:
  - docs/ecowitt-real-ingest-phase-1-7-verification-record.md
  - docs/ecowitt-ingest-topology-and-schema-gaps.md
  - docs/ecowitt-real-ingest-phase-1-8-grounding-audit.md
  - docs/ecowitt-real-ingest-phase-1-8-specification.md
  - docs/agents/CURRENT_STATE.md
```

## Verdict

**HOLD — approvable.** The design is settled and evidence-grounded; all owner decisions
are ruled (D2/D3 2026-08-12; D4 re-confirmed fail-closed 2026-08-13). Four of six
verification items now carry passing evidence: **V1 `PASS`** (live validator matches
migration `20260617164759` exactly, verified 2026-08-13), **V2 `PASS`**, **V4 `PASS`**
(29,743 rows enumerated exhaustively, zero defects), **V5a `PASS`**; V5b
`NOT_APPLICABLE`. Approval is blocked on exactly **two** remaining items: **V3** (deployed
Edge function bodies and versions — one dashboard or Management-API read) and **V6** (the
runtime RLS harness — needs a role permitted to `SET ROLE authenticated`; Studio's
`postgres` connection qualifies). Neither is a design question.

One correction landed with the results: the live table contains **no** row attributable to
the current `ecowitt-ingest` build (finding F1 — `passkey_fingerprint` absent on all
29,743 rows, vendor string not the pinned literal), so V3 has no runtime corroboration and
the deployed body is the only remaining evidence of that endpoint's write behavior. Two
findings are referred to the owner rather than resolved here: production's `live` surface
is dominated by testbench traffic (F2) and no tent carries EcoWitt hardware config (F3).
Nothing discovered requires new schema. The shortest honest path to real EcoWitt
persistence still runs through ratifying what already ships, not extending it.

## Rollback

Delete this file. It specifies; nothing executes from it.
