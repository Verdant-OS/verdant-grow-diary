# EC @25°C Preview — QA Documentation

Status: READ-ONLY DISPLAY ONLY. No schema, ingest, trigger, cron, Edge Function,
RLS, alert, backfill, AI behavior, automation, or device-control changes.

## What the preview is

The EC @25°C preview is a **read-only, display-time estimate** shown to growers
whenever a feeding entry contains both an EC value and a water temperature value.
It answers the question *"What would this EC reading be if the water were exactly
25 °C?"* so growers can compare feedings made at different water temperatures.

## Where it appears

| Surface | File | Condition |
| ------- | ---- | --------- |
| **Quick Log feeding form** | `src/components/QuickLogFeedingForm.tsx` | Both EC in and Water (°C) fields are filled with safe values |
| **Feeding history timeline** | `src/components/FeedingHistoryPanel.tsx` | Past feeding entry has both `ec` and `waterTempC` populated from `details.extras` |

## What it does NOT do

| Claim | Truth |
| ----- | ----- |
| Stores the compensated value | **No.** Value is calculated at render time; nothing is written to `sensor_readings`, `diary_entries`, or any other table. |
| Backfills historical data | **No.** No backfill script, batch job, or migration exists. |
| Uses a database trigger | **No.** No trigger is installed. |
| Uses pg_cron | **No.** No cron job is scheduled. |
| Uses an Edge Function | **No.** No Edge Function is invoked. |
| Changes AI Doctor behavior | **No.** AI Doctor does not consume or produce this value. |
| Automates anything | **No.** It is a pure presenter. |
| Controls devices | **No.** No device commands are involved. |

## How it works (high level)

1. The **Quick Log feeding form** collects `ecIn` (mS/cm by app convention) and
   `waterTempC` (°C, explicitly labeled).
2. `buildEcCompensationPreview()` (`src/lib/ecCompensationPreviewViewModel.ts`)
   passes those inputs to `computeEcCompensation()` (`src/lib/ecCompensationRules.ts`).
3. The helper applies a linear temperature-compensation formula only when:
   - EC unit is explicitly known (`mS/cm`, `µS/cm`, `PPM-500`, `PPM-700`)
   - Temperature unit is explicitly `C` or `F`
   - Source label is trusted (`live`, `manual`, `csv`)
   - Values are finite and within plausible grow-room ranges
   - Magnitudes are not suspicious (catches µS/cm vs mS/cm ×1000 errors)
4. The presenter returns a `visible` / `valueDisplay` / `tone` / `disclaimer`
   model that the React component renders without interpreting raw numbers.
5. The **feeding history** re-runs the same calculation when displaying past
   entries. `waterTempC` is recovered from `details.extras.water_temp_c` or
   `details.extras.waterTempC` (snake_case and camelCase both supported).

## Why it is blocked on `sensor_readings`

Historical `sensor_readings` rows still lack:
- An explicit `ec_unit` column
- A guaranteed temperature companion row in the same insert window
- Per-source unit-provenance audit

Therefore **no sensor snapshot card, tent sensor history, or manual sensor card**
shows an EC @25°C preview. Doing so would imply provenance that does not exist.

See `docs/audits/ec-temperature-compensation-feasibility.md` §4 for the full
blocking analysis.

## Operator QA checklist

- [ ] Open Quick Log → Feeding. Enter EC in = `1.8` and Water (°C) = `20`.
  - [ ] Preview line appears with a value near `1.92 mS/cm`.
  - [ ] Label reads **EC @25°C preview**.
  - [ ] Disclaimer reads **Read-only estimate. Not stored.**
  - [ ] Tone is `ok` (no amber styling).
- [ ] Clear the EC in field.
  - [ ] Preview disappears entirely (no "unavailable" noise).
- [ ] Clear the Water (°C) field.
  - [ ] Preview disappears entirely.
- [ ] Enter Water (°C) = `200`.
  - [ ] Preview shows **Needs unit review** with amber tone.
- [ ] Save the feeding, then open the diary timeline.
  - [ ] Feeding history card shows water temperature as **°F first / °C second**
    (e.g. "68°F / 20°C").
  - [ ] EC @25°C preview appears on the card with the same disclaimer.
- [ ] Inspect the card DOM.
  - [ ] No `raw_payload`, bridge token, API key, service-role value, or
    private ID is rendered anywhere in the card or preview.

## Safety boundaries enforced by code

| Layer | Guard |
| ----- | ----- |
| `ecCompensationRules.ts` | Blocks unknown units, suspicious magnitudes, demo/stale/invalid sources, non-finite inputs |
| `ecCompensationPreviewViewModel.ts` | Hides preview when EC or temp is missing; never claims value is stored; never includes raw payload |
| `QuickLogFeedingForm.tsx` | Only uses `ecIn` + `waterTempC` from form state; sourceLabel hardcoded to `"manual"` |
| `FeedingHistoryPanel.tsx` | Only reads `ec` and `waterTempC` from `FeedingHistoryRow`; skips preview when either is null |
| `feedingHistoryRules.ts` | `pickWaterTempC` only looks in `details.extras`; never falls back to `raw_payload` |
| `temperatureDisplay.ts` | `formatTempDualF` returns `null` for out-of-range Celsius values; never invents a temperature |

## Related files

- `src/lib/ecCompensationRules.ts` — pure compensation helper (deterministic, no I/O)
- `src/lib/ecCompensationPreviewViewModel.ts` — presenter that turns helper output into UI-safe labels
- `src/components/QuickLogFeedingForm.tsx` — form surface where preview appears inline
- `src/components/FeedingHistoryPanel.tsx` — timeline surface where preview appears on past entries
- `src/lib/temperatureDisplay.ts` — Fahrenheit-first dual-unit formatter for water temperature
- `src/lib/feedingHistoryRules.ts` — rules that extract `waterTempC` from diary `details.extras`
- `docs/audits/ec-temperature-compensation-feasibility.md` — audit that blocks schema/backfill/trigger/cron work

## Rollback

This doc is safe to delete at any time. Removing it does not change application
behavior.
