# Advanced Phenotype Hunter Workbook v1.1 — Breeding Expansion

> **Docs-only spec.** Not approved for V0 app implementation. Operator-facing
> breeding planning material. No code, schema, RLS, RPC, Edge Function, UI, AI
> call, alert, Action Queue automation, or device control is introduced by this
> document.

Source of truth: **Verdant Advanced Phenotype Hunter Workbook v1.0**. All
principles below inherit from v1.0 — diary primacy, sensor truth, cautious AI,
grower-approved actions only, female lifecycle scoring, male evaluation, F1
population tracking, stress testing, line development, and TPS / chemotype
stability logging.

---

## 1. Status

- **Workbook / spec only.** This is a planning document for serious hobby
  breeders running phenotype hunts in spreadsheets alongside Verdant.
- **Not approved for V0 app implementation.** V0 is locked to the One-Tent
  Loop (Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI
  Doctor → Alert → Approval-Required Action Queue).
- **Intended audience:** operators running male evaluation, F1 populations,
  backcross programs, and line-development cycles outside the app.

---

## 2. Why docs-only

Breeding analytics is a high-context, high-stakes decision surface. It depends
on consistent diary, photo, sensor, harvest, cure, and pheno data that V0 is
still stabilizing.

- Male selection, backcross scoring, and line-development recommendations
  cannot be made safely from weak or partial data.
- V0 must finish the One-Tent Loop, harvest/cure persistence, and sensor truth
  before any genetics automation is acceptable.
- Treating early breeding scores as authoritative would violate Verdant's
  cautious-AI and grower-approved-action principles.

Until those foundations are stable, this workbook lives as an offline
spreadsheet / printable reference, not an app feature.

---

## 3. New workbook sheets

Four new sheets extend v1.0:

1. **Pheno_Comparison_v2_Enhanced** — adds backcross columns to the v1.0
   female-lifecycle comparison sheet.
2. **Male_Evaluation_Tracker** — structured male scoring across veg, pre-flower,
   pollen, and environmental robustness.
3. **F1_Population_Tracker** — population-level statistics for F1 progeny and
   backcross planning.
4. **Backcross_Line_Development** — long-running line tracking with stability,
   stress, and inbreeding-depression notes.

All sheets are workbook constructs only. No Verdant table, view, or migration
is created.

---

## 4. Pheno_Comparison_v2_Enhanced — backcross columns

Added to the existing v1.0 pheno comparison sheet:

| Column                  | Meaning                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| Backcross Generation    | BC1 / BC2 / BC3 (or blank for non-BC rows).                            |
| Recurrent Parent        | The parent the line is being recovered toward.                         |
| Estimated Recurrent %   | Operator-estimated recurrent-parent contribution (50 / 75 / 87.5 / …). |
| Backcross Trait Focus   | Which trait(s) the BC is intended to fix or recover.                   |
| BC Selection Score      | Operator score combining trait match + vigor + stability.              |
| BC Stability Index      | Qualitative index for phenotype consistency within the BC cohort.      |

All values are operator-entered. No automatic scoring.

---

## 5. Male_Evaluation_Tracker

| Column                                  | Notes                                              |
| --------------------------------------- | -------------------------------------------------- |
| Male ID                                 | Workbook ID; should map 1:1 to a Verdant Plant ID. |
| Strain / Lineage                        | Free text.                                         |
| Veg Start Date                          | Date.                                              |
| Pre-Flower Sex Date                     | Date sex was confirmed.                            |
| Vegetative Vigor & Structure            | 1–10 operator rubric.                              |
| Early Terp Projection                   | Stem-rub / leaf-rub aroma rubric.                  |
| Pollen Sac Density & Timing             | Density + days-to-pack rubric.                     |
| Pollen Viability Test 1                 | Germination % or operator-confirmed viability.     |
| Pollen Viability Test 2                 | Repeat test (independent sample).                  |
| Glandular Expression on Male Flowers    | Trichome / resin notes.                            |
| Environmental Robustness                | Stress tolerance rubric (heat, RH, light shifts).  |
| Progeny Potential                       | Operator projection from test crosses.             |
| Overall Male Score                      | Weighted operator score.                           |
| Pass Threshold Met?                     | Yes / No.                                          |
| Promotion Decision                      | Keep / Cull / Hold.                                |
| Action Queue Item                       | See safety copy below.                             |
| Notes / Photo Refs                      | Diary + photo references.                          |

**Safety copy (must appear in the workbook header):**

> "Action Queue Item" in this workbook means **a candidate next step for
> grower review**. It is not an instruction to Verdant and does not create an
> Action Queue entry automatically. The grower decides whether to log it.

---

## 6. F1_Population_Tracker

Population-level columns:

- Backcross Planned? (Yes / No)
- Target Recurrent Parent
- Planned BC Generation (BC1 / BC2 / BC3)
- % of Top Phenos Recommended for Backcross
- Number Selected for BC1
- % Population Recommended for Backcrossing
- Primary Backcross Direction (toward mother / toward father / toward sibling line)

**Population statistics formulas (workbook-side only):**

- `% Top Phenos = (Top Phenos / Total Evaluated) * 100`
- `BC Selection Rate = (Number Selected for BC1 / Top Phenos) * 100`
- `% Population for BC = (Number Selected for BC1 / Total Evaluated) * 100`
- `Mean Trait Score = AVERAGE(trait column)`
- `Trait Stability = 1 - (STDEV(trait) / MAX_RANGE)` (operator-bounded)
- `Stress Pass Rate = (Plants Passing Stress / Plants Stress-Tested) * 100`

All formulas are spreadsheet formulas, not Verdant logic.

---

## 7. Backcross_Line_Development

| Column                              | Notes                                              |
| ----------------------------------- | -------------------------------------------------- |
| Backcross Line ID                   | Workbook ID.                                       |
| Recurrent Parent                    | Strain / plant.                                    |
| Donor / F1 Source                   | Source population.                                 |
| Backcross Generation                | BC1 / BC2 / BC3.                                   |
| Date Started                        | Date.                                              |
| # Progeny Evaluated                 | Integer.                                           |
| % Retaining Recurrent Traits        | Operator-evaluated.                                |
| % Showing Donor Trait Improvement   | Operator-evaluated.                                |
| Average BC Selection Score          | Mean of BC Selection Score column.                 |
| TPS Stability                       | Terpene / chemotype stability rubric.              |
| Stress Test Pass Rate               | % surviving documented stress protocol.            |
| Top Performing Individuals          | List of plant IDs.                                 |
| Next Recommended Action             | Operator note (continue, sib-cross, outcross, stop). |
| Inbreeding Depression Risk          | Low / Medium / High with rationale.                |
| Linked Pheno Rows                   | References to Pheno_Comparison_v2_Enhanced rows.   |
| Linked F1 Project                   | Reference to F1_Population_Tracker row.            |
| Verdant Action Queue Items          | Candidate next steps for grower review (see §5).   |

---

## 8. Rubrics

All rubrics are 1–10 unless noted. Operator-scored; no AI scoring.

**BC1 rubric — broad recovery**

- Recurrent trait recovery: visible recovery of 1+ target trait.
- Donor trait retention: at least one donor trait still expressed.
- Vigor: no obvious depression vs recurrent parent.
- Stability: variance within cohort acceptable.
- Pass threshold: ≥ 6 average, no individual sub-score < 4.

**BC2 rubric — trait fixing**

- Recurrent trait recovery: target trait expressed in ≥ 60% of cohort.
- Donor trait retention: target donor trait present in ≥ 40% of cohort.
- Uniformity: visible reduction in phenotype variance vs BC1.
- Vigor: monitored for early inbreeding depression.
- Pass threshold: ≥ 7 average, uniformity sub-score ≥ 6.

**BC3 rubric — line lock**

- Recurrent trait recovery: ≥ 80% of cohort.
- Donor trait retention: stable, predictable expression.
- Uniformity: cohort visibly uniform.
- Vigor / depression: documented; outcross plan if depression appears.
- Pass threshold: ≥ 8 average, depression risk explicitly assessed.

---

## 9. Verdant integration rules

When the operator chooses to mirror workbook entries into Verdant:

- Every scored plant should map to a **Verdant Plant ID**.
- Important observations should be logged as **diary entries** via Quick Log.
- Photos should be **tagged by plant and stage** in Verdant.
- Sensor context should be labeled with **source and freshness** (live /
  manual / csv / demo / stale / invalid) — never re-labeled as live.
- Action Queue items must be **grower-approved**. The workbook never creates
  Verdant Action Queue entries directly.
- **No automatic breeding recommendations** flow from this workbook into
  Verdant.

---

## 10. Future app implementation gates

Before any of this becomes an app feature, all of the following must be true:

1. Plant IDs and diary entries are reliable across the One-Tent Loop.
2. Harvest and cure logs are persisted and queryable.
3. Sensor truth is stable: source, captured_at, confidence, raw_payload are
   preserved end-to-end.
4. Pheno-hunt persistence is implemented (female lifecycle scoring at minimum).
5. Lineage / pedigree data model is designed and reviewed.
6. RLS is reviewed for breeding tables (SELECT own rows; writes via RPC /
   service_role only).
7. AI remains cautious and evidence-bound — no scoring from weak evidence, no
   automatic keeper / cull / cross recommendations.

Until each gate is met, breeding analytics stays in the workbook.

---

## 11. Explicit non-goals

This document does **not**:

- Introduce a genetics database.
- Introduce a breeding recommendation engine.
- Introduce automatic keeper selection.
- Introduce automatic cull recommendations.
- Introduce automatic Action Queue creation.
- Introduce AI scoring from weak evidence.
- Introduce any schema migration, RLS change, RPC, Edge Function, or UI.

---

## Change log

- **v1.1 (this doc):** Added male evaluation, F1 population tracking,
  backcross planning, and line-development sheets as docs-only spec.
- **v1.0:** Female lifecycle scoring, diary/sensor primacy, cautious AI,
  grower-approved actions.
