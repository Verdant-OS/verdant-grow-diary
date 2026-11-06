# Read-only audit: CSV readings that may be saved target/setpoint values

**Status:** spec only, 2026-11-06 (round 2). Never run on production. No result exists yet.
**Author:** Claude (CSV-TARGET-SETPOINT-EXCLUSION workstream; fix #2908, merged as
`01f30d11ad3337c3788e18fc46aae33a871e7677`).
**Runs:** only by a seat authorized for production reads, under
`docs/production-only-verification-runbook.md`. No writes, no corrections, no exports of raw rows.
Committing this spec authorizes nobody to run it.

## Grower problem

Before #2908, CSV import could save a column the grower meant as a **target** (what they want)
as a **reading** (what was measured):

- **Soil** (`soil_temp_c`, `soil_moisture_pct`, `ec`): possible from
  `1ba766fbb6fa864e93341c13937dc978649c1db6` (#2902, merged 2026-11-05 23:34 UTC) onward, once that
  build was live. _Whether and when it went live: `NOT_MEASURED`._
- **Air** (`humidity_pct`, `vpd_kpa`, `co2_ppm`, `ppfd`): possible for as long as CSV import has
  matched those columns. Air temperature already excluded `target`/`setpoint`, but **not** `SetPt`,
  `Set Pt`, `S.P.`, `tgt` and similar.

Those values could have reached the Timeline, Sensor Snapshot, AI Doctor context and alerts as if
measured. This audit **only counts rows**. Correction is a separate, owner-approved step.

## Evidence it relies on (`established fact`, deploy branch at `01f30d11`)

- CSV rows go to `public.sensor_readings` with `source = 'csv'`, one row per metric
  (`src/lib/environmentCsvImportPersistence.ts`).
- `raw_payload.raw_row` holds the **whole original CSV row**, keyed by header
  (`raw_row: Record<string, string>`). A target column therefore survives in every saved row from
  that file, even when it was not imported.
- `raw_payload jsonb` and `captured_at timestamptz` were added in
  `supabase/migrations/20260523000307_26db2542-8cd4-4e62-aeec-32756f439599.sql`. Older `csv` rows may
  have no `raw_row`. Those are counted separately as **unknown**, never as clean.
- `value` is `numeric`.

## Matching rule

The SQL uses the same header test as `isTargetHeader` in `src/lib/csvParser.ts` at `01f30d11`.
The parser normalizes a header by stripping a leading BOM, lowercasing and trimming; the SQL
lowercases only. Neither difference changes a match, because both patterns are unanchored or
treat any non-letter as a boundary.

- `target|goal|desired|ideal|set[\s_.-]?p(oin)?t`, or
- standalone `tgt|sp|s.p.|set|setting`

Keep this in step with `isTargetHeader` at the head that is live when the audit runs. Open PR #2911
(limit/alarm/threshold exclusion, another session) edits `csvParser.ts`; limit, alarm and threshold
columns stay out of scope here.

## Queries (read-only)

**How to run.** Run each query **on its own** and record **each** result set, including an empty
one. Several SQL tools return only the last statement of a multi-statement script, so never paste
these as one script. Use a read-only session where the client allows it (in `psql`:
`BEGIN TRANSACTION READ ONLY;`, then each query, then `ROLLBACK;`). Every query is a plain `SELECT`.

**Query 0: denominator and visibility.** It always returns one row.

```sql
SELECT current_user AS run_as,
       (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_rls,
       count(*) AS csv_rows,
       count(*) FILTER (WHERE jsonb_typeof(raw_payload -> 'raw_row') = 'object'
                          AND raw_payload -> 'raw_row' <> '{}'::jsonb) AS csv_rows_with_raw_row
FROM public.sensor_readings
WHERE source = 'csv';
```

`sensor_readings` has row-level security (`20260516204601_…sql:155`). A role without
`bypasses_rls = true` sees only its own rows, or none, and every query below then returns empty. A
table owner without `rolbypassrls` also reads as `false` here. That is a safe false negative: the
result becomes `NOT_MEASURED`, never `PASS`.

**Query 1: candidate readings, by metric and kind.** It returns one row per (metric, kind) present.

```sql
WITH csv_rows AS (
  SELECT id, user_id, tent_id, metric, value, created_at, raw_payload
  FROM public.sensor_readings
  WHERE source = 'csv'
    -- filter here, before jsonb_each_text, which errors on a non-object
    AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
),
target_cells AS (
  SELECT r.id, r.user_id, r.tent_id, r.metric, r.value, r.created_at,
         r.raw_payload ->> 'vpd_source' AS vpd_source,
         lower(kv.key) AS h, kv.value AS target_cell
  FROM csv_rows r
  CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
  WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
),
classified AS (
  SELECT t.*,
         -- Header heuristic: does this target header belong to the reading's own metric?
         -- Derived VPD (vpd_source = 'derived') was computed from the row's temperature and
         -- humidity (csvParser.ts computeVpdKpa), so a temperature or humidity target counts for it.
         CASE t.metric
           WHEN 'temperature_c'     THEN t.h ~ 'temp' AND t.h !~ 'soil'
           WHEN 'humidity_pct'      THEN t.h ~ '(hum|rh)'
           WHEN 'vpd_kpa'           THEN t.h ~ 'vpd'
                                      OR (t.vpd_source = 'derived'
                                          AND ((t.h ~ 'temp' AND t.h !~ 'soil') OR t.h ~ '(hum|rh)'))
           WHEN 'co2_ppm'           THEN t.h ~ 'co2'
           WHEN 'ppfd'              THEN t.h ~ '(ppfd|par|light)'
           WHEN 'soil_temp_c'       THEN t.h ~ 'soil' AND t.h ~ 'temp'
           WHEN 'soil_moisture_pct' THEN t.h ~ '(moist|vwc)'
           WHEN 'ec'                THEN t.h ~ '(^|[^a-z])ec([^a-z]|$)|conduct'
           ELSE false
         END AS same_metric,
         -- Nested CASE, not AND: PostgreSQL does not promise AND evaluation order,
         -- so a non-numeric cell could otherwise reach the ::numeric cast and abort the audit.
         CASE
           WHEN t.target_cell ~ '^[[:space:]]*-?[0-9]+(\.[0-9]+)?[[:space:]]*$' THEN
             abs(t.value - trim(t.target_cell)::numeric) <= 0.05
           ELSE false
         END AS value_equals_cell
  FROM target_cells t
),
per_reading AS (
  -- One verdict per reading, so buckets never double-count a reading.
  SELECT id, user_id, tent_id, metric, created_at,
         CASE
           WHEN bool_or(same_metric AND value_equals_cell) THEN 'likely_saved_target'
           WHEN bool_or(same_metric)                       THEN 'same_metric_target_present'
           ELSE 'other_metric_target_only'
         END AS kind
  FROM classified
  GROUP BY id, user_id, tent_id, metric, created_at
)
SELECT metric, kind,
       count(*)                 AS readings,
       count(DISTINCT tent_id)  AS tents,
       count(DISTINCT user_id)  AS growers,
       min(created_at)          AS first_saved,
       max(created_at)          AS last_saved
FROM per_reading
GROUP BY metric, kind
ORDER BY metric, kind;
```

Each reading lands in exactly one `kind`, so `readings` can be summed.

**Query 2: readings that cannot be classified.** Report them as UNKNOWN, never clean.

```sql
SELECT metric, count(*) AS readings_without_usable_raw_row
FROM public.sensor_readings
WHERE source = 'csv'
  AND (raw_payload IS NULL
       OR jsonb_typeof(raw_payload -> 'raw_row') IS DISTINCT FROM 'object'
       OR raw_payload -> 'raw_row' = '{}'::jsonb)
GROUP BY metric
ORDER BY metric;
```

**Query 3: which header spellings occurred.** Header names only, with no values or ids.

```sql
SELECT kv.key AS target_header, count(DISTINCT r.id) AS readings
FROM (
  SELECT id, raw_payload FROM public.sensor_readings
  WHERE source = 'csv' AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
) r
CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
GROUP BY kv.key
ORDER BY readings DESC, kv.key
LIMIT 50;
```

## Known limits

- **Same-metric matching is a header heuristic.** A file with `humidity_target` puts that column in
  the `raw_row` of its temperature, CO₂ and soil readings too. Those readings land in
  `other_metric_target_only`. The `same_metric` mapping in query 1 is keyword-based. A header it
  doesn't recognize falls to `other_metric_target_only`, which is still a review state, never clean.
  Read query 1 with query 3.
- **Derived VPD.** When a file had no VPD column, VPD was computed from the row's imported
  temperature and humidity. Before #2908, a humidity target could feed that calculation. Those
  `vpd_kpa` readings (`raw_payload.vpd_source = 'derived'`) count as same-metric whenever a
  temperature or humidity target header is present. Their value is a calculation, so it rarely
  equals a target cell, and they usually appear as `same_metric_target_present`.
- **°F targets:** an air-temperature setpoint in °F that was converted and saved shows as
  `same_metric_target_present`, not `likely_saved_target`, because the saved value is °C. Review those
  by metric and header, not by value match.
- **Equal by coincidence:** a real reading can equal the target cell (the grower hit the target).
  `likely_saved_target` means _likely_, not proven. Proof needs the file's column order, which
  `raw_row` does not keep.
- **SQL run on synthetic rows only, never on production.** See "Validation" below.
- **Timing:** run after #2908 is live (live `/version.json` reports `01f30d11` or a descendant), so
  no new affected rows land mid-audit. Record that SHA in the receipt. `practical observation`,
  2026-11-06: live `/version.json` reported `01f30d11ad3337c3788e18fc46aae33a871e7677`, from a
  read-only fetch; re-check it at run time.

## Receipt to record (the person who runs it)

- Who ran it, seat, time (UTC), production project, live `/version.json` SHA, and query 0's
  `run_as` and `bypasses_rls`.
- Every result set from queries 0–3, each recorded separately. Write "0 rows" for an empty one.
  **No** user ids, tent ids, row ids or raw values in any shared channel.
- Status (AGENTS.md §15), decided in this order:
  1. `NOT_MEASURED`: any query missing, errored or not recorded separately, or
     `bypasses_rls` is not `true`.
  2. `NO_DATA`: query 0 `csv_rows` = 0. There is nothing to classify. This is not a pass.
  3. `FAIL`: query 1 has any `likely_saved_target` row. A defect is likely present; size the
     correction from it.
  4. `NEEDS_REVIEW` (unresolved, never a pass): query 1 has only `same_metric_target_present` or
     `other_metric_target_only` rows, or query 2 has any row.
  5. `PASS`: only when query 0 `csv_rows` > 0 and `bypasses_rls` = `true`, and queries 1 and 2
     each returned an actual empty result set.

## Validation (synthetic rows only)

`practical observation`, 2026-11-06. This proves the SQL text, not production behavior. No real
database was contacted.

- **Engine:** in-process Postgres (PGlite 0.5.15) in a scratch directory outside the repo. The
  table is a minimal `public.sensor_readings (id, user_id, tent_id, metric, value numeric,
captured_at, created_at, source, raw_payload jsonb)`.
- **13 synthetic rows, each labeled:**
  - soil temp saved 30 with `soil_temp_target_c=30`: `likely_saved_target`
  - soil temp saved 20 from the same file: `same_metric_target_present`
  - humidity 50 with `humidity_target=60`, plus a non-numeric `Hum SetPt` cell in the same file: no
    abort, `same_metric_target_present`
  - derived VPD with `humidity_target`: `same_metric_target_present`
  - CO₂ with only `humidity_target`: `other_metric_target_only`
  - one reading with two target headers: counted once
  - `raw_payload` NULL, `raw_row` a string, `raw_row` `{}`, no `raw_row`: all in query 2
  - a clean CSV row and a `manual` row with a target header: excluded
  - a BOM-prefixed `SP1` header: matched (`other_metric_target_only`; `SP1` names no metric)
- **Gates:**
  - the results matched expectations
  - under an RLS-filtered non-owner role, query 0 reads `bypasses_rls = false` and `csv_rows = 0`,
    and queries 1–3 return 0 rows, so the receipt rule gives `NOT_MEASURED`
  - a `DELETE` inside `BEGIN TRANSACTION READ ONLY` was refused
  - the header regex matched `isTargetHeader` on 24/24 headers
- **Defects fixed relative to the earlier drafts:**
  - an abort on a non-object `raw_row`
  - an AND-ordered numeric cast
  - a CTE referenced from a second statement
  - a PASS rule that read an empty or RLS-hidden result as clean (independent review P2-1)

## Not authorized by this spec

Any UPDATE/DELETE; corrections through `manual_sensor_correction_operations`, the CSV batch undo
proposed in #2909, or otherwise; grower notifications; exports; or AI Doctor/alert re-runs. If rows
are found, the next step is a separate correction proposal (append-only, owner-approved), sized from
queries 1 and 3.
