# EcoWitt Source Backfill Plan (DOCS-ONLY — DO NOT AUTORUN)

> **Status:** Plan only. No migration is being introduced by this document.
> **Default mode:** Dry-run / read-only. Any future script MUST refuse to
> mutate data unless an operator passes an explicit `--execute` flag *and*
> a fresh database backup has been verified.

## Purpose

Remap historical `sensor_readings.source = 'ecowitt'` rows to the canonical
Verdant stored source `'live'`, while preserving the original transport
label as lineage in `raw_payload.metadata.transport_source` so audit /
debugging never loses provenance.

Going forward, the sensor-ingest-webhook performs this remap atomically on
insert (see `supabase/functions/sensor-ingest-webhook/storageMapping.ts`).
This backfill only addresses rows that landed before the remap shipped.

## Why

Verdant canonical stored-source labels are:

```
live | manual | csv | demo | stale | invalid
```

`"ecowitt"` is a transport / vendor lineage label, not a telemetry-truth
label. It belongs in `raw_payload.vendor` and `raw_payload.metadata.transport_source`,
never in the stored `source` column. Auth, ownership, and routing must
never trust vendor labels.

## Risks

1. **Dedupe collision** on `(user_id, tent_id, source, metric, captured_at)`.
   - An old `source='ecowitt'` row may share that key with a newer
     `source='live'` row that arrived after the webhook remap shipped.
   - Naive `UPDATE` would violate the partial unique index
     `sensor_readings_dedupe_uidx`.
2. **Raw payload exposure.** Backfill output (logs, samples) must never
   echo `raw_payload` verbatim — it can contain vendor secrets (PASSKEY,
   API tokens) for historical rows that pre-date sanitization.
3. **Trigger validation.** `public.validate_sensor_reading` still accepts
   `'ecowitt'` for back-compat, so the database itself does not reject
   the legacy rows. The backfill is operator hygiene, not a correctness
   blocker.
4. **Cross-user accident.** A poorly scoped query could touch other
   users' rows. Backfill MUST be scoped per-user or fully-qualified.

## Dry-run queries (READ-ONLY)

Run these first. They never write.

```sql
-- 1. Count candidate rows (transport label still stored as source).
SELECT count(*) AS ecowitt_rows
FROM public.sensor_readings
WHERE source = 'ecowitt';

-- 2. Count would-be collisions if we naively flipped to source='live'.
--    Each row here means an UPDATE would conflict with sensor_readings_dedupe_uidx.
SELECT count(*) AS collision_rows
FROM public.sensor_readings e
WHERE e.source = 'ecowitt'
  AND EXISTS (
    SELECT 1
    FROM public.sensor_readings l
    WHERE l.user_id     = e.user_id
      AND l.tent_id     = e.tent_id
      AND l.metric      = e.metric
      AND l.captured_at = e.captured_at
      AND l.source      = 'live'
  );

-- 3. Sample affected rows WITHOUT exposing raw_payload contents.
--    (Never SELECT raw_payload in operator runbooks.)
SELECT id, user_id, tent_id, metric, captured_at,
       (raw_payload ? 'vendor')                AS has_vendor,
       (raw_payload -> 'metadata' ? 'transport_source')
                                               AS has_transport_lineage
FROM public.sensor_readings
WHERE source = 'ecowitt'
ORDER BY captured_at DESC
LIMIT 25;
```

## Safe remap strategy (only when collision_rows is acceptable)

Process only rows that have NO `(live)` collision. Collided rows are
left untouched and reviewed manually (they already represent the same
reading captured under a canonical source; the duplicate is harmless).

```sql
-- DO NOT RUN AUTOMATICALLY. Operator-only, after backup + dry-run.
BEGIN;

WITH safe_rows AS (
  SELECT e.id
  FROM public.sensor_readings e
  WHERE e.source = 'ecowitt'
    AND NOT EXISTS (
      SELECT 1
      FROM public.sensor_readings l
      WHERE l.user_id     = e.user_id
        AND l.tent_id     = e.tent_id
        AND l.metric      = e.metric
        AND l.captured_at = e.captured_at
        AND l.source      = 'live'
    )
)
UPDATE public.sensor_readings r
SET source = 'live',
    raw_payload = jsonb_set(
      jsonb_set(
        COALESCE(r.raw_payload, '{}'::jsonb),
        '{metadata}',
        COALESCE(r.raw_payload -> 'metadata', '{}'::jsonb),
        true
      ),
      '{metadata,transport_source}',
      to_jsonb('ecowitt'::text),
      true
    )
FROM safe_rows s
WHERE r.id = s.id;

-- Inspect row count BEFORE commit.
-- ROLLBACK if the number is unexpected.
-- COMMIT;
ROLLBACK;
```

### Strategy rules

- **Never DELETE** rows automatically. Collisions are kept for audit.
- **Preserve raw_payload** verbatim except for adding the new metadata key.
- **Do not** widen scope beyond `source = 'ecowitt'`.
- **Do not** run cross-user without an operator-approved scope (`WHERE user_id = ...`).
- **Service role only**, via SQL editor or one-off migration reviewed by two operators.
- **Never** include the service-role JWT in scripts checked into the repo.

## Rollback strategy

Rollback is only possible if a full export / backup of `sensor_readings`
exists from BEFORE the backfill. There is no automatic inverse. If the
backfill is committed without a backup, the original `source = 'ecowitt'`
label is gone; lineage survives only in `raw_payload.metadata.transport_source`.

Operator checklist:

1. Export `sensor_readings` (or a per-user slice) to a secure off-box
   location.
2. Verify export row count matches `SELECT count(*) FROM sensor_readings`.
3. Only then proceed with the safe-remap transaction above.
4. Keep the export for at least 30 days.

## Operator warnings

- **Do not run this backfill from the app frontend.** Frontend code must
  never carry service-role credentials.
- **Do not run without a database backup.**
- **Do not expose `raw_payload` content** in screenshots, logs, Slack,
  or tickets — historical rows may contain device secrets.
- **Do not** alter `public.validate_sensor_reading` to remove `'ecowitt'`
  in the same change — that would block any inflight bridge traffic.
- **Do not** add a `DELETE` step. Verdant audit policy: append-only.

## Optional helper script (future, dry-run-by-default)

If a helper script is ever added (e.g. `scripts/backfill-ecowitt-source.ts`),
it MUST:

- Refuse to start without exactly one of `--dry-run` or `--execute`.
- Default to `--dry-run` when both flags are absent (with an error).
- Print collision counts and a sanitized sample (no `raw_payload`).
- Refuse `--execute` unless `VERDANT_BACKFILL_BACKUP_CONFIRMED=1` is set
  in the operator's environment.
- Never read or print `SUPABASE_SERVICE_ROLE_KEY` or any token value.
- Log row counts only — never row contents.

No such script ships with this change.
