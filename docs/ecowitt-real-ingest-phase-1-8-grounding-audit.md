# EcoWitt Real Ingest — Phase 1.8 Grounding Audit

**Status:** Audit record. No code, schema, policy, or deployment changed.
**Audited:** 2026-08-07, multi-agent sweep (5 areas, adversarially verified) against
`origin/verdant-grow-diary` (deploy branch, tip `cb98fe4e4`) and this worktree.
**Recorded by:** Claude (Knowledge Library & Product Specification Architect)

This is the authoritative starting point for Phase 1.8 (Phase 2 gate item 3: schema / RLS /
idempotency audit). It supersedes specific claims in the two earlier records where noted.
Confidence labels follow `AGENTS.md`.

## 0. Corrections to earlier records in this series

Both prior records were written from an incomplete read of this worktree — the exact
error class they were correcting. Superseded claims:

| Earlier claim                                                                                                                                                                            | Corrected fact                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trigger constrains `metric` to five values ([Phase 1.7 record](./ecowitt-real-ingest-phase-1-7-verification-record.md), [topology record](./ecowitt-ingest-topology-and-schema-gaps.md)) | **Nine**: `temperature_c, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct, soil_temp_c, ph, ec, ppfd`. The function was redefined six times; final definition `supabase/migrations/20260617164759_*.sql`                                                         |
| `sensor_readings` has 9 columns, no device column, no jsonb (topology record §4–§5)                                                                                                      | **Twelve** columns. `20260523000307_*.sql` added `device_id text NULL`, `raw_payload jsonb NULL`, `captured_at timestamptz NULL`                                                                                                                                   |
| No device/gateway registry exists (topology record §4)                                                                                                                                   | No registry **table**, but gateway binding exists: `tents.hardware_config -> 'ecowitt' ->> 'passkey_fingerprint'` (`ewfp_` + truncated SHA-256, 24 hex), with an expression index and a channel map (`air_channels`, `soil_channels`). `20260604211440_*.sql`      |
| No idempotency mechanism exists on the sensor path (topology record)                                                                                                                     | Three exist — see §3                                                                                                                                                                                                                                               |
| Topology: gateway → listener → `sensor-ingest-webhook` only (topology record §2)                                                                                                         | Incomplete. A second deployed EcoWitt Edge function, `supabase/functions/ecowitt-ingest`, serves the gateway's custom-upload protocol directly and maps PASSKEY-fingerprint → tent via `hardware_config`. The listener/webhook path is the Windows-testbench route |

Additionally, this worktree is **164 migration files behind** the deploy branch, and its
generated `src/integrations/supabase/types.ts` is stale (40 tables vs 97). Neither may be
used as a schema oracle. Deploy-only migrations that matter here:
`20260718054345_sensor_readings_client_source_fence.sql`,
`20260711220402` (two RLS-read indexes), `20260726045740_free_sensor_history_read_cap.sql`,
`20260728031940_reserve_operator_ggs_attestation_provenance.sql`.

## 1. The real schema (deploy branch, final effective shape)

`public.sensor_readings` — 12 columns: `id` uuid PK · `user_id` uuid NOT NULL DEFAULT
`auth.uid()` · `tent_id` uuid NOT NULL · `ts` timestamptz NOT NULL DEFAULT now() ·
`metric` text NOT NULL · `value` numeric NOT NULL · `quality` text NOT NULL DEFAULT 'ok' ·
`source` text NOT NULL DEFAULT 'manual' · `created_at` timestamptz NOT NULL ·
`captured_at` timestamptz **NULL** · `device_id` text NULL · `raw_payload` jsonb NULL.

- Long format: one row per (tent, metric, sample). No FK on `tent_id`/`user_id`. No CHECK
  constraints; all value-domain enforcement is the `validate_sensor_reading()` trigger
  (9 metrics; quality `ok|degraded|stale|invalid`; 19-value source allow-list = 6 canonical
  plus 13 back-compat incl. `ecowitt` — earlier drafts of this record miscounted 18/12;
  value non-NULL/non-NaN; `captured_at ≤ now()+5min`; `soil_temp_c` −20..80).
- Two trigger objects bind the same function (`trg_sensor_readings_validate` +
  `validate_sensor_reading_trg`) — it runs twice per row. Harmless, wasteful. (inference)
- Timestamps: `captured_at` = sensor capture time (source of truth for age), `ts` = series
  time, `created_at` = insert time. There is no `observed_at`/`received_at`.
- RLS (deploy): owner-scoped SELECT + a RESTRICTIVE 90-day free-tier SELECT cap; one INSERT
  policy rewritten four times, now restricting **authenticated clients to
  `source IN ('manual','csv')`** with tent-ownership check and forbidden operator-attestation
  markers; **no UPDATE/DELETE policies**. Client-written `live` is therefore already fenced
  at the database — a material part of gate 4 exists on the deploy branch.
- `public.sensor_ingest_audit_log` is per-batch counts (`rows_received`/`rows_inserted`),
  not a per-observation ledger. `public.observation_events` is diary/AI-Doctor symptom
  intake — not telemetry; the name collision with the drafts' "observations" is
  coincidental.

## 2. Source labels and the live fence

- Canonical six (`live|manual|csv|demo|stale|invalid`) are redeclared in **seven+** places
  with only one pair test-pinned equal; docs disagree with each other
  (`data-labeling-spec.md` says five states, omitting `csv`; `sensor-truth-rules.md`
  describes columns that don't exist). A Phase 1.8 deliverable: one source-of-truth module.
- The deployed `ecowitt-ingest` function historically wrote the non-canonical literal
  `source='ecowitt'` by documented design; the deploy-branch row builder now emits
  `source: "live"` with `transport_source: "ecowitt"` in `raw_payload`. Historical rows may
  carry `'ecowitt'`; the read side treats it as `legacy_ecowitt` on one surface and
  "Unknown source" on another. **Relabeling old rows would change dedupe identity** —
  `source` is a column of the unique dedupe index.
- `sensor-ingest-webhook`'s `mapStoredSourceForTransport` still defaults unknown/empty
  labels to `live` (fail-open), contradicting `sensor-source-badges.md` ("Unknown /
  missing source → invalid"). The deploy version additionally narrows `live → stale` at
  ingest when `captured_at` is outside the freshness window. Gate 4 must resolve the
  fail-open default; the client-INSERT RLS fence (§1) closes only the client path, not the
  token path.
- Whether the **live database's** trigger matches the newest migration is `BLOCKED` from
  the repo: the only production evidence is a frozen audit snapshot dated 2026-06-13
  (`src/test/csv-source-allow-list-audit.test.ts`) that predates the canonical-six
  migration. Re-run `scripts/audit-csv-source-allow-list.ts` against
  `knkwiiywfkbqznbxwqfh` before Phase 1.8 sign-off.

## 3. Idempotency: three mechanisms already exist

| #   | Mechanism                                                                                                                                                                                                                                                                                                    | Status                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1   | **`sensor_readings_dedupe_uidx`** UNIQUE (`user_id, tent_id, source, metric, captured_at`), consumed by both Edge writers via `upsert(..., ignoreDuplicates: true)`. Made non-partial (2026-06-17) so PostgREST infers the conflict target; CI pins column order and forbids re-adding the partial predicate | **Shipped, authoritative** |
| 2   | `pi_ingest_idempotency_keys` table — per-metric, bridge-supplied opaque key, UNIQUE (`user_id, idempotency_key`), FK to the produced reading; service-role-only `pi_ingest_commit_batch`                                                                                                                     | Shipped (pi path only)     |
| 3   | `buildEcoWittRealIngestDedupeKey` — plain unhashed `ecowitt:v1:{tent}:{plant\|none}:{source_identity}:{device_identity}:{captured_at}:{sorted_metric_keys}`; in-memory, response-only, never persisted; behavior test-pinned                                                                                 | Shipped, unpersisted       |

Committed decisions that bound the design space (each CI-pinned or contract-pinned):
`idempotency_key` is **forbidden** as a top-level column (folded into `raw_payload`);
the key is deliberately unhashed and payload-content-free; `tenant_id`,
`payload_fingerprint`, `passkey_hash`, `observed_at`/`received_at` appear nowhere.
The gates doc leaves **which mechanism is authoritative for real ingest** as the open
decision (`ecowitt-future-real-ingest-gates.md` §idempotency, all rows still ⬜).

### Verified hazards any chosen design must answer

1. **NULL `captured_at` bypasses dedupe entirely** — column is nullable, index has no
   `NULLS NOT DISTINCT`, and CI forbids the partial predicate that used to mask this.
2. **`source` is a mutable member of the dedupe key** — deploy-branch ingest re-derives it
   (`live → stale` on late arrival), so a delayed redelivery can miss the collision and
   store twice. (inference — from source, not reproduced against a database)
   **Correction 2026-08-12:** this inference is currently moot — both deployed handlers
   reject stale before any upsert (`sensor-ingest-webhook/index.ts:208-219`, comment:
   "stale would change that conflict key and create a second row. Fail closed";
   `ecowitt-ingest/index.ts:336-342`), so the narrowing branch is unreachable for stale.
   The hazard becomes real only if D4 (stale persistence) is implemented — see the
   spec's D4 correction block.
3. **Key #3 does not canonicalize `captured_at`** — `...Z` vs `.000Z` vs `+00:00` are three
   different keys for the same instant (the pi path _does_ normalize; the EcoWitt builder
   does not).
4. **The metric SET is part of key #3** — a retry that drops one failed metric is a
   different key, by pinned design; a persisted variant inherits that behavior.
5. **Channel collision**: multi-channel air/soil readings map to the same `metric` for one
   (tent, captured_at); the dedupe index then treats second-channel rows as duplicates and
   `ignoreDuplicates` silently drops them. Channel lives only in `raw_payload.channel`.
   Whether the deployed row builder staggers `captured_at` per channel or loses data here is
   `NOT VERIFIED` — reproduce before Phase 1.8 sign-off. (inference)
6. Vocabulary mismatches: validator metric names (`air_temp_f`,
   `soil_water_content_pct`, …) ≠ stored metric names (conversion at insert, pinned by
   e2e test); `pi_ingest_idempotency_keys.metric` CHECK still lists 5 metrics vs the
   trigger's 9.

## 4. Open decisions for Phase 1.8 (the real list)

1. Authoritative idempotency mechanism for real ingest: DB unique index vs persisted key
   (both partially exist) — and the NULL-`captured_at` rule.
2. Soil/air **channel identity**: `hardware_config` maps channels per tent, and
   `soil_moisture_calibrations` already carries `plant_id`+`device_id` (deploy-only), but
   `sensor_readings` itself has no channel column and hazard #5 applies. Owner decision;
   averaging channels remains rejected.
3. Gate 4 remainder: the webhook's fail-open unknown→`live` default, and the `'ecowitt'`
   legacy-source question (relabel = dedupe identity change; likely leave and fence reads).
4. Whether `stale` readings may be persisted at all — explicitly undecided in three docs.
5. V0 contract contradiction: contract requires `plant_id` and `confidence` on stored rows;
   neither column exists (`quality` is the nearest analog).
6. Single source-of-truth module for the canonical six labels (seven redeclarations today).

Sequencing from the [Phase 1.7 record](./ecowitt-real-ingest-phase-1-7-verification-record.md)
stands: persistence stays blocked; gate items 2 and 4 remain owner-only; Phase 1.8 is an
audit that **approves** a write path, not the write path itself
(`ecowitt-future-real-ingest-gates.md`: "Do not add this schema to code").

## Rollback

Delete this file. It records observations only; nothing depends on it.
