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

## Change log

- **v1.0 (this doc):** Initial Seed_Production_Tracking workbook spec.
