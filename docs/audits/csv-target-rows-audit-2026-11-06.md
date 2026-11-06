# Read-only audit: CSV readings that may be saved target/setpoint values

**Status:** spec only, 2026-11-06. Nothing in this document has been run. No result exists yet.
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

## Query (read-only)

```sql
BEGIN TRANSACTION READ ONLY;

WITH csv_rows AS (
  SELECT id, user_id, tent_id, metric, value, captured_at, created_at, raw_payload
  FROM public.sensor_readings
  WHERE source = 'csv'
    -- filter here, before jsonb_each_text, which errors on a non-object
    AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
),
target_cells AS (
  SELECT r.id, r.user_id, r.tent_id, r.metric, r.value, r.created_at,
         kv.key AS target_header, kv.value AS target_cell
  FROM csv_rows r
  CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
  WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
),
classified AS (
  SELECT t.*,
         -- Nested CASE, not AND: PostgreSQL does not promise left-to-right AND evaluation,
         -- so a non-numeric cell could otherwise reach the ::numeric cast and abort the audit.
         CASE
           WHEN t.target_cell ~ '^[[:space:]]*-?[0-9]+(\.[0-9]+)?[[:space:]]*$' THEN
             CASE WHEN abs(t.value - trim(t.target_cell)::numeric) <= 0.05
                  THEN 'value_equals_target_cell'   -- likely saved the target
                  ELSE 'target_column_present'      -- file had a target column; value differs
             END
           ELSE 'target_column_present'
         END AS match_kind
  FROM target_cells t
)
-- 1) Headline counts (no personal data)
SELECT metric, match_kind,
       count(DISTINCT id)       AS readings,
       count(DISTINCT tent_id)  AS tents,
       count(DISTINCT user_id)  AS growers,
       min(created_at)          AS first_saved,
       max(created_at)          AS last_saved
FROM classified
GROUP BY metric, match_kind
ORDER BY metric, match_kind;

-- 2) Rows with no usable raw_row (cannot be classified): report as UNKNOWN, never clean
SELECT metric, count(*) AS readings_without_raw_row
FROM public.sensor_readings
WHERE source = 'csv'
  AND (raw_payload IS NULL OR jsonb_typeof(raw_payload -> 'raw_row') IS DISTINCT FROM 'object')
GROUP BY metric;

-- 3) Which header spellings occurred (header names only, no values or ids).
-- Self-contained: a CTE lives for one statement only, so the filter is repeated here.
SELECT kv.key AS target_header, count(DISTINCT r.id) AS readings
FROM (
  SELECT id, raw_payload FROM public.sensor_readings
  WHERE source = 'csv' AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
) r
CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
WHERE (lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
    OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)')
GROUP BY kv.key
ORDER BY readings DESC
LIMIT 50;

ROLLBACK;
```

## Known limits

- **One row per (reading, target header) pair.** A file with `humidity_target` puts that column in
  the `raw_row` of its temperature, CO₂ and soil readings too. Those unrelated readings show as
  `target_column_present`. Read query 1 together with query 3: a metric is at real risk only when a
  target header for that metric appears.
- **°F targets:** an air-temperature setpoint in °F that was converted and saved shows as
  `target_column_present`, not `value_equals_target_cell`, because the saved value is °C. Review those
  by metric and header, not by value match.
- **Equal by coincidence:** a real reading can equal the target cell (the grower hit the target).
  `value_equals_target_cell` means _likely_, not proven. Proof needs the file's column order, which
  `raw_row` does not keep.
- **SQL run on synthetic rows only, never on production.** On 2026-11-06 all three queries ran
  in an in-process Postgres (PGlite 0.5.15) against nine labeled synthetic rows: target equal to value,
  target different, non-numeric target cell, `raw_payload` NULL, `raw_row` a string, no `raw_row`, a
  clean CSV row, a `manual` row and a BOM-prefixed `SP1` header. Each landed in the expected bucket.
  The header regex matched `isTargetHeader` on 24/24 headers. The draft this replaces aborted on the
  string `raw_row` (`cannot call jsonb_each_text on a non-object`). This proves the SQL text, not
  production behavior; a production run is still `NOT_MEASURED`.
- **Timing:** run after #2908 is live (live `/version.json` reports `01f30d11` or a descendant), so
  no new affected rows land mid-audit. Record that SHA in the receipt.

## Receipt to record (the person who runs it)

- Who ran it, seat, time (UTC), production project, live `/version.json` SHA.
- Output of queries 1–3 as shown. **No** user ids, tent ids, row ids or raw values in any shared
  channel.
- Status: `PASS` only if query 1 returns zero rows **and** query 2 returns zero rows. Otherwise
  `FAIL` (affected rows may exist) or `NOT_MEASURED` (could not run).

## Not authorized by this spec

Any UPDATE/DELETE; corrections through `manual_sensor_correction_operations`, the CSV batch undo
proposed in #2909, or otherwise; grower notifications; exports; or AI Doctor/alert re-runs. If rows
are found, the next step is a separate correction proposal (append-only, owner-approved), sized from
query 1 and query 3.
