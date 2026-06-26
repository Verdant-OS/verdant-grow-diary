# Commercial_Release_Review_Traceability — Column Contracts

> Companion to [`commercial-release-review-traceability.csv`](./commercial-release-review-traceability.csv).
> Matches v1.3 of
> [`docs/commercial-release-review-traceability-workbook-spec.md`](../commercial-release-review-traceability-workbook-spec.md).
> Docs-only artifact.

**Sheet name:** `Commercial_Release_Review_Traceability`

## Columns (recommended order)

| Col | Field | Required? | Allowed values / format | Notes |
| --- | ----- | --------- | ----------------------- | ----- |
| A | Release Review ID | Required | Text, unique | Example `CRR-2026-Nimbus-Lot03-r1` |
| B | Candidate Line / Product Name | Required | Text | Human-facing line name |
| C | Seed Lot ID | Required | Text → `Seed_Production_Tracking.A` | Must resolve in seed production sheet |
| D | Project / Line | Required | Text | — |
| E | Generation | Required | `F1` / `F2` / `BC1` / etc. | Enum (matches Seed Production §C) |
| F | Female Parent | Required (intentional crosses) | Plant / Pheno ID | — |
| G | Male Parent | Required unless selfed / fem / open pol. | Plant / Male ID / Pollen source | — |
| H | Linked Seed Production Row | Required | Reference into `Seed_Production_Tracking` | Stable row ID preferred |
| I | Linked Commercial Release Checklist Row | Required for human approval | Reference into `Commercial_Release_Checklist` | Use stable Row ID / Checklist ID |
| J | Linked Pheno Comparison Row(s) | Recommended | One or more refs into `Pheno_Comparison_v2_Enhanced` | Required for Release Candidate unless waived in `Notes` |
| K | Linked F1 / Backcross / Stabilization Row(s) | Conditional | One or more refs into `F1_Population_Tracker`, `Backcross_Line_Development`, or `F2_Stabilization_Tracker` | Required when line originated from one of those workflows |
| L | Germination Viability % | Linked formula | `=Seed_Production_Tracking!L<row>` | Read-only mirror |
| M | Germination Sample Size | Linked formula | `=Seed_Production_Tracking!N<row>` | Read-only mirror |
| N | Germination Test Date | Linked formula | `=Seed_Production_Tracking!M<row>` | Read-only mirror |
| O | Storage Method | Linked / enum | `fridge`, `freezer`, `room_temp`, `cool_dark`, `unknown`, `other` | Mirrors `Seed_Production_Tracking.S` when linked |
| P | Storage Conditions Documented? | Required | `Yes`, `No` | Enum |
| Q | Parentage Complete? | Required | `Yes`, `No`, `Partial` | Enum |
| R | Multi-Environment Testing Complete? | Required | `Yes`, `No`, `Waived` | Enum |
| S | Stress Testing Complete? | Required | `Yes`, `No`, `Waived` | Enum |
| T | Herm / Stability Concern? | Required | `None`, `Minor`, `Major` | Enum |
| U | Terp / Chemotype Stability Evidence | Recommended | Text + references | — |
| V | Dry / Cure Performance Evidence | Recommended | Text + references | — |
| W | Yield / Production Evidence | Recommended | Text + references | — |
| X | Pest / Disease Resistance Evidence | Recommended | Text + references | — |
| Y | Hash / Extraction Evidence | Optional | Text + references | — |
| Z | Test Grow Feedback | Optional | Text + references | — |
| AA | Unresolved Concerns | Required (may be blank) | Text | Any non-empty value blocks `Release Candidate` |
| AB | Review Status | **Formula-assisted** | `Draft`, `Needs Review`, `Hold`, `Release Candidate`, `Released`, `Rejected`, `Retest Required` | Formula may not set `Released` |
| AC | Human Release Decision | **Manual only** | `Not Reviewed`, `Approved`, `Rejected`, `Hold for Retest`, `Hold for More Data` | No formula may set this |
| AD | Reviewer | Required for any non-`Not Reviewed` decision | Text | Operator name / ID |
| AE | Review Date | Required for any non-`Not Reviewed` decision | Date `YYYY-MM-DD` | — |
| AF | Verdant Diary Evidence | Recommended | Link / reference | — |
| AG | Verdant Action Queue Draft | Optional | **Draft text only** | Grower-review-only — never auto-created |
| AH | Notes | Optional | Free text | — |

> Column letters above mirror the CSV header order. Real spreadsheets may
> re-order; references in formulas should be updated accordingly.

## Allowed values — Review Status (`AB`)

Formula-assisted: `Draft`, `Needs Review`, `Hold`, `Release Candidate`,
`Retest Required`.
Set only when `AC` = `Approved`: `Released`.
Set only when `AC` = `Rejected`: `Rejected`.

## Allowed values — Human Release Decision (`AC`)

`Not Reviewed`, `Approved`, `Rejected`, `Hold for Retest`,
`Hold for More Data`. **Manual entry only.**

## Formula contracts

**Review Status suggestion (`AB`)** — signal only, may suggest up to
`Release Candidate`:

```text
=IF([Missing Evidence Count]>0,"Needs Review",
  IF([Germination Viability %]<0.85,"Hold",
    IF([Germination Sample Size]<50,"Needs Review","Release Candidate")))
```

**Missing Evidence Count (helper column)** — counts blank or invalid
required-evidence fields:

```text
=COUNTBLANK(required_range) + invalid_condition_count
```

Where `required_range` covers the required fields listed in
[spec §13](../commercial-release-review-traceability-workbook-spec.md#13-missing-evidence-count--formula-concept):
`C`, `H`, `I`, `L`, `M`, storage documentation (`O`/`P`), `Q`, `J`,
`R` or `S` (or a waiver note in `AH`), and `AA`.

`invalid_condition_count` should include conditions like:

- Final germ count > sample size.
- Cleaned seeds > total collected (in the linked seed production row).
- Conflicting dates (e.g. `H` before `F`, `I` before `H`).

## Cross-sheet traceability rules

Validated by `scripts/verify-workbook-traceability-mapping.mjs`:

| From | To | Required for |
| ---- | -- | ------------ |
| `Seed_Production_Tracking.A Seed Lot ID` | `Commercial_Release_Review_Traceability.C Seed Lot ID` | every release review row |
| `Seed_Production_Tracking.Y Linked Commercial Checklist Row` | `Commercial_Release_Checklist.Row ID / Checklist ID` | Release Candidate signal |
| `Commercial_Release_Review_Traceability.I Linked Commercial Release Checklist Row` | `Commercial_Release_Checklist.Row ID / Checklist ID` | required before human approval |
| `Commercial_Release_Review_Traceability.J Linked Pheno Comparison Row(s)` | `Pheno_Comparison_v2_Enhanced.Pheno ID` | Release Candidate unless waived |
| `Commercial_Release_Review_Traceability.K Linked F1 / Backcross / Stabilization Row(s)` | one of `F1_Population_Tracker.Row ID`, `Backcross_Line_Development.Backcross Line ID`, `F2_Stabilization_Tracker.Line ID` | when applicable |
| `Commercial_Release_Review_Traceability.AF Verdant Diary Evidence` | Verdant diary entry references | recommended |
| `Commercial_Release_Review_Traceability.AG Verdant Action Queue Draft` | draft text only | must **not** create Action Queue items automatically |

## Safety contract

- Formulas provide **signals only**.
- `Released` is set **only** when `Human Release Decision` = `Approved`.
- `Human Release Decision` is always manual.
- `AG` is draft text only — no Action Queue write.
- Premium workbook copy distribution must follow the §8 Premium
  Workbook Copy rules: public docs only show
  `{{PREMIUM_WORKBOOK_COPY_URL}}` and the exact fallback text.
- Forbidden wording: `auto-release`, `AI approved`, `guaranteed`,
  `commercial ready` (without explicit review), `automatic Action
  Queue`, `automation`, `device control`.
