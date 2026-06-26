# Seed Production Tracking — Workbook Spec

> **Docs-only spec.** Not approved for V0 app implementation. Workbook /
> spreadsheet layer that sits after the Commercial Release Checklist. No code,
> schema, RLS, RPC, Edge Function, UI, AI call, alert, Action Queue write, or
> device control is introduced by this document.

---

## 1. Status

- Workbook / spec only.
- Not approved for V0 app implementation.
- Operator-facing material for breeders running seed-production cycles
  alongside Verdant.

---

## 2. Purpose

Track seed lots end-to-end:

- Pollination event and parentage.
- Harvest of seeded material.
- Drying / curing of seed-bearing flowers.
- Cleaning and viable-seed count.
- Germination testing and viability percentage.
- Storage conditions.
- Commercial-release review handoff.

The sheet is the source of truth for seed-lot provenance until an app-side
seed-lot model exists.

---

## 3. Sheet columns — `Seed_Production_Tracking`

| Column                          | Notes                                                        |
| ------------------------------- | ------------------------------------------------------------ |
| Seed Lot ID                     | Workbook ID; should map 1:1 to a Verdant project where possible. |
| Project / Line                  | Breeding project or line name.                               |
| Generation                      | F1 / F2 / BC1 / BC2 / BC3 / S1 / etc.                        |
| Female Parent                   | Plant ID or strain name.                                     |
| Male Parent                     | Plant ID or strain name (or "open" if uncontrolled).         |
| Pollination Date                | Date.                                                        |
| Isolation Method                | Tent-isolated / chamber / bagged branch / open-pollinated.   |
| Seed Harvest Date               | Date seeded material was chopped.                            |
| Dry / Cure Start Date           | Date seeds entered drying/curing.                            |
| Total Seeds Collected           | Integer (pre-cleaning).                                      |
| Cleaned / Viable-looking Seeds  | Integer (post-cleaning, mature dark-shell count).            |
| Viability % Tested              | See §4.                                                      |
| Germination Test Date           | Date germ test started.                                      |
| Sample Size Tested              | Integer (recommend 20–30, see §5).                           |
| Day 5 Germ Count                | Integer.                                                     |
| Day 7 Germ Count                | Integer.                                                     |
| Final Germ Count                | Integer.                                                     |
| Final Count Day                 | Day number (typically 10).                                   |
| Storage Method                  | Glass vial / mylar / vacuum / freezer / fridge.              |
| Storage Temp                    | °C.                                                          |
| Storage RH / Desiccant          | RH % and desiccant type (silica, rice, none).                |
| Production Notes                | Free text.                                                   |
| Quality Flag                    | See §4. Green / Yellow / Red.                                |
| Commercial Release Linked?      | Yes / No.                                                    |
| Linked Commercial Checklist Row | Reference into the Commercial Release Checklist.             |
| Verdant Diary Entry             | Reference / link to diary entry IDs.                         |
| Verdant Action Queue Item       | Candidate next step for grower review — never auto-created.  |

All values are operator-entered. No AI scoring.

---

## 4. Formulas

Spreadsheet-side only.

- **Viability %** = `Final Germ Count / Sample Size Tested * 100`
- **Cleaned-to-Collected Ratio** = `Cleaned Seeds / Total Seeds Collected * 100`
- **Viable Seed Estimate** = `Cleaned Seeds * (Viability % / 100)`
- **Quality Flag**:
  - Green: Viability % ≥ 85 AND Cleaned Ratio ≥ 60.
  - Yellow: Viability % 60–84 OR Cleaned Ratio 40–59.
  - Red: Viability % < 60 OR Cleaned Ratio < 40 OR untested.
- **Summary metrics** (per project, per generation):
  - Mean Viability %, Median Viability %, StdDev Viability %.
  - Total Viable Seed Estimate.
  - Count of lots by Quality Flag.

Quality Flag is operator-readable signal, not an instruction.

---

## 5. Germination protocol

- **Sample size:** 20 seeds minimum; 30 preferred for lots intended for
  release. Smaller lots (< 50 seeds total) may use 10, flagged as
  low-confidence test.
- **Method:** paper-towel or rockwool, consistent temp (24–27 °C), darkness or
  low light.
- **Checkpoints:**
  - Day 3 — note any early poppers (don't count toward final yet).
  - Day 5 — first counted checkpoint.
  - Day 7 — second counted checkpoint.
  - Day 10 — final count (configurable via Final Count Day column).
- **Retest guidance:**
  - Viability < 60% → retest with a fresh sample of equal size before any
    release decision.
  - Viability 60–84% → optional retest; record both results if performed.
  - Viability ≥ 85% → no retest required.
- Mold / damping-off in > 20% of sample invalidates the test; restart.

All thresholds are operator guidance. Verdant does not auto-decide.

---

## 6. Verdant integration

When the operator chooses to mirror entries into Verdant:

- Link to **Plant IDs / project IDs** where available.
- Log pollination, harvest, cleaning, and germ-test results as **Diary
  entries** via Quick Log.
- Attach **photos** (seed shells, germ-test trays) if useful.
- **Action Queue items are grower-review-only.** The workbook never creates
  Verdant Action Queue entries directly.

---

## 7. Safety rules

- **No automatic release decision.** Quality Flag is signal, not approval.
- **No automatic Action Queue creation** from this workbook.
- **No AI approval language.** "Approved," "release," and "ship" are operator
  decisions logged manually.
- **Low viability triggers review, not a command.** A Red flag means the
  operator should investigate (retest, inspect storage, check parentage),
  not that Verdant has rejected the lot.
- Seed lot data is provenance — never overwrite historical rows; append
  corrections as new rows with notes.

---

## 8. Future app implementation gates

Before any of this becomes an app feature:

1. Workbook usage is stable across at least one full breeding cycle.
2. A **seed lot data model** is designed (lot ID, parentage FKs, germ-test
   history, storage history).
3. **RLS review:** SELECT own rows; writes via RPC / service_role only; no
   client-side mutation of viability or quality flag.
4. **Diary linkage** is implemented end-to-end so seed-lot events can be
   reconstructed from diary history.
5. **Audit trail** for viability tests, retests, and storage changes is
   append-only.
6. AI remains cautious and evidence-bound — no automatic release, no
   automatic cull, no scoring from a single germ test.

Until each gate is met, seed-production tracking stays in the workbook.

---

## 9. Safety and Review Checklist

This workbook surfaces uncertainty. It does not make release decisions.

**Review signal means:**

- The row needs human inspection.
- The seed lot may require retest, storage review, or additional production notes.
- The workbook is surfacing uncertainty, not making a release decision.

**Release decision means:**

- A human operator / breeder explicitly approves release.
- The Commercial Release Checklist is reviewed.
- Germination data, storage data, parentage, stress testing, and notes are
  considered together.
- **No formula can release a lot by itself.**

**Explicit rules:**

- Quality Flag = `Pass` does **not** mean release approved — it is a
  candidate signal only.
- Quality Flag = `Needs Review` does **not** mean discard.
- Quality Flag = `Hold` means do not release until reviewed or retested.
- **No automatic Action Queue item** is ever created from a formula.
- Action Queue text in column AA is **draft / review copy only**.
- Any release, cull, or retest decision must be **operator-approved** and
  recorded separately.

---

## 10. Review vs. Release Triggers

**Review triggers** (workbook surfaces uncertainty — human should inspect):

- Viability below 85%.
- Sample size below 50.
- Final count day earlier than Day 7.
- Mold observed during germ test.
- Weak taproots noted.
- Storage temperature or RH missing.
- Parentage fields incomplete.
- Commercial Release Linked? = `No`.
- Any manual concern recorded in Production Notes.

**Hold triggers** (do not release until resolved):

- Viability below 70%.
- Sample size below 25.
- Severe mold / rot notes.
- Unknown parentage.
- Storage conditions unknown for a commercial-release candidate lot.
- Retest failed or inconclusive.

**Release-ready candidate signals** (operator may consider for release review):

- Viability ≥ 85%.
- Sample size ≥ 50, preferred 100.
- Final count Day 10–14.
- Parentage complete.
- Storage method documented.
- Commercial Release Checklist linked.
- No unresolved concerns in notes.
- Human release decision recorded separately.

> These are **candidate signals**, never automatic release. The operator
> decides.

---

## 11. Exact Formula Logic

Column letters used throughout:

- `A` Seed Lot ID
- `J` Total Seeds Collected
- `K` Cleaned / Viable Seeds
- `L` Viability % Tested
- `N` Sample Size Tested
- `O` Day 5 Germ Count
- `P` Day 7 Germ Count
- `Q` Final Germ Count
- `W` Quality Flag

### Per-row formulas (row 2 shown)

**Viability % (`L2`)**

```text
=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)
```

**Viable Seed Ratio** (helper, if added as a column)

```text
=IF(OR(J2="",J2=0,K2=""),"",K2/J2)
```

**Quality Flag (`W2`)**

```text
=IF(L2="","Missing Test",
  IF(N2<25,"Hold",
    IF(N2<50,"Needs Review",
      IF(L2<0.7,"Hold",
        IF(L2<0.85,"Needs Review","Pass")))))
```

### Edge cases

- Blank `Sample Size Tested` → blank Viability %.
- Zero `Sample Size Tested` → blank Viability % (no division by zero).
- Blank `Final Germ Count` → blank Viability %.
- `Sample Size < 25` → forces `Hold` even if viability looks strong.
- `Sample Size 25–49` → forces `Needs Review`.
- `Viability < 70%` → forces `Hold`.
- `Viability 70%–84.99%` → forces `Needs Review`.
- `Viability ≥ 85%` → may show `Pass`, but **still requires human release
  approval**.

### Summary formulas

Place on a `Summary` sheet or at the top of `Seed_Production_Tracking`:

```text
Total Seed Lots:               =COUNTA(A2:A)
Average Viability:             =IFERROR(AVERAGE(FILTER(L2:L,L2:L<>"")),"")
Lots Passing >=85%:            =COUNTIF(W2:W,"Pass")
Lots Needing Review:           =COUNTIF(W2:W,"Needs Review")
Lots On Hold:                  =COUNTIF(W2:W,"Hold")
Lots Missing Germination Test: =COUNTIF(W2:W,"Missing Test")
Lots With Small Sample Size:   =COUNTIF(N2:N,"<50")
```

### Formatting notes

- Format `L` (Viability %) and any Viable Seed Ratio column as **percentage**.
- Formulas store fractions (0–1). Do **not** multiply by 100 inside the
  formula unless the sheet stores whole-number percentages — pick one
  convention and apply it consistently.

---

## 12. Seed_Production_Tracking Data Dictionary

| Col | Field                           | Required?                                | Allowed values / format                                                                              | Validation                                                  | Notes                                                  |
| --- | ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| A   | Seed Lot ID                     | Required                                 | Text                                                                                                 | Unique                                                      | Example: `SD-P1-BC1-F2-2026-Lot01`                     |
| B   | Project / Line                  | Required                                 | Text                                                                                                 | Non-empty                                                   | Breeding project / line name                           |
| C   | Generation                      | Required                                 | `F1`, `F2`, `F3`, `S1`, `S2`, `BC1`, `BC2`, `BC3`, `Open Pollination`, `Unknown`                     | Enum                                                        |                                                        |
| D   | Female Parent                   | Required for intentional crosses         | Text / Pheno ID                                                                                      | Non-empty for non-open-pollination rows                     |                                                        |
| E   | Male Parent                     | Required unless selfed / fem / open pol. | Text / Male ID / Pollen source                                                                       | Non-empty unless `Generation` ∈ {`S1`,`S2`,`Open Pollination`} |                                                        |
| F   | Pollination Date                | Optional but recommended                 | Date `YYYY-MM-DD`                                                                                    | Valid date                                                  |                                                        |
| G   | Isolation Method                | Recommended                              | `whole_tent`, `branch_bag`, `isolated_room`, `manual_paint`, `open_pollination`, `unknown`           | Enum                                                        |                                                        |
| H   | Seed Harvest Date               | Optional but recommended                 | Date `YYYY-MM-DD`                                                                                    | ≥ Pollination Date                                          |                                                        |
| I   | Dry / Cure Start Date           | Optional                                 | Date `YYYY-MM-DD`                                                                                    | ≥ Seed Harvest Date                                         |                                                        |
| J   | Total Seeds Collected           | Optional                                 | Non-negative integer                                                                                 | ≥ 0                                                         |                                                        |
| K   | Cleaned / Viable Seeds          | Optional                                 | Non-negative integer                                                                                 | ≤ J when J present                                          |                                                        |
| L   | Viability % Tested              | Formula                                  | 0–1 percentage                                                                                       | Formula only                                                | See §11                                                |
| M   | Germination Test Date           | Optional                                 | Date `YYYY-MM-DD`                                                                                    | ≥ Dry / Cure Start Date                                     |                                                        |
| N   | Sample Size Tested              | Optional                                 | Non-negative integer                                                                                 | Review if `<50`; Hold if `<25` for commercial candidate     |                                                        |
| O   | Day 5 Germ Count                | Optional                                 | Non-negative integer                                                                                 | ≤ N                                                         |                                                        |
| P   | Day 7 Germ Count                | Optional                                 | Non-negative integer                                                                                 | ≤ N                                                         |                                                        |
| Q   | Final Germ Count                | Optional                                 | Non-negative integer                                                                                 | ≤ N                                                         |                                                        |
| R   | Final Count Day                 | Optional                                 | Integer                                                                                              | 7–14 preferred                                              |                                                        |
| S   | Storage Method                  | Recommended                              | `fridge`, `freezer`, `room_temp`, `cool_dark`, `unknown`, `other`                                    | Enum                                                        |                                                        |
| T   | Storage Temp                    | Optional                                 | Text or numeric with unit                                                                            | Include `°C` or `°F`                                        |                                                        |
| U   | Storage RH / Desiccant          | Optional                                 | Text                                                                                                 |                                                              | e.g. `35% RH, silica`                                  |
| V   | Production Notes                | Optional                                 | Text                                                                                                 |                                                              | Free-form observations                                 |
| W   | Quality Flag                    | Formula                                  | Output: `Pass`, `Needs Review`, `Hold`, `Missing Test`                                               | Formula only                                                | See §11                                                |
| X   | Commercial Release Linked?      | Recommended                              | `Yes`, `No`                                                                                          | Enum                                                        |                                                        |
| Y   | Linked Commercial Checklist Row | Optional                                 | Text / reference                                                                                     |                                                              | Reference into Commercial Release Checklist            |
| Z   | Verdant Diary Entry             | Optional                                 | Link / reference                                                                                     |                                                              | Diary entry ID(s)                                      |
| AA  | Verdant Action Queue Item       | Optional                                 | Draft text only                                                                                      | Grower-review-only — never auto-created                     | Candidate next step for grower review                  |

---

## 13. Example Seed Lots

Formulas in columns `L` and `W` are shown as formulas, not computed values.

### Example 1 — Release-ready candidate (Quality Flag = `Pass`)

| Col | Value                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A   | `SD-P1-BC1-F2-2026-Lot01`                                                                                                          |
| B   | `Project Aurora`                                                                                                                   |
| C   | `BC1`                                                                                                                              |
| D   | `Aurora-F2-Pheno-07`                                                                                                               |
| E   | `Aurora-Male-03`                                                                                                                   |
| F   | `2026-02-12`                                                                                                                       |
| G   | `branch_bag`                                                                                                                       |
| H   | `2026-04-10`                                                                                                                       |
| I   | `2026-04-12`                                                                                                                       |
| J   | `420`                                                                                                                              |
| K   | `380`                                                                                                                              |
| L   | `=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)` → `0.91`                                                                                      |
| M   | `2026-05-05`                                                                                                                       |
| N   | `100`                                                                                                                              |
| O   | `78`                                                                                                                               |
| P   | `89`                                                                                                                               |
| Q   | `91`                                                                                                                               |
| R   | `10`                                                                                                                               |
| S   | `fridge`                                                                                                                           |
| T   | `4 °C`                                                                                                                             |
| U   | `35% RH, silica`                                                                                                                   |
| V   | `Even germination, healthy taproots.`                                                                                              |
| W   | `=IF(L2="","Missing Test",IF(N2<25,"Hold",IF(N2<50,"Needs Review",IF(L2<0.7,"Hold",IF(L2<0.85,"Needs Review","Pass")))))` → `Pass` |
| X   | `Yes`                                                                                                                              |
| Y   | `CRC-2026-Aurora-Lot01`                                                                                                            |
| Z   | `diary://aurora/lot01/germ-test`                                                                                                   |
| AA  | `Review Lot01 for commercial release package`                                                                                      |

**Why this is only a candidate signal:** `Pass` reflects strong germination
on an adequate sample with documented parentage and storage. It is **not**
release approval — the operator must still review the Commercial Release
Checklist and record the release decision separately.

### Example 2 — Needs Review / Hold lot

| Col | Value                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A   | `SD-P1-BC1-F2-2026-Lot02`                                                                                                          |
| B   | `Project Aurora`                                                                                                                   |
| C   | `BC1`                                                                                                                              |
| D   | `Aurora-F2-Pheno-12`                                                                                                               |
| E   | `Aurora-Male-03`                                                                                                                   |
| F   | `2026-02-14`                                                                                                                       |
| G   | `branch_bag`                                                                                                                       |
| H   | `2026-04-11`                                                                                                                       |
| I   | `2026-04-13`                                                                                                                       |
| J   | `160`                                                                                                                              |
| K   | `120`                                                                                                                              |
| L   | `=IF(OR(N3="",N3=0,Q3=""),"",Q3/N3)` → `0.65`                                                                                      |
| M   | `2026-05-06`                                                                                                                       |
| N   | `40`                                                                                                                               |
| O   | `18`                                                                                                                               |
| P   | `24`                                                                                                                               |
| Q   | `26`                                                                                                                               |
| R   | `10`                                                                                                                               |
| S   | `room_temp`                                                                                                                        |
| T   | `~22 °C`                                                                                                                           |
| U   | `unknown`                                                                                                                          |
| V   | `Weak taproots on several seedlings; minor mold on day 4 — discarded affected.`                                                    |
| W   | `=IF(L3="","Missing Test",IF(N3<25,"Hold",IF(N3<50,"Needs Review",IF(L3<0.7,"Hold",IF(L3<0.85,"Needs Review","Pass")))))` → `Hold` |
| X   | `No`                                                                                                                               |
| Y   |                                                                                                                                    |
| Z   | `diary://aurora/lot02/germ-test`                                                                                                   |
| AA  | `Retest Lot02 with fresh 100-seed sample before release review`                                                                    |

**Why this is not release-ready:** Viability is below the 70% Hold
threshold, sample size is under 50, storage RH is undocumented, and notes
record weak taproots and early mold. The workbook surfaces `Hold` so the
operator can retest with a fresh 100-seed sample and review storage before
any release conversation.

---

## 14. Safety Wording

**Avoid** in this workbook and any copy derived from it:

- "auto-release"
- "AI approved"
- "guaranteed viability"
- "commercial ready" (without explicit review)
- "automatic Action Queue"
- "device control"
- "automation"

**Prefer:**

- "candidate signal"
- "needs review"
- "hold for retest"
- "grower-review-only"
- "operator-approved release"
- "recorded as seed-lot memory"

---

## 15. Additional Worked Seed-Lot Examples

### Example 3 — Full release candidate signal (Quality Flag = `Pass`)

A high-quality, fully-documented lot. Demonstrates the strongest candidate
signal the workbook can surface.

| Col | Value                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A   | `SD-P2-F1-2026-Lot03`                                                                                                              |
| B   | `Project Nimbus`                                                                                                                   |
| C   | `F1`                                                                                                                               |
| D   | `Nimbus-Mom-A`                                                                                                                     |
| E   | `Nimbus-Stud-B`                                                                                                                    |
| F   | `2026-03-01`                                                                                                                       |
| G   | `isolated_room`                                                                                                                    |
| H   | `2026-04-28`                                                                                                                       |
| I   | `2026-04-30`                                                                                                                       |
| J   | `1200`                                                                                                                             |
| K   | `1080`                                                                                                                             |
| L   | `=IF(OR(N4="",N4=0,Q4=""),"",Q4/N4)` → `0.94`                                                                                      |
| M   | `2026-05-20`                                                                                                                       |
| N   | `100`                                                                                                                              |
| O   | `82`                                                                                                                               |
| P   | `91`                                                                                                                               |
| Q   | `94`                                                                                                                               |
| R   | `14`                                                                                                                               |
| S   | `freezer`                                                                                                                          |
| T   | `-18 °C`                                                                                                                           |
| U   | `25% RH, silica`                                                                                                                   |
| V   | `Uniform germination, vigorous taproots, no mold.`                                                                                 |
| W   | `=IF(L4="","Missing Test",IF(N4<25,"Hold",IF(N4<50,"Needs Review",IF(L4<0.7,"Hold",IF(L4<0.85,"Needs Review","Pass")))))` → `Pass` |
| X   | `Yes`                                                                                                                              |
| Y   | `CRC-2026-Nimbus-Lot03`                                                                                                            |
| Z   | `diary://nimbus/lot03/germ-test`                                                                                                   |
| AA  | `Forward Lot03 to Commercial Release Review`                                                                                       |

**Derived values:**

- Viability % (`L`) → `0.94` (94%).
- Viable Seed Ratio (`K/J`) → `0.90` (90%).
- Quality Flag (`W`) → `Pass`.
- Summary impact: increments `Lots Passing >=85%` and `Total Seed Lots`;
  contributes to `Average Viability`.

**Release Status (if shown in the Commercial Release Review sheet):**
`Candidate only / Human review required`.

> `Pass` means **candidate signal only**. A human release decision is still
> required. The Commercial Release Review + Traceability workbook is where
> that decision is recorded.

### Example 4 — Data-incomplete hold (Quality Flag = `Missing Test` / `Hold`)

A lot that cannot be evaluated for release because evidence is missing.

| Col | Value                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `SD-P3-Unknown-2026-Lot04`                                                                                                                  |
| B   | `Project Cirrus`                                                                                                                            |
| C   | `Unknown`                                                                                                                                   |
| D   | `Cirrus-Mom-?`                                                                                                                              |
| E   | `(open pollination, unconfirmed)`                                                                                                           |
| F   |                                                                                                                                             |
| G   | `open_pollination`                                                                                                                          |
| H   | `2026-05-02`                                                                                                                                |
| I   |                                                                                                                                             |
| J   | `300`                                                                                                                                       |
| K   | `210`                                                                                                                                       |
| L   | `=IF(OR(N5="",N5=0,Q5=""),"",Q5/N5)` → `""` (blank — sample size and final count missing)                                                   |
| M   |                                                                                                                                             |
| N   |                                                                                                                                             |
| O   |                                                                                                                                             |
| P   |                                                                                                                                             |
| Q   |                                                                                                                                             |
| R   |                                                                                                                                             |
| S   | `unknown`                                                                                                                                   |
| T   |                                                                                                                                             |
| U   |                                                                                                                                             |
| V   | `Parentage uncertain; storage container not labeled; no germination test performed yet.`                                                    |
| W   | `=IF(L5="","Missing Test",IF(N5<25,"Hold",IF(N5<50,"Needs Review",IF(L5<0.7,"Hold",IF(L5<0.85,"Needs Review","Pass")))))` → `Missing Test`  |
| X   | `No`                                                                                                                                        |
| Y   |                                                                                                                                             |
| Z   | `diary://cirrus/lot04/intake`                                                                                                               |
| AA  | `Complete germination test and parentage/storage review before release consideration`                                                       |

**Derived values:**

- Viability % (`L`) → blank (no sample size, no final germ count).
- Viable Seed Ratio (`K/J`) → `0.70` (70%) — cleaning ratio looks acceptable
  but says nothing about germination viability on its own.
- Quality Flag (`W`) → `Missing Test`. If `N` is later filled in below 25,
  the flag becomes `Hold`.
- Summary impact: increments `Lots Missing Germination Test`; will not count
  toward `Average Viability` until tested.

> `Hold` / `Missing Test` means **not release-ready until missing evidence
> is resolved**. The workbook is asking for more data, not rejecting the
> lot.

---

## 16. Column Rules: Allowed Values, Units, Null Rules, Formula Inputs/Outputs

Per-column rules for `Seed_Production_Tracking` (A–AA). This expands §12
with explicit formula-role detail.

| Col | Field                           | Allowed values                                                                                       | Units              | Null allowed?                          | Validation                                                                 | Formula role                                | Notes                                  |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| A   | Seed Lot ID                     | Text                                                                                                 | —                  | No                                     | Unique                                                                     | None                                        | Example `SD-P1-BC1-F2-2026-Lot01`      |
| B   | Project / Line                  | Text                                                                                                 | —                  | No                                     | Non-empty                                                                  | None                                        |                                        |
| C   | Generation                      | `F1`, `F2`, `F3`, `S1`, `S2`, `BC1`, `BC2`, `BC3`, `Open Pollination`, `Unknown`                     | —                  | No                                     | Enum                                                                       | None                                        |                                        |
| D   | Female Parent                   | Text / Pheno ID                                                                                      | —                  | Yes for unknown / open-pollination     | Required for intentional crosses                                           | None                                        |                                        |
| E   | Male Parent                     | Text / Male ID / pollen source                                                                       | —                  | Yes for selfed / fem / open pol.       | Required unless `Generation` ∈ {`S1`,`S2`,`Open Pollination`}              | None                                        |                                        |
| F   | Pollination Date                | Date `YYYY-MM-DD`                                                                                    | date               | Yes for unknown / open-pollination     | Must be ≤ Seed Harvest Date when both present                              | None                                        |                                        |
| G   | Isolation Method                | `whole_tent`, `branch_bag`, `isolated_room`, `manual_paint`, `open_pollination`, `unknown`           | —                  | No                                     | Enum                                                                       | None                                        |                                        |
| H   | Seed Harvest Date               | Date `YYYY-MM-DD`                                                                                    | date               | Yes                                    | Must be ≥ Pollination Date when both present                               | None                                        |                                        |
| I   | Dry / Cure Start Date           | Date `YYYY-MM-DD`                                                                                    | date               | Yes                                    | Should be ≥ Seed Harvest Date when both present                            | None                                        |                                        |
| J   | Total Seeds Collected           | Non-negative integer                                                                                 | seeds              | Yes                                    | ≥ 0                                                                        | Input → Viable Seed Ratio                   |                                        |
| K   | Cleaned / Viable Seeds          | Non-negative integer                                                                                 | seeds              | Yes                                    | ≤ J when J present                                                         | Input → Viable Seed Ratio                   |                                        |
| L   | Viability % Tested              | Formula output                                                                                       | percentage (0–1)   | Blank when inputs missing              | Formula only                                                               | Output: `=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)` | Format as %                            |
| M   | Germination Test Date           | Date `YYYY-MM-DD`                                                                                    | date               | Yes                                    | Required when `N` or `Q` are present                                       | None                                        |                                        |
| N   | Sample Size Tested              | Non-negative integer                                                                                 | seeds              | Yes                                    | Review if `<50`; Hold if `<25` for commercial candidate                    | Input → Viability %, Quality Flag           |                                        |
| O   | Day 5 Germ Count                | Non-negative integer                                                                                 | seeds              | Yes                                    | ≤ N                                                                        | Input (progress)                            |                                        |
| P   | Day 7 Germ Count                | Non-negative integer                                                                                 | seeds              | Yes                                    | ≤ N; should be ≥ O when both present                                       | Input (progress)                            |                                        |
| Q   | Final Germ Count                | Non-negative integer                                                                                 | seeds              | Yes                                    | ≤ N; should be ≥ P when both present                                       | Input → Viability %                         |                                        |
| R   | Final Count Day                 | Integer                                                                                              | days               | Yes                                    | Preferred 10–14; Review if `<7`; Hold if final count missing               | None                                        |                                        |
| S   | Storage Method                  | `fridge`, `freezer`, `room_temp`, `cool_dark`, `unknown`, `other`                                    | —                  | No                                     | Enum                                                                       | None                                        |                                        |
| T   | Storage Temp                    | Numeric with unit, or text                                                                           | °C or °F           | Yes (but required for release review)  | Include unit                                                               | None                                        |                                        |
| U   | Storage RH / Desiccant          | Text                                                                                                 | % RH + desiccant   | Yes (but required for release review)  | Free text                                                                  | None                                        |                                        |
| V   | Production Notes                | Text                                                                                                 | —                  | Yes                                    | Manual concerns should trigger review                                      | None                                        |                                        |
| W   | Quality Flag                    | Formula output: `Pass`, `Needs Review`, `Hold`, `Missing Test`                                       | —                  | No (formula always returns a value)    | Formula only                                                               | Output (see §11)                            |                                        |
| X   | Commercial Release Linked?      | `Yes`, `No`                                                                                          | —                  | No                                     | `No` should trigger review before any release decision                     | None                                        |                                        |
| Y   | Linked Commercial Checklist Row | Text / reference                                                                                     | —                  | Yes (but required for release review)  | Reference into Commercial Release Checklist                                | None                                        |                                        |
| Z   | Verdant Diary Entry             | Link / reference                                                                                     | —                  | Yes                                    | Recommended                                                                | None                                        |                                        |
| AA  | Verdant Action Queue Item       | Draft text only                                                                                      | —                  | Yes                                    | Grower-review-only; must not imply automatic creation                      | None                                        |                                        |

---

## 17. Formula Edge Cases and Retest Cycles

### Edge cases (extended)

| Situation                                       | Formula behavior                                                  | Operator action                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Missing sample size (`N` blank)                 | `L` blank; `W` = `Missing Test`                                   | Run germination test.                                             |
| Sample size = 0                                 | `L` blank (no division by zero); `W` = `Missing Test`             | Restart germ test with a real sample.                             |
| Missing final germ count (`Q` blank)            | `L` blank; `W` = `Missing Test`                                   | Finish counting through Final Count Day.                          |
| Final germ count `Q > N`                        | `L > 1.0` — invalid                                               | Correct the count or sample-size entry.                           |
| Day 7 count `P > Q`                             | Not flagged by formula                                            | Treat as data-entry error; reconcile or note.                     |
| Cleaned seeds `K > J`                           | Viable Seed Ratio `> 1.0` — invalid                               | Correct the entry.                                                |
| Seed Harvest Date before Pollination Date       | Not flagged by formula                                            | Correct the date or note ambiguity.                               |
| Dry/Cure Start Date before Seed Harvest Date    | Not flagged by formula                                            | Correct the date.                                                 |
| Final Count Day before Day 7                    | Not flagged by formula                                            | Treat as Review trigger; investigate why counting stopped early.  |
| Sample size 25–49 with high viability           | `W` = `Needs Review` (sample size wins)                           | Consider retest with larger sample before release review.         |
| Viability ≥ 85% with `N` < 25                   | `W` = `Hold`                                                      | Retest with `N ≥ 50` (preferred 100).                             |

### Retest cycles

Recording multiple germination tests:

- **Default:** column `L` is the **current official viability**.
- Retest details live in **Production Notes** (`V`) or in optional future
  fields (see below).
- When a retest is performed, the operator decides whether to replace `L`
  with the retest viability or keep the first test as official.
- **The formula must not automatically hide a bad first test.** Replacement
  is a manual, recorded decision.
- When the first test and retest disagree, record both and the chosen
  Official Viability Source in notes.

### Optional future expansion fields (not part of A–AA v1)

These fields may be added later if retest tracking becomes common. They are
optional and do not change the v1 sheet contract:

| Field                       | Allowed values                                  | Notes                                                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Retest Required?            | `Yes`, `No`                                     | Operator-set, not formula-set.                         |
| Retest Date                 | Date `YYYY-MM-DD`                               |                                                        |
| Retest Sample Size          | Non-negative integer                            | Preferred ≥ 100.                                       |
| Retest Final Germ Count     | Non-negative integer                            | ≤ Retest Sample Size.                                  |
| Retest Viability %          | Formula output                                  | `= Retest Final Germ Count / Retest Sample Size`.      |
| Official Viability Source   | `First Test`, `Retest`, `Manual Review`         | Operator decision recorded explicitly.                 |

If/when adopted, mark them as **optional future expansion** and keep `L` /
`W` as the canonical fields the rest of the workbook reads.

---

## Change log

- **v1.2 (this doc):** Added Examples 3–4, full per-column rules (allowed
  values / units / null rules / formula roles), extended formula edge cases,
  retest-cycle guidance, and optional future expansion fields. Pointed
  release decisions at the new Commercial Release Review + Traceability
  workbook spec.
- **v1.1:** Added Safety & Review Checklist, review/hold/release triggers,
  exact formula logic with edge cases, data dictionary, two example seed
  lots, and safety wording guidance.
- **v1.0:** Initial Seed_Production_Tracking workbook spec.
