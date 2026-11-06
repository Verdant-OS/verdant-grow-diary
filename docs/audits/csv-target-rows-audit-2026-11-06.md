# Read-only audit: CSV readings that may be saved target/setpoint values

**Status:** spec only, 2026-11-06. Merged in #2912 as `ac97a03c404ca39fcd198ebd40efe43cb81e5ca9`;
query 4 added after merge (review 5796150535, P3-2). Never run on production. No result exists yet.
**Author:** Claude (CSV-TARGET-SETPOINT-EXCLUSION workstream). Fixes covered: #2908 (targets and
setpoints, merged as `01f30d11ad3337c3788e18fc46aae33a871e7677`) and #2911 (limits, alarms and
thresholds, merged as `cc8da1790d35ea0c41a788ce0593d8e4c3c9b9ac`).
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
- **Limits, alarms and thresholds** (`humidity_high_limit`, `co2_alarm`, `temp_alert`,
  `vpd_threshold`, `…_trigger`): the same defect class until #2911 (`cc8da179`, merged
  2026-11-06 05:09 UTC). This audit covers them too.

Those values could have reached the Timeline, Sensor Snapshot, AI Doctor context and alerts as if
measured. This audit **only counts rows**. Correction is a separate, owner-approved step.

## Evidence it relies on (`established fact`, deploy branch at `cc8da179`)

- CSV rows go to `public.sensor_readings` with `source = 'csv'`, one row per metric
  (`src/lib/environmentCsvImportPersistence.ts`).
- `raw_payload.raw_row` holds the **whole original CSV row**, keyed by header
  (`raw_row: Record<string, string>`). A target column therefore survives in every saved row from
  that file, even when it was not imported.
- `raw_payload jsonb` and `captured_at timestamptz` were added in
  `supabase/migrations/20260523000307_26db2542-8cd4-4e62-aeec-32756f439599.sql`. Older `csv` rows may
  have no `raw_row`. Those are counted separately as **unknown**, never as clean.
- `value` is `numeric`.
- **A second CSV writer exists.** `src/lib/registryCsvInsertRowsAdapter.ts` also builds
  `source = 'csv'` rows with a `raw_row` of the same shape, plus `raw_payload.csv_import = true`. It
  maps columns by exact name and does not use `isTargetHeader`. A `grep` at `cc8da179` found no
  runtime caller; that it never wrote production rows is `inference`. Query 1 reports the two paths
  separately (`path`). `ggsCsvParseRules.ts` emits `source: "csv"` with `original_row`, not
  `raw_row`. If such rows were ever persisted, they land in query 2 as unknown.

## Matching rule

The SQL uses the same header test as `isTargetHeader` in `src/lib/csvParser.ts` at `cc8da179`
(after #2911). It is **pinned to that head**: the audit sizes what the old code could have saved,
so it uses the full header test the two fixes now apply.
The parser normalizes a header by stripping a leading BOM, lowercasing and trimming; the SQL
lowercases only. Neither difference changes a match, because both patterns are unanchored or
treat any non-letter as a boundary.

- `target|goal|desired|ideal|set[\s_.-]?p(oin)?t`, or
- `limit|alarm|alert|threshold|trigger` (#2911), or
- standalone `tgt|sp|s.p.|set|setting`

If `isTargetHeader` changes after `cc8da179`, this spec does not cover the new alternatives. A
receipt for such a run must say which head the matcher equals.

## Queries (read-only)

**How to run.** Run each query **on its own** and record **each** result set, including an empty
one. Several SQL tools return only the last statement of a multi-statement script, so never paste
these as one script. Use one read-only snapshot where the client allows it (in `psql`:
`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;`, then each query, then `ROLLBACK;`),
so all five queries see the same rows. Every query is a plain `SELECT`.

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
  SELECT id, user_id, tent_id, metric, value, created_at, raw_payload,
         CASE WHEN raw_payload ? 'csv_import' THEN 'registry' ELSE 'environment' END AS path
  FROM public.sensor_readings
  WHERE source = 'csv'
    -- filter here, before jsonb_each_text, which errors on a non-object
    AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
),
target_cells AS (
  SELECT r.id, r.user_id, r.tent_id, r.metric, r.value, r.created_at, r.path,
         r.raw_payload ->> 'vpd_source' AS vpd_source,
         lower(kv.key) AS h, kv.value AS target_cell
  FROM csv_rows r
  CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
  WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(limit|alarm|alert|threshold|trigger)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
),
classified AS (
  SELECT t.*,
         -- Header heuristic: does this target header belong to the reading's own metric?
         -- Derived VPD (vpd_source = 'derived') was computed from the row's temperature and
         -- humidity (csvParser.ts computeVpdKpa), so a temperature or humidity target counts for it.
         CASE t.metric
           WHEN 'temperature_c'     THEN t.h ~ 'temp' AND t.h !~ 'soil'
           WHEN 'humidity_pct'      THEN t.h ~ '(hum|rh)' AND t.h !~ 'soil'
           WHEN 'vpd_kpa'           THEN t.h ~ 'vpd'
                                      OR (t.vpd_source = 'derived'
                                          AND t.h !~ 'soil' AND t.h ~ '(temp|hum|rh)')
           WHEN 'co2_ppm'           THEN t.h ~ 'co2'
           WHEN 'ppfd'              THEN t.h ~ '(ppfd|par|light)'
           WHEN 'soil_temp_c'       THEN t.h ~ 'soil' AND t.h ~ 'temp'
           -- matches classifySoilHeaders: soil + (humidity|moisture|vwc|water)
           WHEN 'soil_moisture_pct' THEN t.h ~ 'soil' AND t.h ~ '(moist|vwc|humid|water)'
           WHEN 'ec'                THEN t.h ~ '(^|[^a-z])ec([^a-z]|$)|conduct'
           ELSE false
         END AS same_metric,
         -- Nested CASE, not AND: PostgreSQL does not promise AND evaluation order,
         -- so a non-numeric cell could otherwise reach the ::numeric cast and abort the audit.
         CASE
           -- optional trailing % is stripped, as the parser does for humidity (csvParser.ts)
           WHEN t.target_cell ~ '^[[:space:]]*-?[0-9]+(\.[0-9]+)?[[:space:]]*%?[[:space:]]*$' THEN
             abs(t.value - rtrim(trim(t.target_cell), '%')::numeric) <= 0.05
           ELSE false
         END AS value_equals_cell
  FROM target_cells t
),
per_reading AS (
  -- One verdict per reading, so buckets never double-count a reading.
  SELECT id, user_id, tent_id, metric, created_at, path,
         CASE
           WHEN bool_or(same_metric AND value_equals_cell) THEN 'likely_saved_target'
           WHEN bool_or(same_metric)                       THEN 'same_metric_target_present'
           ELSE 'other_metric_target_only'
         END AS kind
  FROM classified
  GROUP BY id, user_id, tent_id, metric, created_at, path
)
SELECT path, metric, kind,
       count(*)                 AS readings,
       count(DISTINCT tent_id)  AS tents,
       count(DISTINCT user_id)  AS growers,
       min(created_at)          AS first_saved,
       max(created_at)          AS last_saved
FROM per_reading
GROUP BY path, metric, kind
ORDER BY path, metric, kind;
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

**Query 3: which header spellings occurred.** Header names only, with no values or ids. Headers
are grower-written text and may hold a name or markup, so **query 3's output stays in the
restricted console**. The shared receipt gives only its row count. Per-pattern counts come from
query 4, which returns no header text.

```sql
SELECT kv.key AS target_header, count(DISTINCT r.id) AS readings
FROM (
  SELECT id, raw_payload FROM public.sensor_readings
  WHERE source = 'csv' AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
) r
CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(limit|alarm|alert|threshold|trigger)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
GROUP BY kv.key
ORDER BY readings DESC, kv.key
LIMIT 50;
```

**Query 4: per-pattern counts, safe to share.** Counts only, with no header text, values or ids.
Each matched header spelling gets exactly one pattern: the first alternative it matches, in the
order target/setpoint, then limit/alarm, then standalone. The three patterns are the same
alternatives as queries 1 and 3. It returns one row per pattern present.

```sql
SELECT CASE
         WHEN lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
           THEN '1_target_setpoint'
         WHEN lower(kv.key) ~ '(limit|alarm|alert|threshold|trigger)'
           THEN '2_limit_alarm'
         ELSE '3_standalone'
       END AS pattern,
       count(DISTINCT kv.key) AS header_spellings,
       count(DISTINCT r.id)   AS readings
FROM (
  SELECT id, raw_payload FROM public.sensor_readings
  WHERE source = 'csv' AND jsonb_typeof(raw_payload -> 'raw_row') = 'object'
) r
CROSS JOIN LATERAL jsonb_each_text(r.raw_payload -> 'raw_row') AS kv
WHERE lower(kv.key) ~ '(target|goal|desired|ideal|set[[:space:]_.-]?p(oin)?t)'
     OR lower(kv.key) ~ '(limit|alarm|alert|threshold|trigger)'
     OR lower(kv.key) ~ '(^|[^a-z])(tgt|sp|s\.p\.?|set|setting)([^a-z]|$)'
GROUP BY 1
ORDER BY 1;
```

`header_spellings` can be summed: when query 3 returned fewer than 50 rows, the sum equals query 3's
row count. `readings` cannot be summed, because one reading whose file has headers of two patterns
counts once in each.

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
- **Percent and fraction cells:** a trailing `%` is stripped before the value match. Humidity saved
  from a 0–1 cell (`0.6` scaled to 60 by the parser) does not equal its cell, so it lands in
  `same_metric_target_present`, not `likely_saved_target`. Review those by header.
- **°F targets:** an air-temperature setpoint in °F that was converted and saved shows as
  `same_metric_target_present`, not `likely_saved_target`, because the saved value is °C. Review those
  by metric and header, not by value match.
- **Equal by coincidence:** a real reading can equal the target cell (the grower hit the target).
  `likely_saved_target` means _likely_, not proven. Proof needs the file's column order, which
  `raw_row` does not keep.
- **SQL run on synthetic rows only, never on production.** See "Validation" below.
- **Timing:** run only once live `/version.json` reports `cc8da179` or a descendant, so no new
  affected rows land mid-audit. Record that SHA in the receipt. `source claim`, round-2 review
  2026-11-06: live reported `cc8da1790d35…`, from a read-only fetch. Re-check it at run time.

## Receipt to record (the person who runs it)

- Who ran it, seat, time (UTC), production project ref, live `/version.json` SHA, and query 0's
  `run_as` and `bypasses_rls`.
- Results of queries 0–2 and 4, each recorded separately ("0 rows" for an empty one). For query 3,
  give only its row count, never the header text (see query 3). Per-pattern counts
  (target/setpoint, limit/alarm, standalone) are query 4's result, copied as returned. **No** user ids, tent ids, row ids, header text or raw values in any
  shared channel.
- Status (AGENTS.md §15). Apply the first rule that holds:
  1. `NOT_MEASURED` when any of these is true:
     - any query is missing, errored or not recorded separately
     - `bypasses_rls` is not `true`
     - the production project ref or live SHA is not recorded and verified
     - the reconciliation fails: `csv_rows − csv_rows_with_raw_row` must equal the query 2 total
     - query 3 returned fewer than 50 rows and the sum of query 4's `header_spellings` differs
       from query 3's row count
  2. `NO_DATA`: query 0 `csv_rows` = 0. There is nothing to classify. This is not a pass.
  3. `FAIL (likely)`: query 1 has any `likely_saved_target` row, meaning a value equal to a
     target cell on a same-metric header. That is strong evidence, not proof (see "Equal by
     coincidence"). Size the correction from it.
  4. `BLOCKED: needs owner review` (never a pass): query 1 has only
     `same_metric_target_present` or `other_metric_target_only` rows, or query 2 has any row.
  5. `PASS`: only when none of the above holds. Query 0 `csv_rows` > 0, `bypasses_rls` =
     `true`, the reconciliation holds, and queries 1 and 2 each returned an actual empty result
     set. This PASS covers the header patterns above as of `cc8da179`, nothing wider.

## Validation (synthetic rows only)

`practical observation`, 2026-11-06. This proves the SQL text, not production behavior. No real
database was contacted.

- **Engine:** in-process Postgres (PGlite 0.5.15) in a scratch directory outside the repo. The
  table is a minimal `public.sensor_readings (id, user_id, tent_id, metric, value numeric,
captured_at, created_at, source, raw_payload jsonb)`.
- **19 synthetic rows, each labeled:**
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
  - round 3: humidity 80 with `humidity_high_limit=80` (#2911 class): `likely_saved_target`
  - round 3: soil moisture 40 with `Soil Water Target=40`: `likely_saved_target`
  - round 3: air humidity 45 with only `soil_humidity_target=45`: `other_metric_target_only`, not a
    false FAIL
  - round 3: humidity 60 with `RH Target` cell `60 %`: `likely_saved_target`
  - round 3: humidity 60 with `RH Target` cell `0.6`: `same_metric_target_present` (see Known
    limits)
  - round 3: a registry-path row (`csv_import`) with `co2_target=900`: `path = registry`,
    `likely_saved_target`
- **Gates:**
  - the results matched expectations
  - under an RLS-filtered non-owner role, query 0 reads `bypasses_rls = false` and `csv_rows = 0`,
    and queries 1–3 return 0 rows, so the receipt rule gives `NOT_MEASURED`
  - a `DELETE` inside `BEGIN TRANSACTION READ ONLY` was refused
  - reconciliation: `csv_rows − csv_rows_with_raw_row` equaled the query 2 total
  - the header test matched `isTargetHeader` at `cc8da179` on 36/36 headers. The function was
    loaded from that commit's source, and the headers included limit/alarm/alert/threshold/trigger
    spellings and look-alikes (`Sunset`, `Offset`, `Speed`, `Spectrum`, `Tgt2`, `Limiter`)
- **Query 4 (closeout, after merge), same engine, 22 synthetic rows:** the 19 above plus three
  labeled rows for first-match order: `co2_target_alarm` (target and alarm) lands in
  `1_target_setpoint`; `Alarm SP` (alarm and standalone `sp`) lands in `2_limit_alarm`; `set` alone
  lands in `3_standalone`. Result: `1_target_setpoint` 10 spellings / 12 readings, `2_limit_alarm`
  2 / 2, `3_standalone` 2 / 2. The sum of `header_spellings` (14) equals query 3's row count (14),
  and query 4's `WHERE` clause is text-identical to query 3's. Under the RLS-filtered non-owner role,
  query 4 returns 0 rows with `bypasses_rls = false`. Queries 0–3 were re-run unchanged: the 19
  original rows kept their classifications.
- **Defects fixed relative to the earlier drafts:**
  - an abort on a non-object `raw_row`
  - an AND-ordered numeric cast
  - a CTE referenced from a second statement
  - a PASS rule that read an empty or RLS-hidden result as clean (independent review P2-1)
  - a matcher that missed the #2911 limit/alarm class (round-2 review P2-1)

## Not authorized by this spec

Any UPDATE/DELETE; corrections through `manual_sensor_correction_operations`, the CSV batch undo
proposed in #2909, or otherwise; grower notifications; exports; or AI Doctor/alert re-runs. If rows
are found, the next step is a separate correction proposal (append-only, owner-approved), sized from
queries 1 and 3.
