# Bug #13 — EC/PPM Selector Evidence Checklist

## Current status

- Bug #13 is **open** until visual evidence proves the selector options in the live UI.
- Code and automated test evidence is useful but does **not** close a display bug on its own.
- The operator recording (`Recording 2026-06-16 035347.mp4`) is **partial** evidence only — it shows Quick Log → Feeding → Hardware readings and the `Feed/Input EC mS/cm` / `Runoff EC mS/cm` fields, but does not show the EC unit selector opened or all four unit options visible.
- **Slice 2 remains blocked** until Bug #13 is closed by a real screenshot, or a scoped UI fix is completed if the selector is missing.

## Correct Verdant route

Use the corrected navigation. Do **not** use the old "Grows → pick grow" wording.

```
Tents → select tent → plant / plant detail context → Quick Log → Feeding → Add more details → EC unit selector
```

## Where the selector lives

- The **EC unit selector** is inside **Quick Log → Feeding → Add more details**.
- The **Hardware readings** section may show fixed display labels such as:
  - `Feed/Input EC mS/cm`
  - `Runoff EC mS/cm`
- Those fixed display labels do **not** by themselves prove the selector options. The screenshot must show the **selector open** with all four unit options visible.

## Captured screenshot status

- **Status:** Pending.
- **Expected screenshot path:** `docs/evidence/bug-13-ec-ppm-selector.png`
- This file must be captured from the real authenticated preview UI.
- The screenshot must show:
  - Quick Log open
  - Feeding selected
  - Add more details expanded / open
  - EC unit selector open
  - `EC mS/cm` visible
  - `EC µS/cm` visible
  - `PPM 500 scale` visible
  - `PPM 700 scale` visible
- The automated smoke test is useful support evidence but does not replace the authenticated screenshot.
- **Do not use an unauthenticated route, auth bypass, seeded account, committed credential, AI-generated screenshot, or fabricated evidence to close Bug #13.**

## Required screenshot contents

A single screenshot must show all of the following simultaneously:

- [ ] Quick Log is open
- [ ] Feeding is selected
- [ ] **Add more details** is expanded / open
- [ ] EC unit selector is open
- [ ] `EC mS/cm` is visible
- [ ] `EC µS/cm` is visible
- [ ] `PPM 500 scale` is visible
- [ ] `PPM 700 scale` is visible
- [ ] `µS/cm` is visually distinct from `mS/cm`
- [ ] `PPM 500 scale` is visually distinct from `PPM 700 scale`
- [ ] No demo/manual/live/stale/invalid source-label confusion is introduced
- [ ] No fake-live sensor value is introduced

## Screenshot save path

Save the captured artifacts as:

```
docs/evidence/bug-13-ec-ppm-selector-2026-06-16.png
docs/evidence/bug-13-ec-ppm-selector-2026-06-16.md
```

## Evidence note fields

The matching `bug-13-ec-ppm-selector-2026-06-16.md` note must include:

- evidence source
- route/path inspected
- screenshot path
- visible labels (verbatim)
- pass/fail verdict
- whether Bug #13 can close
- whether Slice 2 remains blocked
- next action if the selector is missing

## Verdict rules

```
All four labels visible        → Bug #13 CLOSE
Selector missing or won't open → Bug #13 KEEP OPEN — fix required
No screenshot                  → Bug #13 BLOCKED — authenticated visual evidence still required
```

## Manual capture reminder

Do **not** use an unauthenticated evidence route to close Bug #13. The screenshot must come from the real authenticated preview or production-like UI.

## Out of scope for this evidence pass

This checklist does not authorize an unauthenticated evidence route, auth bypass, seeded preview account, or committed credentials. Visual Bug #13 closure must come from the real authenticated UI. If a read-only preview account is needed, it must be handled as a separate operations/auth task with no committed secrets.

## Companion automated smoke test

`src/test/quicklog-ec-unit-selector-smoke.test.tsx` opens the EC unit selector in the Quick Log details panel and asserts all four labels from `EC_UNIT_LABEL` (`src/constants/units.ts`) render, that `µS/cm` and `mS/cm` are distinct, and that `PPM 500 scale` and `PPM 700 scale` are distinct. A passing smoke test does not close Bug #13 — it only supports a **CLOSE CANDIDATE** status pending the real authenticated screenshot.
