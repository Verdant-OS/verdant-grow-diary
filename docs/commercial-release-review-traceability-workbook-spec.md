# Commercial Release Review + Traceability — Workbook Spec

> **Docs-only workbook spec.** Not approved for V0 app implementation. No
> code, schema, RLS, RPC, Edge Function, UI, AI call, alert, Action Queue
> write, or device control is introduced by this document. **No automatic
> release decisions.**

This sheet sits one layer after `Seed_Production_Tracking`. It reviews
whether a line / seed lot is ready for commercial release and preserves
traceability back to parentage, pheno data, seed production, germination
tests, storage, stress testing, and Verdant diary evidence.

---

## 1. Status

- Workbook / spec only.
- Not approved for V0 app implementation.
- **No automatic release decisions.** Every release is an operator decision.

---

## 2. Purpose

Commercial release review with full traceability back to:

- Plant IDs
- Pheno IDs
- Parent lines
- Seed lot
- Germination results
- Storage history
- Stress tests
- Harvest / cure outcomes
- Diary / photo / sensor evidence

The sheet is the audit trail for "why this line was approved (or held) for
release."

---

## 3. Sheet name

`Commercial_Release_Review_Traceability`

---

## 4. Recommended columns

| Field                                       | Notes                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| Release Review ID                           | Unique. Example `CRR-2026-Nimbus-Lot03-r1`.                                      |
| Candidate Line / Product Name               | Human-facing line name.                                                          |
| Seed Lot ID                                 | Reference into `Seed_Production_Tracking`.                                       |
| Project / Line                              | Project name.                                                                    |
| Generation                                  | `F1` / `F2` / `BC1` etc.                                                         |
| Female Parent                               | Plant / Pheno ID.                                                                |
| Male Parent                                 | Plant / Male ID / pollen source.                                                 |
| Linked Seed Production Row                  | `Seed_Production_Tracking` row reference.                                        |
| Linked Commercial Release Checklist Row     | Reference into Commercial Release Checklist.                                     |
| Linked Pheno Comparison Row(s)              | One or more references.                                                          |
| Linked F1 / Backcross / Stabilization Row(s)| One or more references.                                                          |
| Germination Viability %                     | Copied/linked from `Seed_Production_Tracking.L`.                                 |
| Germination Sample Size                     | Copied/linked from `Seed_Production_Tracking.N`.                                 |
| Germination Test Date                       | Copied/linked from `Seed_Production_Tracking.M`.                                 |
| Storage Method                              | Enum (see Seed Production spec).                                                 |
| Storage Conditions Documented?              | `Yes` / `No`.                                                                    |
| Parentage Complete?                         | `Yes` / `No` / `Partial`.                                                        |
| Multi-Environment Testing Complete?         | `Yes` / `No` / `Waived`.                                                         |
| Stress Testing Complete?                    | `Yes` / `No` / `Waived`.                                                         |
| Herm / Stability Concern?                   | `None` / `Minor` / `Major`.                                                      |
| Terp / Chemotype Stability Evidence         | Text + references.                                                               |
| Dry / Cure Performance Evidence             | Text + references.                                                               |
| Yield / Production Evidence                 | Text + references.                                                               |
| Pest / Disease Resistance Evidence          | Text + references.                                                               |
| Hash / Extraction Evidence (if applicable)  | Text + references.                                                               |
| Test Grow Feedback (if available)           | Text + references.                                                               |
| Unresolved Concerns                         | Text. Any non-empty value blocks `Release Candidate`.                            |
| Review Status                               | Formula-assisted. See §5.                                                        |
| Human Release Decision                      | **Manual only.** See §5.                                                         |
| Reviewer                                    | Operator name / ID.                                                              |
| Review Date                                 | Date `YYYY-MM-DD`.                                                               |
| Verdant Diary Evidence                      | Link / reference.                                                                |
| Verdant Action Queue Draft                  | Draft text only — grower-review-only.                                            |
| Notes                                       | Free text.                                                                       |

---

## 5. Allowed values

**Review Status** (formula-assisted suggestion):

- `Draft`
- `Needs Review`
- `Hold`
- `Release Candidate`
- `Released`
- `Rejected`
- `Retest Required`

**Human Release Decision** (manual entry only — no formula sets this):

- `Not Reviewed`
- `Approved`
- `Rejected`
- `Hold for Retest`
- `Hold for More Data`

> **Rules:**
>
> - `Review Status` may be formula-assisted up to `Release Candidate`.
> - `Review Status` = `Released` is set **only** when `Human Release
>   Decision` = `Approved`. A formula must never set `Released` on its own.
> - `Human Release Decision` is always manual.

---

## 6. Formula guidance (candidate signals only)

Helper columns the workbook may compute:

- **Release Evidence Completeness %** — share of required evidence fields
  that are present and acceptable.
- **Required Evidence Missing Count** — count of required fields that are
  blank or fail validation.
- **Review Status suggestion** — derived from completeness, viability, and
  sample size.

Example concept (pseudocode-style spreadsheet formula):

```text
=IF([Required Evidence Missing Count]>0,"Needs Review",
  IF([Germination Viability %]<0.85,"Hold",
    IF([Germination Sample Size]<50,"Needs Review","Release Candidate")))
```

**Rules:**

- A formula may suggest up to `Release Candidate`.
- A formula **must never** mark `Released`.
- `Released` requires manual `Human Release Decision` = `Approved`.

> **Warning:** Formula output is a **review signal only**. It is not
> commercial approval.

---

## 7. Traceability checklist (required before human approval)

Operator must confirm **all** of the following before recording
`Human Release Decision` = `Approved`:

- Seed Lot ID present.
- Parentage complete.
- Germination test complete.
- Sample size ≥ 50 (preferred 100).
- Viability ≥ 85%.
- Storage documented (method, temp, RH / desiccant).
- Commercial Release Checklist linked.
- Pheno evidence linked.
- Stress / multi-environment evidence linked, or an **explicit waiver note**
  recorded in `Notes`.
- No unresolved major concerns.
- Human reviewer recorded.

Any failure → record `Hold for Retest`, `Hold for More Data`, or `Rejected`
with reason.

---

## 8. Premium Workbook Copy

[Premium subscribers: copy the workbook]({{PREMIUM_WORKBOOK_COPY_URL}})

**Access rules:**

- **Premium subscriber access only.**
- Do **not** publish this workbook copy link in public docs, public
  marketing pages, or unauthenticated UI.
- Do **not** hardcode a real Google Sheets / Drive / Notion / Dropbox URL
  in this document. The placeholder `{{PREMIUM_WORKBOOK_COPY_URL}}` must
  be resolved server-side after entitlement verification.
- In future app implementation, serve this link **only after entitlement
  verification** (capability check against the user's billing entitlement —
  not `profiles.tier`, not client-side storage).
- If the link is unavailable, show: **"Workbook copy link not configured."**

> Entitlement logic is **not** implemented in this docs-only slice. This
> section documents the access contract for whoever wires it up later.

---

## 9. Verdant integration

When the operator chooses to mirror this workbook into Verdant:

- Link release reviews to **Diary entries**.
- Link supporting **photos** by plant and stage.
- Link **sensor / cure / harvest evidence** with source labels (`live` /
  `manual` / `csv` / `demo` / `stale` / `invalid`) preserved verbatim —
  never relabeled as `live`.
- `Verdant Action Queue Draft` is **draft-only and grower-review-only**.
- **No automatic Action Queue creation** from this workbook.

---

## 10. Non-goals

- No app implementation.
- No release automation.
- No AI approval.
- No automatic product publishing.
- No device control.
- No schema migration.

---

## 11. Safety notes

- Spreadsheet formulas provide **signals**.
- **Humans approve release.**
- Weak evidence should produce **review / hold** language, never confident
  release language.
- Forbidden wording in this workbook and any derived copy:
  `auto-release`, `AI approved`, `guaranteed`, `commercial ready` (without
  explicit review), `automatic Action Queue`, `automation`, `device control`.
- Preferred wording: `candidate signal`, `needs review`, `hold for retest`,
  `grower-review-only`, `operator-approved release`,
  `recorded as release-review memory`.

---

## Change log

- **v1.0 (this doc):** Initial Commercial Release Review + Traceability
  workbook spec.
