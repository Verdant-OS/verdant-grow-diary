# CSV import: multi-file exports and time zone hint

Nov 12, 2026 · Author: Claude (spec), requested by the founder

## Summary

**The grower's problem.** The Spider Farmer GGS app exports history as several CSV files (one per month, plus separate sensor files). Verdant's import takes one file at a time, and the grower has to pick the file's time zone by hand. A grower in Central time will naturally pick America/Chicago. On this export that is wrong: the controller clock appears to stay at UTC−06:00 all year, so every reading during daylight saving lands one hour early, and the 12 rows from 1:00 to 1:55 AM on Nov 1 are held as ambiguous. Nothing tells the grower why.

**What this spec proposes.** Three small slices, each its own PR, in this order:

1. **Fixed-clock time zone hint.** When a file spans a daylight-saving change and its clock did not change, say so in the time zone step and offer a one-tap zone with the same offset and no daylight saving (for this export, America/Regina). Never preselected.
2. **Several files in one import.** Pick all the month files at once, choose one time zone for the set, see one combined preview, confirm once. One undo removes the whole set.
3. **Accurate soil message.** The current message says soil columns aren't imported. They are now, when the unit is stated. Replace it with copy that names the column that wasn't read and why.

A fourth item, data-quality notes (soil moisture stuck at 0 or 100, long gaps), is listed under Out of scope as a follow-up, because it changes what the preview shows for every import, not just this export.

**Evidence labels used below.** _Established fact_ means read in the code at deploy head `c03ea6fd` today. _Practical observation_ means measured by running the current parser on the grower's five files. _Inference_ means reasoned from those results and not confirmed with Spider Farmer.

**Why it matters.** This is the CSV-import proof a grower needs before trusting Verdant with real history. Getting the hour right, and the whole export in one pass, is the difference between "it worked" and "I had to guess four times".

## Requirements and acceptance criteria

### What we know today

- _Established fact:_ the import parses one file per run. The file input is `accept=".csv,text/csv"` with no `multiple` (`src/components/EnvironmentCsvImportModal.tsx:329`).
- _Established fact:_ rows with no zone are held as `needs_source_time_zone` until the grower picks one. DST-fold rows are held as `ambiguous_local_time`, and spring-forward gap rows as `nonexistent_local_time` (`src/lib/csvParser.ts:54-59`, assigned at `:391-393`).
- _Established fact:_ the zone list is the device zone first, then the runtime's list, then UTC. The device zone is listed but never preselected (`src/lib/csvTimestampRules.ts:284`).
- _Practical observation:_ on the September, October and November files, America/Regina gives 7681, 8277 and 1170 valid rows with nothing held. America/Chicago gives the same counts for September and October, but one hour early during daylight saving, and holds 12 November rows (Nov 1, 1:00 to 1:55 AM) as ambiguous.
- _Inference:_ the controller clock is a fixed UTC−06:00. The 1:00 AM hour on Nov 1 appears once, not twice, at a 5-minute cadence. The month files also split at midnight UTC. Not confirmed with Spider Farmer.

### Slice 1: fixed-clock hint

- **R1.1** When the grower has picked a zone that observes daylight saving, and the parsed file covers that zone's fall-back or spring-forward date, compute clock evidence from the rows. Fall back: rows exist in the repeated hour and no local time repeats there. Spring forward: rows exist in the skipped hour.
- **R1.2** When the evidence says the clock did not change, show a note in the time zone step and one button for a zone with the same standard offset and no daylight saving.
- **R1.3** The suggested zone is never preselected and never applied without a tap. The import stays blocked on held rows until the grower acts, as today.
- **R1.4** When no valid no-DST zone exists for that offset in this runtime, show the note without a button.
- **R1.5** When the file covers no transition, or the clock did change, show nothing new.

**Acceptance:** with the November file and America/Chicago picked, the note appears and offers America/Regina. One tap re-parses, and all 1170 rows are valid with 0 held. With the October file alone (no transition), no note appears.

### Slice 2: several files in one import

- **R2.1** The file picker accepts several CSV files at once, up to a stated cap (proposed: 12). Each file keeps today's per-file size and row limits.
- **R2.2** One time zone choice applies to the whole set. The slice 1 hint runs on every file, and fires if any file shows a fixed clock.
- **R2.3** The preview lists each file (name, valid rows, held rows, skipped rows, first and last reading) and a total. A file that fails to parse is listed with its reason and left out. It does not block the others.
- **R2.4** Byte-identical files in one selection are imported once, with the copy listed as "same file twice".
- **R2.5** A reading that appears in two files (same metric, same captured time) is saved once. If the two values differ, neither is saved, and the preview shows the count so the grower can decide. The key matches the database unique index `sensor_readings_dedupe_uidx` (user, tent, source, metric, captured time). The index stays the backstop.
- **R2.6** The whole set is one import batch with one `import_batch_id`, so one undo removes it all (the undo from #2909).
- **R2.7** Destination (grow, tent, plant), unit and mapping choices work the same as one file, and apply to the whole set.

**Acceptance:** selecting the five files from this export, with America/Regina picked, gives one preview covering Sep 3 to Nov 4. The two sensor files repeat the soil readings of the September and October device files. Matching values are saved once, and the few rows whose values differ (_practical observation:_ one September row by up to 1.4, one October row by 0.02 EC) are counted, not saved. Confirm writes once, undo removes every row from the set, and re-importing the same set adds 0 rows. A separate test covers byte-identical copies (R2.4).

### Slice 3: accurate soil message

- **R3.1** Replace `CSV_SOIL_ONLY_MESSAGE` (`src/lib/csvParser.ts:152`) with copy that is true. Soil temperature, moisture and EC import when the unit is stated. A soil temperature column with no stated unit is not read.
- **R3.2** Name the column or columns that were not read, and say why.

**Acceptance:** a file whose only soil column is soil temperature with no unit shows a message naming that column and asking for a °C or °F header. No message says soil columns aren't imported.

## File-level plan

Paths are from deploy head `c03ea6fd`. Line numbers are where the code stands today, so re-check them before editing. No file under `supabase/`, no migration, no lockfile, no generated file.

### Slice 1: fixed-clock hint

| File                                           | Change                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/csvTimestampRules.ts`                 | Add two pure functions next to `listSourceTimeZones` (`:284`): `detectFixedClockEvidence` and `suggestNoDstZone`. No `Date.now()`; every date comes from the rows.                                |
| `src/constants/csvTimeZoneHintCopy.ts` (new)   | The note and button copy, plus a short preferred table of no-DST zones by standard offset (for example −06:00 America/Regina, −07:00 America/Phoenix, −10:00 Pacific/Honolulu, 00:00 UTC).        |
| `src/lib/csvParser.ts`                         | When `sourceTimeZone` is given, build the evidence from the local wall-clock times it already reads, and return it as an optional `clockEvidence` on the result. Additive: old callers ignore it. |
| `src/lib/environmentCsvImportViewModel.ts`     | Map `clockEvidence` to a hint model (transition date, suggested zone or none).                                                                                                                    |
| `src/components/EnvironmentCsvImportModal.tsx` | Render the hint inside the time zone note (`:465-499`). The button calls the existing `handleTimeZone` (`:200`) with the suggested zone.                                                          |

### Slice 2: several files in one import

| File                                                                       | Change                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/csvMultiFileImportRules.ts` (new)                                 | Pure: combine per-file parse results into one set. Drop byte-identical files (hashes passed in), merge rows, find cross-file duplicates and conflicts on the dedupe key, total the counts.                                      |
| `src/components/EnvironmentCsvImportModal.tsx`                             | `multiple` on the input (`:329`). Keep a list of files instead of one `fileRef`. Parse each with the chosen zone (`:204`). Hash each file with `crypto.subtle` and pass the hashes into the rules.                              |
| `src/lib/environmentCsvImportViewModel.ts`                                 | Combined preview model: one row per file plus a total. Held-row counts (`:92`, `:104`, `:326`) summed across files.                                                                                                             |
| `src/lib/environmentCsvImportPersistence.ts`                               | Pass the merged rows through the existing write path with one `import_batch_id` (`:53-54`, `:135-139`). _Inference:_ no change beyond the caller, since the batch id is already caller-supplied. Confirm by reading `:380-425`. |
| `src/lib/sensorHistoryImportReplayGuard.ts`                                | Fingerprint each file in the set. A file already imported is listed as such and left out, as one file is today.                                                                                                                 |
| `src/components/CsvPreviewReviewGate.tsx`, `src/lib/csvImportPlanRules.ts` | Read first. Change only if they assume one file.                                                                                                                                                                                |

### Slice 3: accurate soil message

| File                                           | Change                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/csvParser.ts`                         | Replace the constant at `:152` with a function that takes the soil columns not read (from `classifySoilHeaders`, `:624-652`). Update its two uses (`:254`, `:439`). |
| `src/components/EnvironmentCsvImportModal.tsx` | Show the new message where the old one shows (`:632-633`).                                                                                                          |
| `src/test/csv-parser-metric-identity.test.ts`  | Renegotiate the pin at `:208` in the same commit. Search every test for the old copy, with both a straight and a curly apostrophe.                                  |

### Overlapping work checked today

- No spec in `docs/specs/` covers CSV multi-file import or a time zone hint (`user-time-zone-profile-setting.md` is about the profile setting, not import).
- One open PR mentions CSV: #2922, field notebook slice 1. The builder should check it for edits to the files above before starting, and re-check open PRs at claim time.
- Recent merged work in this area: #2902, #2908, #2909, #2911, #2913. This spec builds on them and changes none of their behavior.

## Implementation notes

### Slice 1: reading the clock from the rows

- **Where the evidence comes from.** The parser already knows, for each wall-clock row, whether the chosen zone resolved it, found it ambiguous (the repeated fall-back hour) or found it nonexistent (the skipped spring hour). The new rule reads those outcomes plus the wall-clock times in order. It needs nothing new from the file.
- **Spring-forward evidence** (strong). Rows that land in the skipped hour mean the device's clock did not jump forward. One or more of these rows, at a steady cadence, is `fixed_clock_likely`.
- **Fall-back evidence** (weaker, _inference_). A clock that follows DST records the repeated hour twice: the wall-clock times step back by an hour, or each time in that hour appears twice. A fixed clock records it once, at the normal cadence. Ambiguous rows that each appear once, with no step back and no cadence break, are `fixed_clock_likely`. Anything else is `follows_dst` or `inconclusive`.
- **No transition in range** (for example the October file alone with Chicago) returns `no_transition_in_range`, and no hint shows. This is the R1 acceptance case.
- **Which no-DST zone to suggest.** Use the standard offset of the zone the grower picked (Chicago → −06:00 → America/Regina). _Inference:_ a device that ignores DST most often keeps standard time. The Nov GGS file supports it: it starts at 18:00 local, which is midnight UTC at −06:00, and the month files split at UTC midnight. The hint copy says this is a suggestion to check, not a fact about the device.
- **Never automatic.** The hint is shown, never applied. Only the grower's tap calls `handleTimeZone` with the suggested zone. Their pick still goes through the same validation (`isValidIanaTimeZone`) as the list.
- **Deterministic.** No `Date.now()`, no `Math.random()`. The transition dates come from the zone and the rows' own dates.
- **Suggested copy** (to settle in review, lives in `src/constants/csvTimeZoneHintCopy.ts`):
  - Note: “This file looks like it was recorded on a clock that doesn't change for daylight saving. _N_ readings fall in the hour Chicago repeats on Nov 1.”
  - Button: “Use America/Regina (UTC−06:00, no daylight saving)”
  - Secondary: “Keep America/Chicago”

### Slice 2: several files

- **Parse one file at a time,** each under the existing per-file limits, so memory stays what it is today. Cap the set at 12 files; a 13th is refused with a message, not dropped silently.
- **One zone for the set.** A zone change re-parses every file in the set, and the slice 1 hint reads evidence across all of them.
- **Byte-identical files** are found by SHA-256 of the file bytes (`crypto.subtle.digest`, in the modal). The rules take the hashes as input, so they stay pure. The copy is listed as “same file as …” and contributes nothing.
- **The same reading in two files** means the same tent, source, metric and `captured_at`, the key the unique index already uses. Equal values after the parser's normalization: saved once. Different values: neither is saved, and the preview counts them as conflicts by file pair. No tolerance and no “newer wins”: a conflict is the grower's to look at.
- **A file that fails** (no sensor data, wrong format, over a limit) is listed with its reason and left out. The rest still import. The grower can remove it from the list before confirming.
- **One undo.** Generate one `import_batch_id` for the whole set, the same way a single file gets one today, and pass it on every row. The existing batch undo (#2909) then removes the whole set. _Inference to confirm:_ nothing in persistence assumes one file per batch.
- **Replay.** Each file is fingerprinted by the existing replay guard. A file already imported is shown as already imported and left out, as one file is today.
- **Order.** Sort the files by their first `captured_at`, then by file name, so the preview and the merged rows don't depend on the order the browser lists them.

### Slice 3: the soil message

- Replace `CSV_SOIL_ONLY_MESSAGE` with `csvSoilColumnsNotReadMessage(columns: readonly string[])`. Keep the old export name only if another module needs it; today only the parser and one test import it.
- The message names the columns, says what Verdant reads (soil temperature with a stated °C or °F unit, soil moisture, soil EC) and, for a soil temperature column with no unit, asks for a header with °C or °F.
- Suggested copy: “These soil columns weren't read: _temperature_soil_. Add °C or °F to the column name and import again.”

## Tests required

Every new test is shown failing before its fix, and the failing count goes in the PR body. Tests live in `src/test/`. Fixtures are synthetic and labeled, with neutral ids such as `qa-device`: no real serial, room or sensor id.

### Slice 1 — `src/test/csv-clock-evidence-rules.test.ts` (new)

- A fall-back day in America/Chicago, 5-minute cadence, the repeated hour recorded once: `fixed_clock_likely`, suggestion America/Regina.
- The same day with the hour recorded twice: `follows_dst`, no suggestion.
- A spring-forward day with rows in the skipped hour: `fixed_clock_likely`.
- A range with no transition: `no_transition_in_range`.
- Too few rows near the transition, or an irregular cadence: `inconclusive`.
- A zone with no DST (America/Phoenix, UTC): no suggestion.
- Same input, same output (no clock): run twice and compare.

### Slice 1 — modal, extend `src/test/csv-import-source-time-zone.test.tsx`

- A synthetic Nov-style file plus Chicago shows the hint. One tap re-parses with America/Regina and shows 0 held rows.
- The hint never changes the zone without the tap.
- A file with no transition shows no hint.

### Slice 2 — `src/test/csv-multi-file-import-rules.test.ts` (new)

- Two files with no overlap: rows combine, counts add up.
- Two byte-identical files (same hash): imported once, the copy listed.
- One reading in two files with the same value: saved once. With different values: neither saved, conflict counted.
- A failed file is left out and the rest import.
- 13 files: refused with the cap message.
- Shuffled input order gives the same merged rows.
- Zero values stay zero, not missing.

### Slice 2 — modal and persistence

- New `src/test/csv-import-multi-file-modal.test.tsx`: pick three files, see one row per file and a total, confirm, and every insert carries one `import_batch_id`.
- Extend `src/test/csv-import-idempotency.test.ts`: importing the same set twice adds nothing the second time.
- Extend `src/test/csv-history-duplicate-import-regression.test.tsx`: a set that includes an already-imported file leaves that file out.
- One batch undo removes rows from every file in the set (extend the #2909 undo test).

### Slice 3

- Renegotiate `src/test/csv-parser-metric-identity.test.ts:208` to assert on the new function's output for a unitless soil temperature column.
- New case: a file with only an unsupported soil column gets a message that names that column.
- A file with supported soil columns gets no soil message (already true; keep it pinned).

### Regression suites to run per slice

`csv-parser.test.ts`, `csv-import-spider-farmer-soil-and-dst.test.tsx`, `csv-import-codex-review-fixes.test.ts`, `csv-import-review-gate.test.tsx`, `csv-import-plan-rules.test.ts`, `csv-import-batch-undo-migration.test.ts`.

## Validation commands

Run on the slice branch, at its final head. Use the existing `node_modules`; don't reinstall.

```bash
bun run typecheck
bunx vitest run src/test/csv-clock-evidence-rules.test.ts src/test/csv-import-source-time-zone.test.tsx --reporter=dot
bunx vitest run src/test/csv-multi-file-import-rules.test.ts src/test/csv-import-multi-file-modal.test.tsx src/test/csv-import-idempotency.test.ts src/test/csv-history-duplicate-import-regression.test.tsx --reporter=dot
bunx vitest run src/test/csv-parser-metric-identity.test.ts src/test/csv-parser.test.ts src/test/csv-import-spider-farmer-soil-and-dst.test.tsx --reporter=dot
bun run lint
bun run build
```

For the modal, a mocked browser check with an explicit spec filter, against a dev server on 127.0.0.1:8080:

```bash
bun run dev -- --host 127.0.0.1 --port 8080
E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked <new csv import spec>
```

The full sharded suite runs in CI (35 required checks). Local fixtures validate code, not production. A check on the live site counts only after `/version.json` reports the merged SHA, and only with the disposable test account and a `[smoke <timestamp>]` tag.

## Safety verdict, risk and rollback

### Safety verdict: PASS for spec, each slice still needs its own review

- **Receive-only.** Nothing here talks to the controller. No device command, no firmware change, no control of any kind.
- **No schema, RLS, Edge or migration change.** All three slices are client-side parsing, preview and copy, plus the existing write path.
- **Nothing guessed silently.** The time zone hint is a suggestion the grower taps. Conflicting readings are held, not resolved by the app. Ambiguous and nonexistent times stay held as today unless the grower changes the zone.
- **Provenance stays `csv`.** Every row keeps its source, tent, captured time and batch id. Zero stays zero.
- **Review.** Each slice goes to an eligible independent reviewer who neither wrote nor repaired it, at the exact head SHA, with 35/35 required checks green and no P1 or P2.

### Risk and rollback

| Risk            | What could go wrong                             | Guard                                                | Rollback                                                                    |
| --------------- | ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Wrong hint      | The rule calls a DST-following file fixed-clock | Hint only, never applied; evidence counts shown      | Revert slice 1; rows imported with the wrong zone are removed by batch undo |
| Merged readings | A conflict is saved once instead of held        | Pure rule with tests on equal and unequal values     | Revert slice 2; batch undo removes the whole set                            |
| Memory          | Twelve large files at once                      | Parse one at a time, per-file limits kept, cap of 12 | Lower the cap or revert slice 2                                             |
| Copy pins       | A test elsewhere pins the old soil copy         | Search all tests for the old text before merging     | Revert slice 3                                                              |

Each slice is its own PR and reverts on its own.

## Out of scope

- The data-quality notes from the GGS files (soil moisture stuck at 0 or 100, the October gaps, the small soil differences between device and sensor files). A follow-up should flag these in the preview.
- Picking a time zone without the grower's tap.
- Live GGS ingest or any connection to the controller.
- Importing the two `sensor_export` files as their own source.
- Any change to how Quick Log, the Timeline or AI Doctor read sensor rows.
