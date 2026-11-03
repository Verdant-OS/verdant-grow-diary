# Quick Log Water: enter volume in ml, L or gal

Status: DRAFT spec, Claude. Founder decisions D1–D3 recorded 2026-11-03 (§8): D1 (b), D2 yes, D3 (b).
Source finding: grower workflow audit 2026-11-03, finding 4 ("Water entry requires millilitres,
with no gallon/litre toggle in the inspected form, despite existing journal notes using gallons").
Deploy branch audited: `verdant-grow-diary` at `7ca284b9490cb5a6c30a7cc356b967eb62d4f58a` (#2810).

This spec changes how the grower **types** a water amount. It does not change what is **stored**.
Every saved watering keeps `volume_ml` in millilitres through the existing single save path.

## 1. Evidence (established fact, deploy branch)

| What                                                                                                                           | Where                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| The Volume input is labelled `Volume (ml)` and has no unit control                                                             | `src/components/QuickLogWateringForm.tsx:130`                                                                   |
| The large-water assessment is always called with `unit: "ml"`                                                                  | `src/components/QuickLogWateringForm.tsx:122-123`, `src/components/QuickLogV2Sheet.tsx:1158-1160`, `:1971-1973` |
| `WaterVolumeUnit` is the single literal `"ml"`                                                                                 | `src/lib/quickLogWaterVolumeWarningRules.ts:15-16`                                                              |
| Volume text is classified exactly (BigInt rational) against the 50,000 ml hard ceiling before any `Number()` rounding          | `assessWaterVolumeText`, `src/lib/quickLogWaterVolumeWarningRules.ts:88-99`                                     |
| The watering payload stores `volume_ml` from that classification                                                               | `src/lib/quickLogWateringFormViewModel.ts:185-188`, `:290`                                                      |
| The V2 save payload stores `p_volume_ml` from the same classification                                                          | `src/lib/quickLogV2SavePayload.ts:96-104`, `:166`                                                               |
| Presets are ml-only: 500, 1000, 1500, 1800, 2000, 2500                                                                         | `src/lib/quickLogWateringVolumePresetRules.ts` (`QUICK_LOG_WATERING_VOLUME_PRESETS_ML`)                         |
| The last-watering prefill writes ml text                                                                                       | `src/lib/wateringVolumeDefaultsViewModel.ts` (`applyWateringVolumeDefaultsToForm`)                              |
| Runoff is a separate ml field, bounded 0–1,000,000                                                                             | `src/lib/quickLogWateringFormViewModel.ts:192`, form `Runoff (ml)`                                              |
| Precedent for typed-unit entry: water temperature is typed in the grower's unit and converted to canonical °C **exactly once** | `typedTempToCelsiusInput`, `src/components/QuickLogWateringForm.tsx:41`, `:91`                                  |
| Gallon ↔ litre constant already exists (`L_PER_GAL = 3.785411784`)                                                             | `src/lib/unitsCalc.ts:8`                                                                                        |

`inference`: the audit's account uses gallons in free-text notes, so a grower who waters "1 gal"
must convert by hand today, which invites typos that the 10,000 ml warning will not catch
(for example typing `1` for one gallon saves 1 ml).

## 2. Requirements

- **R1. Units.** The Water Volume field accepts entry in `ml`, `L` or `gal` (US liquid gallon).
- **R2. Storage unchanged.** `volume_ml`, `p_volume_ml`, the RPC, the payload shape, the
  idempotency key and the single write path (`docs/specs/one-tent-loop-quicklog-single-write-path.md`)
  do not change. No schema, RLS, Edge or migration change.
- **R3. Convert exactly once.** A pure rule converts the typed text and its entry unit into the
  canonical ml text. Every existing gate (`assessWaterVolumeText`, `assessLargeWaterAmount`,
  `largeWaterConfirmationKey`, both payload builders) reads that canonical ml text and nothing else.
  No gate is duplicated per unit.
- **R4. Exact conversion.** 1 L = 1,000 ml. 1 US gal = 3,785.411784 ml (exact by definition).
  Conversion is done on the decimal text as a rational (same approach as `parseDecimal`), then
  rounded **once** to whole millilitres, half away from zero. `ml` entry is passed through
  unchanged (today's behaviour, including decimals).
- **R5. Ceiling and warning by volume, not by digits.** The 50,000 ml hard maximum and the
  10,000 ml warning apply to the converted value. 13.21 gal (50,005 ml) is rejected as too large;
  13.2 gal (49,967 ml) is accepted; 2.65 gal (10,031 ml) warns. The too-large message names the
  ceiling in the entry unit and in ml, for example "Max 13.2 gal (50,000 ml) per watering".
- **R6. Show what will be saved.** When the entry unit is not `ml` and the text is valid, a
  read-only line under the field shows the stored amount: "Saves as 3,785 ml." Nothing is shown
  for missing or invalid text.
- **R7. Large-water confirmation is keyed on the canonical ml.** Changing unit or text produces a
  new key, so a confirmation never carries over to a different amount. The warning names the typed
  amount and the ml amount ("1 gal (3,785 ml)").
- **R8. Prefill keeps the stored value.** The last-watering prefill shows the stored ml converted
  into the entry unit for display (L to 3 decimals, gal to 2, trailing zeros dropped). If the grower
  saves without editing the prefill, the original stored ml is saved, not the rounded round trip.
- **R9. Presets (D3 b).** The six presets stay labelled in ml ("500 ml") in every entry unit.
  Selecting one sets the entry unit to `ml` and the text to the preset's ml value, so it saves its
  exact ml. This switch does not change the remembered default unit (R13).
- **R13. Remembered unit (D1 b).** The default entry unit is `ml`. Choosing a unit with the unit
  control stores it on this device under `verdant:waterVolumeEntryUnit` (opaque enum value only,
  no ids, no amounts), and the next Water form opens in that unit. A missing, unreadable or unknown
  stored value, or unavailable storage, falls back to `ml`. Only the unit control writes it.
  It is a display preference: it never selects a grow, tent or plant, and never changes a saved row.
- **R14. Runoff (D2 yes).** The same unit control governs `Runoff`. Runoff text converts with R4,
  the existing 0–1,000,000 ml bound is applied to the converted value, it gets its own
  "Saves as … ml." line under R6, and the label reads `Runoff (gal)` / `Runoff (L)` / `Runoff (ml)`.
- **R10. Labelled data stays labelled.** The unit control is an explicit, visible choice. No unit
  is inferred from the number typed. Invalid text is never coerced to a valid volume.
- **R11. Draft and retry.** A draft or retry keeps both the typed text and its entry unit, so
  restoring a draft never reinterprets "1" typed in gallons as 1 ml.
- **R12. Copy is data.** Labels, the "Saves as" line and messages live in a constants module with
  exact-string tests, per repo convention.

## 3. Out of scope

- Feed form volumes and nutrient amounts (they have their own units in `athenaFeedLogRules.ts`).
- Timeline, Plant Detail and export readback (they keep showing stored ml). A display-unit
  preference for readback is deferred (§9).
- Any change to stored rows, old rows, or the ml presets' stored values.
- Remembering the selected **target** — still banned. D1's remembered **unit** is a display
  preference only and never selects a grow, tent or plant.

## 4. Design

New pure module `src/lib/quickLogWaterVolumeUnitRules.ts` (no React, no I/O, no clock):

```ts
export type WaterEntryUnit = "ml" | "L" | "gal";
export const WATER_ENTRY_UNITS: readonly WaterEntryUnit[] = ["ml", "L", "gal"];

/** Canonical ml text for the existing gates; "" when text is blank; null when unparsable. */
export function waterEntryToCanonicalMlText(text: string, unit: WaterEntryUnit): string | null;

/** Display text in `unit` for a stored ml value (prefill, presets). Never used for saving. */
export function mlToWaterEntryDisplay(ml: number, unit: WaterEntryUnit): string;
```

Form state (`QuickLogWateringFormState`) gains `volumeEntryUnit: WaterEntryUnit` and, for R8,
`volumePrefillMl: number | null`, which is cleared on any edit of the volume text or unit. `volumeMl`
keeps its current meaning: the canonical ml text the gates read. The component writes the typed text
into a new `volumeEntryText` field, and `volumeMl` is derived through `waterEntryToCanonicalMlText`
on every change. When the derivation returns `null`, `volumeMl` is set to the raw text so that
`assessWaterVolumeText` still reports it as `invalid`. This keeps every existing ml path, test and
parity pin working unchanged when `volumeEntryUnit === "ml"`.

`WaterVolumeUnit` in `quickLogWaterVolumeWarningRules.ts` stays `"ml"`: the warning rules keep
operating only on canonical ml. The display label for the warning comes from the entry text and unit.

## 5. Safety fences (must stay true)

- Unknown or invalid volume text never saves, in any unit.
- No amount above 50,000 ml saves, in any unit, including values that only exceed it after
  conversion.
- One save path; no new RPC parameter; stored rows are byte-identical in shape to today's.
- No watering recommendation copy. The warning names the entered amount only.
- No unit guessing from magnitude (for example "2" is never assumed to be gallons).

## 6. Acceptance tests

Pure rules (`src/test/quick-log-water-volume-units-rules.test.ts`):

1. `("250", "ml")` → `"250"`; `("12.5", "ml")` → `"12.5"` (pass-through, today's behaviour).
2. `("1", "L")` → `"1000"`; `("0.75", "L")` → `"750"`; `("1.2345", "L")` → `"1235"` (rounded once, half away from zero).
3. `("1", "gal")` → `"3785"`; `("0.5", "gal")` → `"1893"`; `("2", "gal")` → `"7571"`.
4. Boundaries through `assessWaterVolumeText`: `13.2 gal` valid (49,967); `13.21 gal` too_large;
   `50 L` valid; `50.001 L` too_large; `2.64 gal` (9,993) no warning; `2.65 gal` (10,031) warns.
5. Blank text → `""` in every unit; `"abc"`, `"-1"`, `"1e3"`, `"0"` → invalid in every unit;
   text longer than `MAX_WATER_VOLUME_TEXT_LENGTH` → invalid.
6. Determinism and no mutation; the same input gives the same output across calls.
7. `mlToWaterEntryDisplay(3785, "gal")` → `"1"`; `(1893, "gal")` → `"0.5"`; `(1500, "L")` → `"1.5"`.

Component and payload (`src/test/quick-log-water-volume-units-ui.test.tsx`):

8. Selecting `gal`, typing `1`, saving → the watering payload has `volume_ml: 3785`.
9. "Saves as 3,785 ml." is shown for valid gal/L text and absent for ml, blank or invalid text.
10. A large-water confirmation given for `3 gal` does not carry over after changing the text to
    `3.5 gal` or the unit to `L`.
11. Prefill of 1,893 ml shown as `0.5 gal`; saving unedited sends `volume_ml: 1893`; editing to `0.5`
    by hand sends `1893` too, and editing to `0.6` sends `2271`.
12. Draft restore keeps `volumeEntryUnit` and text (a gallon draft never restores as ml).
13. Existing water-volume suites stay green unchanged: `quick-log-water-volume-text-bound`,
    `-save-parser-parity`, `-warning`, `-warning-ui`, `-warning-boundaries`. Any pin renegotiation
    is declared in the PR with `scripts/scorer-lock.mjs`.

14. D1: choosing `gal` stores `gal`; a new form opens in `gal`; a stored `"quart"` or a throwing
    `localStorage` opens in `ml`; selecting a preset does not overwrite the stored unit.
15. D2: in `gal`, Runoff `0.25` saves `runoff_ml: 946`; in `L`, Runoff `1000.001` is rejected by
    the existing bound (1,000,001 ml); Runoff blank saves no runoff, as today.
16. D3: in `gal`, preset chips read `500 ml` … `2500 ml`; selecting `1000 ml` sets the unit to `ml`
    and the text to `1000`, and saves `volume_ml: 1000`.

Each new test must be shown failing before the change (RED count in the PR body).

## 7. File-level plan (implementation slice, not this PR)

- New: `src/lib/quickLogWaterVolumeUnitRules.ts`, `src/constants/quickLogWaterVolumeUnitCopy.ts`,
  the two test files above.
- Edit: `src/lib/quickLogWateringFormViewModel.ts` (state fields, empty state),
  `src/components/QuickLogWateringForm.tsx` (unit control, "Saves as" lines, preset switch to ml, runoff),
  `src/lib/quickLogWateringFormViewModel.ts` runoff parse (convert runoff text before its bound),
  new `src/lib/waterVolumeEntryUnitPreference.ts` (R13 storage, modelled on `temperatureUnitPreference.ts`),
  `src/components/QuickLogV2Sheet.tsx` (pass entry unit to the warning label only),
  `src/lib/wateringVolumeDefaultsViewModel.ts` (R8 prefill).
- Untouched: both payload builders' ml logic, the RPC, `quickLogWaterVolumeWarningRules.ts` gates,
  migrations, Edge functions, Timeline readback.

## 8. Founder decisions

Recorded 2026-11-03 (Matthew): **D1 (b), D2 yes, D3 (b).** The options are kept below for the record.
Claude's call inside D3 (b), open to change: selecting a preset does not overwrite the remembered unit.

- **D1. Default unit.** (a) Always `ml`, the grower switches each time. (b) `ml` by default, and the
  last unit chosen is remembered on this device (localStorage, like the temperature preference).
  (c) Follow the temperature preference: °F → `gal`, °C → `L`.
  **Recommended: (b).** It keeps today's default for every existing grower and stops a gallon user
  from re-choosing every time. (c) would silently change existing users' default to gallons.
- **D2. Runoff.** Should the same unit control apply to `Runoff`? **Recommended: yes**, one control
  for both fields on the Water form, with the same exact conversion and the existing 0–1,000,000 ml
  bound applied after conversion.
- **D3. Presets in L or gal.** (a) Keep the six ml presets and label them in the entry unit
  (L exact: 0.5, 1, 1.5, 1.8, 2, 2.5 L; gal rounded: 0.13, 0.26, 0.4, 0.48, 0.53, 0.66 gal).
  (b) Show the six ml presets unchanged in every unit ("500 ml"), and selecting one switches the
  entry unit to `ml`. (c) Hide presets outside `ml`.
  **Recommended: (b).** Rounded gallon chips look like measurements nobody poured, and (b) never
  shows a number the grower did not choose.

## 9. Deferred

- Display-unit preference for watering readback on Timeline, Plant Detail and exports.
- Unit entry on the Feed form's solution volume.
- Imperial fluid ounces or UK gallons (not in this audit's evidence).

## 10. Unknowns

- `NOT_MEASURED`: which build production served during the audit; the label and behaviour above are
  from source at `7ca284b`, not from the live page.
- `NOT_MEASURED`: how many growers enter gallons in notes today. No usage data was read.
