# Quick Log — structured sensor readings and "reading taken at"

Status: DRAFT spec. No implementation in this slice. Author: Claude, 2026-11-03.
Base: `claude/new-session-azpsz3` (deploy branch `verdant-grow-diary` merged in).
Trigger: grower bug brief 2026-11-03, item 14 ("Add an optional 'reading taken at' time, plus
structured sensor fields (air temp, RH, VPD, soil temp, water content, soil EC, CO2, PPFD) so
readings aren't typed as free text into a 500-character note"). Related: item 13 (°F/°C).

## 1. Audit — most of this exists; the gap is narrower than reported

| Need                           | Quick Log (`src/components/QuickLogV2Sheet.tsx`)                                                                                   | Manual reading card (`src/components/ManualSensorReadingCard.tsx`, on `/sensors` and Daily Check) |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Reading taken at"             | **Exists**: `readingTimeLocal` → `QuickLogReadingTime.resolve` (`src/lib/quickLogReadingTime.ts`; ≤7 days back, not in the future) | n/a                                                                                               |
| Air temp, RH, VPD              | **Exists**: typed RPC args `p_temperature_c`, `p_humidity_pct`, `p_vpd_kpa`                                                        | Exists                                                                                            |
| °F/°C entry (item 13)          | **Exists**: `useTemperatureUnitPreference`; stored canonical °C                                                                    | Exists; converted once to the legacy °F contract                                                  |
| Water content (VWC), CO2, PPFD | Missing                                                                                                                            | Exists                                                                                            |
| Soil temp, soil EC             | Missing                                                                                                                            | Missing (metrics `soil_temp`, `soil_ec` are already known to `src/lib/sensorQuality.ts`)          |

`established fact` (source). `missing evidence`: which form the grower used when they typed
readings into the note; the brief's "only takes °C" may predate the unit preference or refer to
another form. Confirm on the fixture account before closing item 13.

## 2. Constraints that decide the design

- `established fact` Quick Log has one frozen write path, `quicklog_save_manual`
  (`docs/specs/one-tent-loop-quicklog-single-write-path.md`). Quick Log must not also write
  `sensor_readings`.
- `established fact` The RPC already stores a `details.manual_sensor_snapshot` object, and the
  correction path edits named keys inside it (`temp_f`, `humidity_percent`;
  `supabase/migrations/20261014210000_quicklog_correction_editable_values.sql` ~L280–297).
- Sensor truth (AGENTS.md §6): every reading keeps `source: "manual"`, its captured time, and its
  unit; implausible values are flagged, never shown as healthy.

## 3. Recommended design (Option A) — extend the manual snapshot, no schema change

1. **Fields.** Add to Quick Log's existing "Reading" section (collapsed by default, so a plain note
   stays one tap): soil temp (°F/°C per preference), water content (% VWC), soil EC (mS/cm, with
   the existing EC unit choice), CO2 (ppm), PPFD (µmol/m²/s). Air temp/RH/VPD stay where they are.
2. **Storage.** Send them inside `p_details.manual_sensor_snapshot` using the codebase's
   **existing** canonical metric names (`established fact`, `src/lib/sensorTruthRules.ts`
   `classifyManualMetric` and `src/lib/sensorSnapshot.ts`): `soil_temp_c`, `soil_moisture_pct`
   (VWC), `soil_ec_ms_cm`, `co2_ppm`, `ppfd`, plus `captured_at` (the resolved reading time) and
   `source: "manual"`. Do not invent new names: `classifyManualMetric` returns VALID for unknown
   metric names (its `default` branch), so a typo would silently skip validation. Old rows without
   these keys read as "not recorded". No RPC signature change.
   - `established fact` (source): `quicklog_save_manual` → `quicklog_save_manual_pre_logged_at`
     keeps every `p_details` key except `user_id`, `grow_id`, `tent_id`, `plant_id`, `auth_uid`,
     `auth.uid` (`supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql`
     ~L765–776; outer wrapper `20261013180000_*` only adds `logged_at`).
   - `BLOCKED` (live): CURRENT_STATE records a production event-delegate md5 mismatch
     (`ef7bdf19`), so the live body may differ from source. Read-only check for the owner, run on
     production before building the UI:
     `select md5(pg_get_functiondef('public.quicklog_save_manual_pre_logged_at'::regproc));` and
     `select pg_get_functiondef('public.quicklog_save_manual_pre_logged_at'::regproc) ~ $$- 'auth.uid'$$;`
     If the live body filters `manual_sensor_snapshot` keys, this becomes Option B.
3. **Rules module.** `src/lib/quickLogStructuredReadingRules.ts`: parse each field, convert
   °F→°C once for soil temp, classify with the existing validators (`classifyManualMetric` for
   `soil_temp_c`, `soil_moisture_pct`, `soil_ec_ms_cm` — including its unit-mismatch chip for EC ≥
   50 — and `co2_ppm`; `isPpfdValid` for `ppfd`), and build the snapshot object. Invalid values are
   kept as entered and flagged with the validator's chip, never dropped or shown as healthy.
   Deterministic, null-safe, no clock.
4. **Display.** Timeline/Recent Quick Logs chips (`ManualReadingsChips`) show the new values with
   units and a "Manual" source label; suspicious values show "check value", never a healthy state.
5. **Corrections.** Out of scope for the first slice: new keys are read-only after save until a
   follow-up extends the correction RPC (a migration). The UI must say so rather than offer an edit
   that silently drops them.
6. **AI Doctor / alerts.** No change in the first slice; they keep reading what they read today.
   Feeding these values to AI Doctor is a separate, reviewed slice.

**Option B** (if the RPC strips keys): add typed args to `quicklog_save_manual` in a new additive
migration. This is held for Matthew and supersedes step 2.

**Rejected:** writing `sensor_readings` from Quick Log (breaks the single write path); free-text
templates in the note (the problem being reported).

## 4. Acceptance tests (each proven RED first)

1. Rules: each field parses; out-of-range values are flagged and kept as entered; blanks are
   omitted, never zero; °F soil temp 68 → 20 °C exactly once; output is deterministic.
2. Save payload: `p_details.manual_sensor_snapshot` carries the canonical keys, `source:
"manual"` and the resolved `captured_at`; the RPC is called once (single write path pin).
3. Old rows without the keys render exactly as before.
4. Chips show units and "Manual"; a suspicious soil EC never renders as normal.
5. Correction dialog does not offer the new fields and says they cannot be edited yet.

## 5. Known unknowns

- `missing evidence` Whether the live RPC preserves unknown `manual_sensor_snapshot` keys.
- `uncertainty` Whether the grower wants these in Quick Log or a "Log reading" shortcut into the
  existing manual reading card is enough (fewer moving parts; no single-write-path impact).
