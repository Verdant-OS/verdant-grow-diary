# Quick Log Water: liters by default (step 1 of the one-tap Watered plan)

Status: built on `claude/water-unit-liters-default` (PR #2966, ready for review), Claude (Taproot thread). In independent review, not merged.
Build base: `verdant-grow-diary` at `c2884348875b3dd39f2059ecc323ac10c33cfde5` (2026-11-12). The draft was read at
`a6be0915`; none of the files in §4 changed between the two.
Amends: `docs/specs/quick-log-water-volume-units.md` R13 (first sentence only) and the D1 record in §8.
Founder decision: Matthew, 2026-11-12, in the friction-walk thread: "Let's go with one unit per phone in
liters, if that is the path of least resistance." Then "Draft step 1". Then, on D-L1, "Liters for all"
(2026-11-12). That answer is a pick, not approval to edit the locked files in §6.2.

## 1. Summary

A grower who has never picked a unit on the Water form sees liters, not milliliters. A grower who
already picked a unit keeps it. Nothing about what is saved changes: rows still store whole
milliliters, converted once, exactly, from what the grower typed in the unit they can see.

Grower impact: a tired grower pouring from a jug or a 1 L measuring cup types `2`, not `2000`, and the
form tells them it saves as 2,000 ml. Steps 2 and 3 (reuse the last amount, one-tap Watered) read and
show amounts in this unit, so this lands first.

Code size: one constant. Test size: eleven locked files (five planned in §6.2, six more found by the
first CI run, §6.2.1) and one new test file (§6), which is the real cost of this step.

## 2. Requirements and assumptions

- **L1. Default is liters.** `DEFAULT_WATER_ENTRY_UNIT` becomes `"L"`. Every fallback that returns it
  today (no stored value, an unknown stored value such as `"quart"`, a storage read that throws,
  storage unavailable) now opens the Water form in liters.
- **L2. A stored choice wins.** A phone whose `verdant:waterVolumeEntryUnit` holds `"ml"`, `"L"` or
  `"gal"` opens in that unit, as today. This step never overwrites a stored choice.
- **L3. The default writes nothing.** Only the unit control writes the preference (R13 unchanged).
  Opening the form, saving, or tapping a preset on a liters-by-default phone leaves storage empty.
- **L4. Saved data does not change.** `volume_ml` and `runoff_ml` stay canonical whole milliliters,
  converted by R4 (exact rational, one rounding). No existing row is read, rewritten or backfilled.
  No unit is stored on a row.
- **L5. The unit is always visible.** The labels read `Volume (L)` and `Runoff (L)`, the L button is
  pressed, and valid L text shows `Saves as N ml.` (R6). No unit is ever inferred from the number
  (R10). This is what keeps the change from being a silent conversion.
- **L6. Presets stay in ml (D3 b).** Tapping `1000 ml` switches that form to ml and saves 1000. It does
  not store a preference, so the next new form opens in liters again.
- **L7. Prefill keeps the stored value (R8).** A last-watering prefill of 1,893 ml shows `1.893` in
  liters; saving it unedited sends `volume_ml: 1893`.
- **L8. The ml-habit guard already exists.** A grower used to milliliters who types `500` into the
  liters field asks for 500,000 ml, which is over the 50,000 ml hard maximum: the form shows the
  ceiling in liters and will not save. `20` asks for 20,000 ml, which is over the 10,000 ml warning
  threshold: the form asks them to confirm the amount. Typing ml numbers under 10 into a liters field
  is the only case the guards do not catch, and those are not plausible waterings.

**Assumption A1.** The app cannot tell a brand-new phone from an existing phone whose grower never
touched the unit control: both have nothing stored. So "liters for new phones" in practice means
"liters for every phone without a stored choice". See decision D-L1.

## 3. Decision for Matthew

**D-L1. Existing phones that never picked a unit. DECIDED: option 1, "Liters for all" (Matthew,
2026-11-12).** Every phone with no stored unit opens in liters. The options as they were put to him:

1. **Liters for them too (recommended).** One constant. Their next Water form says `Volume (L)`, shows
   the `Saves as` line, and the L8 guards stop a 500-typed-as-ml mistake. One tap on `ml` brings back
   milliliters for good on that phone.
2. **Keep milliliters for phones that already used Verdant.** On first load with no stored unit, if
   other Verdant data on the phone shows earlier use, store `ml` once. It is a guess about who is
   "new", it adds a second writer to a preference R13 says only the unit control writes, and it needs
   its own tests. Two to three times the work of option 1.

Recommendation: option 1. It is the path of least resistance he asked for, the unit is visible on
every form, and nothing saved changes. The 2026-11-03 D1 record warned that a changed default for
existing growers would be silent; L5 and L8 are why it is not silent here.

## 4. File-level plan (the build slice, not this doc)

| File | Change |
| --- | --- |
| `src/lib/quickLogWaterVolumeUnitRules.ts` line 18 | `DEFAULT_WATER_ENTRY_UNIT` from `"ml"` to `"L"` |
| `src/lib/waterVolumeEntryUnitPreference.ts` | Header comment only: "fall back to ml" becomes "fall back to the default unit (L)" |
| `docs/specs/quick-log-water-volume-units.md` | R13 first sentence points here; §8 gains a dated D1 revision line. History stays. |
| `src/test/quick-log-water-liters-default.test.tsx` (new) | §6.1 |
| Eleven locked scorer files | §6.2 and §6.2.1, each edited only after Matthew's approval |
| `docs/agents/handoffs/WATER-UNIT-LITERS-DEFAULT.md` | The handoff block, written before the first push |

Untouched: `QuickLogWateringForm.tsx` (it already reads `loadWaterVolumeEntryUnit`),
`QuickLogV2Sheet.tsx` (its `unit: "ml"` calls pass canonical ml to the large-water check, correctly),
both payload builders, `quickLogWaterVolumeWarningRules.ts`, the save RPC, migrations, RLS, Edge
Functions, auth, Timeline readback, the Feed form (its nutrient unit is `mL/L` and unrelated).

## 5. Implementation notes

- The business rule stays in `src/lib`: the default lives in the rules module, the fallback in the
  preference module. No UI component learns a new rule.
- The form already seeds its remembered-unit state from `loadWaterVolumeEntryUnit()`, so the label,
  the pressed button, the `Saves as` line and the too-large copy all follow the constant with no
  component edit.
- **Why five planned locked files.** Twenty test files (nineteen Vitest suites and the Playwright smoke) find
  the Water field by the label `Volume (ml)` and type milliliter numbers. Each Vitest run starts with
  empty localStorage (`src/test/setup.ts` clears it), so after the flip every one of them would see
  `Volume (L)`. Two ways to keep them honest:
  - **Recommended:** `src/test/setup.ts` stores `ml` for the unit key right after it clears storage,
    with a comment that the older Water suites model a phone that chose ml, and that the default
    itself is owned by the two units suites and the new suite, which remove the key first. One locked
    file instead of eighteen.
  - **Alternative:** a one-line `beforeEach` that stores `ml` in each of the eighteen older suites.
    More explicit, eighteen locked-file approvals.
- A suite that tests the default must remove the key in its own `beforeEach`, or it reads the seeded
  `ml` and passes for the wrong reason. The new suite and both units suites do this.
- The Playwright smoke runs in a fresh browser, which is a real new phone: it should expect
  `Volume (L)`. `src/test/quicklog-route-contract-static.test.ts` pins that smoke line as text, so it
  moves with it.

## 6. Tests required

### 6.1 New suite: `src/test/quick-log-water-liters-default.test.tsx`

Writable (new scorer). Each `beforeEach` removes `verdant:waterVolumeEntryUnit`.

1. No stored value: `loadWaterVolumeEntryUnit()` returns `"L"`.
2. Stored `"quart"` returns `"L"`; a `getItem` that throws returns `"L"`.
3. Stored `"ml"` returns `"ml"`; stored `"gal"` returns `"gal"` (L2).
4. Rendering the Water form with nothing stored leaves the key empty (L3).
5. Nothing stored: the label is `Volume (L)`, the L button has `aria-pressed="true"`, typing `2`
   gives `volume_ml: 2000` and shows `Saves as 2,000 ml.`
6. Typing `500` in the default liters field: the too-large ceiling copy shows in liters and the
   payload is not buildable. Typing `20` needs the large-water confirmation (L8).
7. Runoff: the label is `Runoff (L)`; `0.25` saves `runoff_ml: 250`.
8. Tapping `1000 ml`: the label becomes `Volume (ml)`, `volume_ml: 1000`, the key stays empty, and a
   freshly mounted form opens in liters (L6).
9. A 1,893 ml prefill shows `1.893` and saves `volume_ml: 1893` unedited (L7).
10. An untouched form opened in liters is pristine (no draft from the default alone).

**Negative gate:** set the one-line constant change aside, run this suite, expect 1, 2, 5, 6, 7, 8 and 9
to fail and 3, 4 and 10 to pass (they do not depend on the default); restore. Seat A's mutation at
`0463d0e5f` measured exactly that. A suite that passes either way pins nothing.

### 6.2 Locked files planned (Matthew, "Edit them", 2026-11-12T14:28:59Z)

| Locked file | What changes |
| --- | --- |
| `src/test/setup.ts` | Seed `ml` for the unit key after the clear (§5 recommended path) |
| `src/test/quick-log-water-volume-units-rules.test.ts` | The three `toBe("ml")` default and fallback expectations become `"L"`, test names follow; remove the key in `beforeEach` |
| `src/test/quick-log-water-volume-units-ui.test.tsx` | "defaults to ml with today's label" and "an unknown stored unit opens in ml" become liters; tests that type ml numbers without choosing a unit first choose `ml` (the builder lists them from the RED run) |
| `e2e/quicklog-smoke.spec.ts` line 364 | `Volume (ml)` becomes `Volume (L)` |
| `src/test/quicklog-route-contract-static.test.ts` line 51 | The pinned smoke text follows line 364 |

Each unlock goes through `node scripts/scorer-lock.mjs --unlock <path> --reason "<why>"` on the build
branch and is declared in the PR body with Matthew's approval time. If the RED run shows any other
locked file failing, the build stops and asks before touching it.

#### 6.2.1 Locked files found by the first CI run (approved before each edit)

The shared seed did not reach suites that wipe storage themselves, and two tent checks counted every
stored key. Each fix keeps the suite's own assertions; none was deleted or narrowed.

| Locked file | What changes | Approval |
| --- | --- | --- |
| `src/test/tent-plant-roster-preferences.test.ts` | The no-write check compares `localStorage.length` to the length before the write, not to `0` | "Edit both", 2026-11-12T15:25:57Z |
| `src/test/tent-plant-tabs-preferences.test.ts` | Same | "Edit both", 2026-11-12T15:25:57Z |
| `src/test/quick-log-v2-sheet-watering.test.tsx` | Re-seed `ml` after `clearLocalStorageForTest()` | "Edit all four", 2026-11-12T16:57:04Z |
| `src/test/quick-log-v2-refresh-sheet.test.tsx` | Same | "Edit all four", 2026-11-12T16:57:04Z |
| `src/test/quick-log-starter-water-typed-handoff.test.tsx` | Same | "Edit all four", 2026-11-12T16:57:04Z |
| `e2e-local/native-watering-recovery.spec.ts` | Seed `ml` with `context.addInitScript` before sign-in (e2e-local has no shared seed) | "Edit all four", 2026-11-12T16:57:04Z |

### 6.3 Older suites that must stay green with no edit (recommended path)

The three Quick Log suites in §6.2.1 were on this list in the plan; the build had to edit them.

`quick-log-watering-form`, `quick-log-water-confirm-amount-edit`,
`quick-log-feeding-review-view-model`, `quick-log-water-save-gate-ec`,
`quick-log-watering-review-view-model`,
`quick-log-water-volume-confirm-reset`, `quick-log-v2-sheet-feeding`,
`quick-log-v2-sheet-watering-volume-defaults`, `quick-log-water-volume-save-helper`,
`quick-log-water-save-gate`, `quick-log-water-temperature-a11y`,
`quick-log-water-volume-warning-ui`, `quick-log-water-volume-confirm-early-return`,
`quick-log-water-temperature-inline-gate`,
`quick-log-v2-sheet-feeding-defaults`, plus the R13 suites `quick-log-water-volume-text-bound`,
`-save-parser-parity`, `-warning`, `-warning-boundaries`.

## 7. Validation commands

```
bunx vitest run src/test/quick-log-water-liters-default.test.tsx src/test/quick-log-water-volume-units-rules.test.ts src/test/quick-log-water-volume-units-ui.test.tsx src/test/quicklog-route-contract-static.test.ts --reporter=dot
bunx vitest run src/test/quick-log-v2-sheet-watering.test.tsx src/test/quick-log-watering-form.test.tsx src/test/quick-log-water-confirm-amount-edit.test.tsx src/test/quick-log-feeding-review-view-model.test.ts src/test/quick-log-water-save-gate-ec.test.tsx src/test/quick-log-watering-review-view-model.test.ts src/test/quick-log-v2-refresh-sheet.test.tsx src/test/quick-log-water-volume-confirm-reset.test.tsx src/test/quick-log-v2-sheet-feeding.test.tsx src/test/quick-log-v2-sheet-watering-volume-defaults.test.tsx src/test/quick-log-water-volume-save-helper.test.tsx src/test/quick-log-water-save-gate.test.tsx src/test/quick-log-water-temperature-a11y.test.tsx src/test/quick-log-water-volume-warning-ui.test.tsx src/test/quick-log-water-volume-confirm-early-return.test.tsx src/test/quick-log-starter-water-typed-handoff.test.tsx src/test/quick-log-water-temperature-inline-gate.test.tsx src/test/quick-log-v2-sheet-feeding-defaults.test.tsx --reporter=dot
bun run typecheck
bun run lint
node scripts/scorer-lock.mjs --report --strict --base <build base sha>
```

The Playwright smoke needs its own environment; until it runs, record it as `NOT_MEASURED`, not PASS.

**Phone check after a deploy (NOT_MEASURED until done):** on a phone that never chose a unit, open
Quick Log, Water. Expect `Volume (L)`. Type `2`, see `Saves as 2,000 ml.`, save, reload, and confirm
the entry is there. Then tap `ml`, close, reopen: it stays in ml.

## 8. Safety verdict

SAFE to build. D-L1 is decided. Each of the eleven locked files in §6.2 and §6.2.1 was edited only
after Matthew's recorded approval for that file.

- No schema, migration, RLS, RPC, Edge Function or auth change.
- No sensor, AI, Action Queue or device-control path is touched.
- Saved data is unchanged; the unit is a per-phone display preference with a visible label and a
  `Saves as` line, so nothing converts or mixes units silently.
- Account, grow, tent and plant association are untouched; the preference holds no ids or amounts.

## 9. Risk and rollback

- **Risk:** a grower used to milliliters misreads the field. Covered by L5 and L8; the residual case is
  typing an ml amount under 10.
- **Risk:** a locked test is edited without approval. Covered by §6.2 and the strict scorer-lock report.
- **Rollback:** revert the constant and the test edits. No rows change in this step, so there is
  nothing to repair. Phones that chose a unit while it was live keep that choice.

## 10. Non-goals

Reusing the last amount (step 2), one-tap Watered and its 5-second undo (step 3), Same as last feed
(step 4), the home glance and tent switcher (step 5), showing Timeline amounts in liters, a per-tent
unit, an account-level unit synced across phones, and any change to the Feed form units.

## 11. Coordination

No open handoff touches these files. `FIELD-NOTEBOOK-SLICE-1` (PR #2922) edits AppShell and the
notebook, and `LEGACY-QUICKLOG-RETIREMENT-SPEC` is docs only. Checked against open handoff blocks at
`a6be0915` on 2026-11-12, and rechecked at `c2884348`: the earlier water-unit handoffs
(QUICK-LOG-WATER-VOLUME-UNITS-SPEC and -IMPL, GROWER-BUGS-20) are CLOSED, and no open block names these files.
