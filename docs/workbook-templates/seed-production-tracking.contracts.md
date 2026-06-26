# Seed_Production_Tracking — Column Contracts

> Companion to [`seed-production-tracking.csv`](./seed-production-tracking.csv).
> Matches v1.3 of
> [`docs/seed-production-tracking-workbook-spec.md`](../seed-production-tracking-workbook-spec.md).
> Docs-only artifact.

**Sheet name:** `Seed_Production_Tracking`

## Columns

| Col | Field | Required? | Allowed values / format | Validation |
| --- | ----- | --------- | ----------------------- | ---------- |
| A | Seed Lot ID | Required | Text | Unique |
| B | Project / Line | Required | Text | Non-empty |
| C | Generation | Required | `F1`, `F2`, `F3`, `S1`, `S2`, `BC1`, `BC2`, `BC3`, `Open Pollination`, `Unknown` | Enum |
| D | Female Parent | Required (intentional crosses) | Text / Pheno ID | Non-empty for non-open-pollination rows |
| E | Male Parent | Required unless selfed / fem / open pol. | Text / Male ID / Pollen source | Non-empty unless Generation ∈ {`S1`,`S2`,`Open Pollination`} |
| F | Pollination Date | Recommended | Date `YYYY-MM-DD` | Valid date |
| G | Isolation Method | Recommended | `whole_tent`, `branch_bag`, `isolated_room`, `manual_paint`, `open_pollination`, `unknown` | Enum |
| H | Seed Harvest Date | Recommended | Date `YYYY-MM-DD` | ≥ F |
| I | Dry / Cure Start Date | Optional | Date `YYYY-MM-DD` | ≥ H |
| J | Total Seeds Collected | Optional | Non-negative integer | ≥ 0 |
| K | Cleaned / Viable Seeds | Optional | Non-negative integer | ≤ J when J present |
| L | Viability % Tested | **Formula** | 0–1 percentage (format as %) | Formula only — see §Formulas |
| M | Germination Test Date | Optional | Date `YYYY-MM-DD` | ≥ I |
| N | Sample Size Tested | Optional | Non-negative integer | Review if `<50`; Hold if `<25` for commercial candidate |
| O | Day 5 Germ Count | Optional | Non-negative integer | ≤ N |
| P | Day 7 Germ Count | Optional | Non-negative integer | ≤ N |
| Q | Final Germ Count | Optional | Non-negative integer | ≤ N |
| R | Final Count Day | Optional | Integer | 7–14 preferred |
| S | Storage Method | Recommended | `fridge`, `freezer`, `room_temp`, `cool_dark`, `unknown`, `other` | Enum |
| T | Storage Temp | Optional | Text or numeric with unit | Include `°C` or `°F` |
| U | Storage RH / Desiccant | Optional | Text | e.g. `35% RH, silica` |
| V | Production Notes | Optional | Text | — |
| W | Quality Flag | **Formula** | Output: `Pass`, `Needs Review`, `Hold`, `Missing Test` | Formula only — see §Formulas |
| X | Commercial Release Linked? | Recommended | `Yes`, `No` | Enum |
| Y | Linked Commercial Checklist Row | Optional | Text / reference | Reference into Commercial Release Checklist |
| Z | Verdant Diary Entry | Optional | Link / reference | Diary entry ID(s) |
| AA | Verdant Action Queue Item | Optional | **Draft text only** | Grower-review-only — never auto-created |

## Formulas

Apply these to every data row, substituting the row number for `2`:

**Viability % (`L2`)**

```text
=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)
```

**Quality Flag (`W2`)**

```text
=IF(L2="","Missing Test",
  IF(N2<25,"Hold",
    IF(N2<50,"Needs Review",
      IF(L2<0.7,"Hold",
        IF(L2<0.85,"Needs Review","Pass")))))
```

**Summary block** (place on a `Summary` tab or row 1):

```text
Total Seed Lots:               =COUNTA(A2:A)
Average Viability:             =IFERROR(AVERAGE(FILTER(L2:L,L2:L<>"")),"")
Lots Passing >=85%:            =COUNTIF(W2:W,"Pass")
Lots Needing Review:           =COUNTIF(W2:W,"Needs Review")
Lots On Hold:                  =COUNTIF(W2:W,"Hold")
Lots Missing Germination Test: =COUNTIF(W2:W,"Missing Test")
Lots With Small Sample Size:   =COUNTIF(N2:N,"<50")
```

## Safety contract

- `Quality Flag = Pass` is a **candidate signal**, never release approval.
- `Quality Flag = Hold` / `Needs Review` triggers human inspection, not
  automatic rejection.
- Column `AA` is draft text only — no Action Queue write is ever
  triggered from this sheet.
- Forbidden wording: `auto-release`, `AI approved`, `guaranteed
  viability`, `commercial ready` (without explicit review), `automatic
  Action Queue`, `automation`, `device control`.
