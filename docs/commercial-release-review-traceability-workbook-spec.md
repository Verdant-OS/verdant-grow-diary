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

Short description: this workbook is the operator-facing audit trail for
commercial release reviews. A premium-only copy is offered so subscribers
can fork it without rebuilding the structure.

**Public docs / unauthenticated UI — preview:**

[Premium subscribers: copy the workbook]({{PREMIUM_WORKBOOK_COPY_URL}})

If the link is not configured, the **exact fallback text** to render is:

> Workbook copy link not configured. Premium subscribers should contact
> support or check back after the workbook link is configured.

### Public docs / unauthenticated UI rules

**Do:**

- Show a short description of the workbook.
- Show premium-only access language.
- Show the fallback text above when no configured link exists.
- Use `{{PREMIUM_WORKBOOK_COPY_URL}}` **only** as a placeholder inside
  internal docs / specs.

**Do not:**

- Publish a real Google Sheets, Drive, Notion, Dropbox, or file URL in
  public docs.
- Place a live workbook copy link in public marketing pages.
- Render the workbook link in unauthenticated UI.
- Include signed URLs, private file IDs, tokens, internal bucket paths,
  or entitlement secrets.
- Say "free download" or imply public access.

### Authenticated / premium context rules

**Do:**

- Serve the real workbook copy link **only after** premium entitlement
  verification.
- Treat the workbook URL as **configurable content**, not hardcoded
  source text.
- Show the configured link only to entitled users.
- Show the exact fallback text above if the link is missing.
- Log access events only if the product already has a privacy-safe
  analytics pattern.

**Do not:**

- Implement entitlement logic in this docs-only slice.
- Hardcode a real workbook URL.
- Cache the link in public HTML.
- Leak the link through docs, screenshots, unauthenticated API
  responses, static bundles, or client-visible config.
- Create Action Queue items from link access.

> **Safety:** Premium access controls must be enforced server-side or
> through an approved entitlement gate before any real workbook copy
> link is shown.

Entitlement logic is **not** implemented in this docs-only slice. This
section documents the access contract for whoever wires it up later.

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

## 12. Cross-Sheet Traceability Mapping

This table defines the exact ID columns that link the workbook sheets.
Use stable human-readable row IDs / checklist IDs when possible; avoid
relying on fragile spreadsheet row numbers.

| From                                                                              | To                                                                                                            | Required for                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Seed_Production_Tracking.A Seed Lot ID`                                          | `Commercial_Release_Review_Traceability.C Seed Lot ID`                                                        | every release review row                                              |
| `Seed_Production_Tracking.Y Linked Commercial Checklist Row`                      | `Commercial_Release_Checklist.Row ID / Checklist ID`                                                          | Release Candidate signal — if missing, Missing Evidence Count increments |
| `Commercial_Release_Review_Traceability.I Linked Commercial Release Checklist Row`| `Commercial_Release_Checklist.Row ID / Checklist ID`                                                          | required before human approval                                        |
| `Commercial_Release_Review_Traceability.J Linked Pheno Comparison Row(s)`         | `Pheno_Comparison_v2_Enhanced.Phase/Pheno Row ID` or `Pheno ID`                                               | Release Candidate unless waived with notes                            |
| `Commercial_Release_Review_Traceability.K Linked F1 / Backcross / Stabilization Row(s)` | one or more of `F1_Population_Tracker.Project or Row ID`, `Backcross_Line_Development.Backcross Line ID`, `F2_Stabilization_Tracker.Line ID` | required when the line came from a population / backcross / stabilization workflow |
| `Commercial_Release_Review_Traceability.AD Verdant Diary Evidence`                | Verdant diary entry references                                                                                | optional but strongly recommended                                     |
| `Commercial_Release_Review_Traceability.AE Verdant Action Queue Draft`            | draft text only                                                                                               | must **not** create Action Queue items automatically                  |

**Traceability rules:**

- `Seed Lot ID` must be **unique** in `Seed_Production_Tracking`.
- Every Commercial Release Review row must reference **exactly one**
  `Seed Lot ID`.
- One Seed Lot may have multiple review rows over time **only if** each
  row has a unique `Release Review ID` and `Review Date`.
- Checklist references should be stable human-readable row IDs /
  checklist IDs, not fragile spreadsheet row numbers when possible.
- Broken or missing references increment **Missing Evidence Count**.
- Missing references can create **review / hold signals only**; they
  must never trigger automatic rejection or automatic release.

---

## 13. Missing Evidence Count — formula concept

A formula-assisted counter that summarizes how much required evidence is
missing or invalid for a given release review row. It is a **signal
input**, not a decision.

**Required evidence fields (each counts as 1 when missing):**

- `Seed Lot ID` present.
- Linked Seed Production Row present.
- Linked Commercial Release Checklist Row present.
- `Germination Viability %` present.
- `Germination Sample Size` present and `>= 50`.
- Storage documented (method, temp, RH / desiccant).
- Parentage complete.
- Pheno evidence linked.
- Stress or multi-environment evidence linked, **or** waiver note
  present.
- No unresolved major concerns.

**Counting rules:**

- Count each missing required field as `1`.
- Count invalid / conflicting fields (e.g. final germ count > sample
  size, cleaned seeds > total collected, conflicting dates) as `1`.
- Do **not** count optional evidence as missing unless the sheet marks
  it required.

**Example pseudo-formula:**

```text
=COUNTBLANK(required_range) + invalid_condition_count
```

**Safety:**

- `Missing Evidence Count` can support the `Review Status suggestion`.
- `Missing Evidence Count` must **not** set `Human Release Decision`.
- A count of `0` is not approval — `Human Release Decision` remains
  manual.

---

## 14. Formula Edge Cases: Expected Outputs

Mirrors the edge-case table in
[`docs/seed-production-tracking-workbook-spec.md`](./seed-production-tracking-workbook-spec.md#formula-edge-cases-expected-outputs)
so reviewers can read the release-side expectations in one place.

| Scenario                              | Viability %                                       | Viable Seed Ratio          | Quality Flag                 | Missing Evidence Count                            | Review Status suggestion  |
| ------------------------------------- | ------------------------------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------- | ------------------------- |
| A — Complete release candidate signal | `94%`                                             | `90%`                      | `Pass`                       | `0`                                               | `Release Candidate`       |
| B — Good germination, small sample    | `95%`                                             | per other cols             | `Needs Review`               | increment for small sample (`< 50`)               | `Needs Review`            |
| C — Very small sample                 | `100%`                                            | per other cols             | `Hold`                       | increment for sample `< 25`                       | `Hold`                    |
| D — Missing germination test          | `blank`                                           | per other cols             | `Missing Test`               | increment for missing germination evidence        | `Needs Review` or `Hold`  |
| E — Final count > sample size         | `invalid` / `review` (never `105%`)               | per other cols             | `Hold` or `Needs Review`     | increment for invalid germination counts          | `Hold`                    |
| F — Cleaned seeds > total collected   | unchanged (germination drives flag)               | `invalid` / `review`       | per germination test only    | increment for conflicting seed counts             | `Needs Review` or `Hold`  |
| G — Conflicting dates                 | unchanged if germ counts valid                    | unchanged                  | unchanged if germ counts valid | increment for date conflicts                    | `Needs Review`            |
| H — Retest cycle                      | first `68%`, retest `88%`; official only switches when operator marks retest official | per other cols | `Pass` allowed only against official viability | per other rules        | `Needs Review` until reviewer accepts retest |

**Reaffirmed:** formulas may flag, suggest, and count missing evidence.
They must never set `Released`. `Human Release Decision` remains manual.
Retest override requires operator approval and never silently hides the
failed first test.

---

## 15. Versioning and Change-Log Policy

- Workbook specs use semantic versions: `v1.0`, `v1.1`, `v1.2`, `v1.3`, …
- **Patch-level** changes may clarify wording, examples, formulas, or
  safety copy.
- **Minor version** changes may add new sections, columns, formulas, or
  workbook sheets.
- **Major version** changes require explicit review because they may
  change the workbook operating model.
- Every version entry must include: **version**, **date**, **summary**,
  **files / sections changed**, **safety impact**, **rollback note**.

---

## Change log

- **v1.3 (this doc) — 2026-06-26:**
  - Summary: Hardened Premium Workbook Copy language (public vs.
    authenticated do/don't rules and exact fallback text), added
    `Cross-Sheet Traceability Mapping`, `Missing Evidence Count` formula
    concept, `Formula Edge Cases: Expected Outputs`, and a
    `Versioning and Change-Log Policy`.
  - Files / sections changed: this file — sections 8, 12, 13, 14, 15,
    and *Change log*.
  - Safety impact: **None.** Docs-only. No app code, schema, RLS, RPC,
    Edge Function, UI, entitlement logic, AI call, alert, Action Queue
    write, or device control changes. No real workbook URL is exposed.
  - Rollback note: revert this file to the v1.0 revision; no app
    rollback required.
- **v1.0:** Initial Commercial Release Review + Traceability workbook
  spec.
