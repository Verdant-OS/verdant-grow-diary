# Bug #13 — EC/PPM Selector Evidence Note (2026-06-16)

Status: **KEEP OPEN — selector options not visually proven**

## Evidence source
- Operator screen recording: `Recording 2026-06-16 035347.mp4` (not committed to repo; reviewed for this audit only).
- No screenshot captured by Lovable agent — preview is on `/auth` and no credentials are available in the sandbox.

## Correct navigation path (Verdant)
Tents → select tent → plant / plant detail context → Quick Log → Feeding → Hardware readings → EC unit selector

(Supersedes earlier "Grows → pick grow" wording in prior notes.)

## What the recording proves
- Operator can reach the real Verdant flow end-to-end:
  Tents → tent/plant context → Quick Log → Feeding.
- Quick Log opens.
- Feeding event is selected.
- Hardware readings section is visible.
- EC fields render with labels including:
  - `Feed/Input EC mS/cm`
  - `Runoff EC mS/cm`

## What the recording does NOT prove
- The EC unit selector was not opened on camera.
- The four required unit options were not shown:
  - `EC mS/cm`
  - `EC µS/cm`
  - `PPM 500 scale`
  - `PPM 700 scale`
- Therefore visual proof of the selector — and that mS/cm vs µS/cm and PPM-500 vs PPM-700 are visibly distinct — is still missing.

## Code-side reference (not a substitute for visual evidence)
- Constants: `src/constants/units.ts` (`EC_UNITS`, `EC_UNIT_LABEL`) define the four labels.
- Conversion: `src/lib/ecUnits.ts` handles canonical EC.
- Selector render: `src/components/QuickLog.tsx` (~lines 1280–1308).

Per task rules, code inspection alone does **not** satisfy Bug #13.

## Required missing evidence
A single screenshot of the live preview showing, simultaneously:
- Quick Log visible
- Feeding selected
- Hardware readings visible
- Feed/Input EC or Runoff EC field visible
- EC unit selector **open**
- All four labels visible and distinct: `EC mS/cm`, `EC µS/cm`, `PPM 500 scale`, `PPM 700 scale`

Save to: `docs/evidence/bug-13-ec-ppm-selector-2026-06-16.png`

## Current Bug #13 verdict
**KEEP OPEN — selector options not visually proven.**

Two possible outcomes after live capture:
1. Selector opens and all four labels render → flip to CLOSE, attach screenshot, clear gate.
2. Live UI only shows fixed labels like `Feed/Input EC mS/cm` / `Runoff EC mS/cm` with no openable unit selector → reclassify as **Bug #13: KEEP OPEN — EC/PPM selector missing from live UI** and schedule the scoped fix below.

## Scoped fix recommendation (do NOT implement in this task)
If the selector is proven missing from the live UI:
- Add an EC unit selector to the Quick Log → Feeding → Hardware readings UI next to each EC input.
- Reuse existing `EC_UNITS` and `EC_UNIT_LABEL` from `src/constants/units.ts`.
- Preserve canonical EC handling via `src/lib/ecUnits.ts` — no change to stored units.
- Keep `mS/cm`, `µS/cm`, `PPM 500 scale`, `PPM 700 scale` visibly distinct (no abbreviation collisions).
- Add/confirm tests:
  - selector renders
  - all four labels render
  - µS/cm and mS/cm are visually distinct
  - PPM-500 and PPM-700 labels are distinct
  - no fake-live sensor source label is introduced
  - manual Quick Log entry remains `source = "manual"`
- No schema, RLS, Edge Function, alerts, Action Queue, AI, automation, or device-control changes.

## Safety
- No secrets, tokens, private IDs, MAC/IP, bridge tokens, or device-control instructions in this note.
- No runtime, schema, or UI changes made by this task.
