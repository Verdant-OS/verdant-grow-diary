# Quick Log canonical sensor-band — deployment handoff

Status tracker for reconciling the Quick Log environment sensor bands
(temperature / humidity / VPD) onto the single canonical physical band and
enforcing it server-side.

- **Shipped (code):** PR #321 — `fix: align Quick Log environment sensor bands`,
  squash-merged to `verdant-grow-diary` as `d612f40e6`.
- **Pending (live DB):** the trigger migration is committed but **not yet
  applied** to the hosted database. Until it is applied, only the two client
  paths enforce the upper temperature/VPD bounds server-side.

## Canonical band (source of truth)

`src/lib/sensorReadingNormalizationRules.ts` — `isTemperatureValid` /
`isHumidityValid` / `isVpdValid`:

| Metric            | Band (inclusive) |
| ----------------- | ---------------- |
| Air temperature   | −10 … 60 °C      |
| Relative humidity | 0 … 100 %        |
| VPD               | 0 … 10 kPa       |

VPD 10 kPa is a **physical-validity persistence gate**, not a healthy-grow
target. Air VPD only exceeds ~10 kPa above ~46 °C air temperature, so a real
grower in a hot, dry space can legitimately read 5–9 kPa. The retired v1
0..4 kPa cap was a grow-plausibility threshold and must not be the hard gate.

## What already enforces the band (live via merged code)

- **Quick Log v2** (`quickLogV2SavePayload`): blocks temperature / humidity /
  VPD with reason codes `temperature_out_of_range` / `humidity_out_of_range` /
  `vpd_out_of_range`.
- **Quick Log v1 Environment Check** (`environmentCheckQuickLogRules` +
  `QuickLog.tsx`): `validateEnvironmentCheckSensorBand` blocks the save,
  keeps the grower's entered value, and surfaces the specific reason instead
  of the previous silent clamp-to-null.
- **Operator copy** (`quickLogSaveErrorMessage`): calm per-metric messages.

Client↔server drift is pinned by
`src/test/environment-events-canonical-band-guard.test.ts`.

## Pending: apply the server trigger to the live DB

Migration:
`supabase/migrations/20260718170000_environment_events_canonical_band_guard.sql`.
It `CREATE OR REPLACE`s the existing `validate_environment_event()` trigger
function to add the previously-missing temperature bound and the VPD upper
bound (humidity 0..100 already existed). The `trg_validate_environment`
trigger (`BEFORE INSERT OR UPDATE`) is reused — no trigger re-creation, no
RLS/grant change, no RPC change.

### Safety properties

- Fires on **writes only** → pre-existing rows are never scanned (no
  full-table lock, no `VALIDATE`, no data rewrite).
- Nullability preserved: a NULL metric always passes.
- Idempotent `CREATE OR REPLACE`; safe to re-run.

### Pre-apply audit (read-only — do not remediate)

```sql
SELECT count(*) AS out_of_band
  FROM public.environment_events
 WHERE (temperature_c IS NOT NULL AND (temperature_c < -10 OR temperature_c > 60))
    OR (vpd_kpa       IS NOT NULL AND (vpd_kpa       < 0   OR vpd_kpa       > 10));
```

A non-zero count is informational only (the trigger won't touch those rows)
but flags corrupt history worth reviewing.

### Apply

```sql
CREATE OR REPLACE FUNCTION public.validate_environment_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.temperature_c IS NOT NULL AND (NEW.temperature_c < -10 OR NEW.temperature_c > 60) THEN
    RAISE EXCEPTION 'temperature_c out of range';
  END IF;
  IF NEW.humidity_pct IS NOT NULL AND (NEW.humidity_pct < 0 OR NEW.humidity_pct > 100) THEN
    RAISE EXCEPTION 'humidity_pct out of range';
  END IF;
  IF NEW.co2_ppm IS NOT NULL AND NEW.co2_ppm < 0 THEN RAISE EXCEPTION 'co2_ppm < 0'; END IF;
  IF NEW.vpd_kpa IS NOT NULL AND (NEW.vpd_kpa < 0 OR NEW.vpd_kpa > 10) THEN
    RAISE EXCEPTION 'vpd_kpa out of range';
  END IF;
  IF NEW.light_hours IS NOT NULL AND (NEW.light_hours < 0 OR NEW.light_hours > 24) THEN
    RAISE EXCEPTION 'light_hours out of range';
  END IF;
  RETURN NEW;
END $$;
```

Confirm with
`SELECT pg_get_functiondef('public.validate_environment_event()'::regprocedure);`.

## Verify (through the real client RPC `quicklog_save_manual`)

Authenticated as a test user who owns the target plant/tent. On top of a valid
`p_target_type='plant'`, owned `p_target_id`, `p_action='note'`:

| Extra args                                                   | Expected                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `p_temperature_c = 240`                                      | `{ ok: false, reason: 'save_failed' }`                             |
| `p_vpd_kpa = 12`                                             | `{ ok: false, reason: 'save_failed' }`                             |
| `p_humidity_pct = 999`                                       | `{ ok: false, reason: 'save_failed' }` (existing-guard regression) |
| `p_vpd_kpa = 8`                                              | `{ ok: true }` — in-band, MUST persist (band is 0..10, not 0..4)   |
| `p_temperature_c = 24, p_humidity_pct = 55, p_vpd_kpa = 1.2` | `{ ok: true }`                                                     |

A rejected call must leave **zero orphan rows**. The service-role harness
`scripts/run-quicklog-save-manual-rls-harness.ts` (needs `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, an anon key) covers cases 10–12 plus the
cross-user ownership guard.

> Note: rejections surface as the generic `save_failed` because the trigger
> raises a DB exception that `quicklog_save_manual` catches and returns
> safely. The specific per-metric copy comes from the **client** guards, which
> block before the RPC; the trigger is the defense-in-depth backstop for any
> path that bypasses the client.

## Rollback

Only loosens validation and rewrites no rows:

```sql
CREATE OR REPLACE FUNCTION public.validate_environment_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.humidity_pct IS NOT NULL AND (NEW.humidity_pct < 0 OR NEW.humidity_pct > 100) THEN
    RAISE EXCEPTION 'humidity_pct out of range';
  END IF;
  IF NEW.co2_ppm IS NOT NULL AND NEW.co2_ppm < 0 THEN RAISE EXCEPTION 'co2_ppm < 0'; END IF;
  IF NEW.vpd_kpa IS NOT NULL AND NEW.vpd_kpa < 0 THEN RAISE EXCEPTION 'vpd_kpa < 0'; END IF;
  IF NEW.light_hours IS NOT NULL AND (NEW.light_hours < 0 OR NEW.light_hours > 24) THEN
    RAISE EXCEPTION 'light_hours out of range';
  END IF;
  RETURN NEW;
END $$;
```

## Checklist

- [x] Client v1 + v2 block on the canonical band (merged, PR #321)
- [x] Shared reason codes + operator copy (merged)
- [x] Trigger migration committed (merged, not applied)
- [x] Drift test + runtime-harness cases 10–12 (merged)
- [ ] Pre-apply row audit run on the live DB
- [ ] Trigger applied to the live DB
- [ ] Verification matrix / RLS harness green on the live DB
