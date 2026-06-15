# EC Temperature-Compensation Feasibility Audit

Status: AUDIT ONLY — no schema, ingest, trigger, cron, Edge, RLS, alert, webhook,
or historical data changes proposed in this slice.

## 1. Current `public.sensor_readings` schema (verified via `\d`)

| Column        | Type          | Notes |
| ------------- | ------------- | ----- |
| `id`          | uuid          | PK |
| `user_id`     | uuid (NN)     | `auth.uid()` default — ownership boundary |
| `tent_id`     | uuid (NN)     | scope key |
| `ts`          | timestamptz   | now() default |
| `metric`      | text (NN)     | enum-like (`temperature_c`, `humidity_pct`, `vpd_kpa`, `co2_ppm`, `soil_moisture_pct`, `ph`, `ec`, `ppfd`) |
| `value`       | numeric (NN)  | unitless number — **unit is implicit per metric** |
| `quality`     | text (NN)     | `ok` \| `degraded` \| `stale` \| `invalid` |
| `source`      | text (NN)     | `manual`, `pi_bridge`, `sim`, `webhook_generic`, `node_red_bridge`, `esp32_*`, `home_assistant_bridge`, `ha_forwarded`, `ecowitt`, `mqtt`, `csv`, `webhook` |
| `device_id`   | text          | nullable |
| `raw_payload` | jsonb         | vendor lineage lives here (`raw_payload.vendor`, `raw_payload.source_app`) |
| `captured_at` | timestamptz   | nullable — used for dedupe uniq index |
| `created_at`  | timestamptz   | insert time |

There is **no `plant_id`, no `confidence`, no explicit `ec_unit`, no
`temperature_unit`, no `ec_compensated_25c`** column. Temperature lives in a
**separate row** (`metric='temperature_c'`) from EC (`metric='ec'`). There is
no FK to a vendor/source table — vendor lineage is JSON in `raw_payload`.

### Column-mismatch risks for any compensation column
- A new `ec_compensated_25c` column would only make sense on the EC row, but
  the temperature companion row may be missing, out-of-window, from another
  source, or `quality != 'ok'`. A trigger-time calculation has no guarantee
  the matching temperature exists in the same insert.
- `value` is unitless; the unit for `metric='ec'` is conventionally mS/cm in
  app code (`toCanonicalMscm`), but historical rows from Ecowitt/MQTT/CSV
  bridges have entered through different normalizers over time. Backfilling
  blindly would assume mS/cm even where rows may be µS/cm or PPM-scaled.
- `captured_at` is nullable; falling back to `ts` for pairing temp+EC mixes
  ingest-time with capture-time and skews compensation.

## 2. Existing normalization & truth rules (already in repo)
- `src/constants/units.ts` — canonical: temperature stored in **Celsius**,
  EC canonicalized to **mS/cm** at app boundary. Display-only Fahrenheit.
- `src/lib/ecUnits.ts` — `toCanonicalMscm()` + `EC_PLAUSIBLE_MAX` per unit
  (mS/cm 5, µS/cm 5000, PPM-500 2500, PPM-700 3500).
- `src/lib/sensorReadingNormalizationRules.ts`,
  `sensorIngestNormalizationRules.ts`, `ecowittSuspiciousReadingRules.ts`,
  `ecowittLiveEvidenceUnitWarningRules.ts` — already flag µS/cm vs mS/cm
  drift, stuck values, and out-of-range telemetry.
- `validate_sensor_reading()` DB trigger enforces metric/source/quality
  allow-lists and rejects NaN / >5min-future `captured_at`.
- Source labels enforced upstream: `live` / `manual` / `csv` / `demo` /
  `stale` / `invalid` semantics live in `sensorSourceLabelRules.ts` and
  `sensorTruthRules.ts`.

## 3. Unit risks
- **µS/cm vs mS/cm (1000×):** A reading of `1.8` is plausible mS/cm; `1800`
  is the same in µS/cm. If a bridge ever wrote µS/cm into a row tagged as
  EC (canonical mS/cm), backfill would compensate a value that is already
  3 orders of magnitude wrong — and the "compensated" number would look
  even more authoritative.
- **PPM-500 / PPM-700:** legacy CSVs may have been ingested at PPM scale.
  No column records which scale was used; only `raw_payload` may hint.
- **Celsius vs Fahrenheit:** schema is Celsius-only, but Ecowitt/HA payloads
  have historically arrived as °F before normalization. A historical row of
  `78` could be 78 °F (≈ 25.6 °C) or 78 °C (impossible). Compensation
  formulas amplify temperature error linearly (~2 % per °C).

## 4. Are historical rows safe to backfill?
**No, not without per-row provenance.** Required preconditions that do not
exist today:
1. A per-row `ec_unit` column (or trusted invariant) for every historic EC row.
2. A per-row temperature pairing rule (same tent, ≤ N minutes, same source
   class, `quality='ok'`).
3. A frozen audit of which `source` × time-window combinations were known to
   carry unit drift, so they can be excluded.

Until (1)–(3) exist, a backfill UPDATE would mutate historical truth and
make later forensics impossible. Append-only is the only safe path.

## 5. Should live ingest calculate compensation now?
**No.** Live ingest writes EC and temperature as **separate rows** with no
guaranteed temporal pairing inside the same transaction. Trigger-based
compensation would either (a) silently drop EC rows when a fresh temp row is
missing, or (b) compensate against stale temps — both unsafe. Compensation
belongs in a **read-time pure helper** (view-model layer) where the caller
explicitly supplies paired (ec, temp, units, source).

## 6. Is trigger-based calculation safe?
**No.** Triggers cannot see the future temperature row, cannot reject
suspicious units without a unit column, and would couple ingest latency to
business logic. They also bypass the cautious-AI principle: an EC value
written to the column would be treated as ground truth downstream.

## 7. pg_cron, materialized views, alert webhooks, Edge Functions
Out of scope for this audit. None justified until §4–§6 are solved.

## 8. Recommended smallest next build
1. (This audit) ✅
2. Add `src/lib/ecCompensationRules.ts` — **pure, read-time** helper. No DB,
   no Supabase, no writes. Returns `compensatedEc25c` or a `blockedReason`
   when inputs are unsafe (unknown unit, suspicious magnitude, stale/demo
   source, missing temp). View-model layer can adopt it without touching
   ingest.
3. Later (separate, explicit task): add an `ec_unit` column with a default
   reflecting current ingest, and a per-source backfill plan **only for
   rows whose `raw_payload` unambiguously records the unit**. Never mutate
   `value`; add columns, do not overwrite.
4. Only after (3) is proven: consider a read-time materialized view. Still
   no triggers, still no cron-driven mutation.

## 9. Safety verdict
SAFE to add a read-only pure helper and this doc. Any of the originally
proposed package items (trigger, batch backfill, pg_cron, materialized
view, alert webhook, Edge Function) remain **blocked** pending the
provenance work in §8.3.
