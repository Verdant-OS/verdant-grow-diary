# Automated Phenotyping Protocol v1.0

**Status:** Docs-only protocol. No app code, schema, RLS, Edge Functions,
UI, Roboflow/PlantCV runtime integration, AI/model calls, alerts, Action
Queue writes, or device control are introduced by this slice.

**Purpose:** Define a Verdant-safe workflow for using external computer-vision
tools (Roboflow, PlantCV, similar) as **supporting evidence only** during
phenotype evaluation. External tool outputs never make keeper, cull,
harvest, or release decisions. A human breeder always produces the final
score.

---

## 1. Core safety rules

1. **External tool outputs are supporting evidence only.** They are
   visible trait proxies, not diagnoses.
2. **Human final score is required** for every phenotype record. Without
   it the row is incomplete.
3. **Low-confidence outputs do not affect final scoring.** They may be
   logged for context but must not drive any decision.
4. **One photo cannot justify a keeper, cull, harvest, or release
   decision.** Decisions require multi-photo, multi-day, in-person
   review.
5. **Visible concern labels require review, not diagnosis.** A label of
   "Visible concern" means a human should look — it is not a diagnosis
   of cause.
6. **No automatic Action Queue items are created from external tool
   output.** Any Action Queue entry is a grower-review-only draft and
   requires explicit grower approval before it has any effect.
7. **No automation, no device control, no AI/model calls** are part of
   this protocol.

### Preferred wording

- supporting evidence
- visible trait proxy
- needs human review
- manual final score
- grower-review-only draft

### Avoid wording (Do not use)

The phrases below must never appear in Verdant phenotyping records or
copy. They are documented here only so reviewers know what to reject.
Each line is annotated with an allow marker so the docs safety scanner
ignores its own prohibited-wording list.

- "AI selected" <!-- automated-phenotyping-docs-safety:allow -->
- "AI approved" <!-- automated-phenotyping-docs-safety:allow -->
- "automatically cull" <!-- automated-phenotyping-docs-safety:allow -->
- "auto-release" <!-- automated-phenotyping-docs-safety:allow -->
- "guaranteed healthy" <!-- automated-phenotyping-docs-safety:allow -->
- "Guaranteed harvest ready" <!-- automated-phenotyping-docs-safety:allow -->
- "diagnosed from photo" <!-- automated-phenotyping-docs-safety:allow -->
- "Action Queue item created automatically" <!-- automated-phenotyping-docs-safety:allow -->
- "automatically creates Action Queue" <!-- automated-phenotyping-docs-safety:allow -->
- "automated keeper decision" <!-- automated-phenotyping-docs-safety:allow -->
- "automated cull decision" <!-- automated-phenotyping-docs-safety:allow -->
- "automated release decision" <!-- automated-phenotyping-docs-safety:allow -->
- Legacy class names: `Healthy` <!-- automated-phenotyping-docs-safety:allow -->, `Healthy_Leaf` <!-- automated-phenotyping-docs-safety:allow -->, `Stressed` <!-- automated-phenotyping-docs-safety:allow -->, `Stressed_Leaf` <!-- automated-phenotyping-docs-safety:allow -->, `Nutrient_Deficiency` <!-- automated-phenotyping-docs-safety:allow -->, `Pest_Damage` <!-- automated-phenotyping-docs-safety:allow -->, `Diseased` <!-- automated-phenotyping-docs-safety:allow -->, `Disease_Detected` <!-- automated-phenotyping-docs-safety:allow -->

---

## 2. Label vocabulary

### 2.1 Plant condition labels (replaces certainty-heavy labels)

The Verdant-safe labels below replace prior certainty-heavy class
names. Legacy class names must not be used in Verdant-facing records
(see the annotated "Avoid wording" block in Section 1 for the full
forbidden list).

| Label                  | Meaning                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `No visible concern`   | Nothing notable in the image. Not a guarantee of plant health.            |
| `Visible concern`      | Something notable is visible. A human should review the plant in person.  |
| `Uncertain`            | The tool cannot confidently classify the region.                          |
| `Needs human review`   | Flagged for breeder attention regardless of confidence.                   |

### 2.2 Trichome labels (kept from Roboflow guidance)

- `Clear_Trichome`
- `Cloudy_Trichome`
- `Amber_Trichome`
- `Mixed_Uncertain`

### 2.3 Structure labels (kept from Roboflow guidance)

- `Main_Stem`
- `Node`
- `Cola`
- `Leaf`
- `Reference_Marker`

### 2.4 Forbidden label families

Do not introduce health/diagnosis class names or any synonym that
implies a clinical diagnosis from a single image. The full forbidden
list (with allow markers so the safety scanner does not flag this
document's own prohibited-wording reference) is in Section 1.

### 2.5 Allowed human-review status values

- `No visible concern`
- `Visible concern`
- `Uncertain`
- `Needs human review`
- `Retake Photo`
- `Accepted as Supporting Evidence`
- `Rejected`

---

## 3. Standardized photo protocol

Consistent photos make external tool output more useful as supporting
evidence. None of this changes any Verdant runtime behavior.

### 3.1 Required views

- **Side view:** Whole plant from the side at canopy mid-height.
- **Top view:** Canopy from directly above.
- **Macro / trichome view:** Close-up of trichomes on a representative
  flower site.

### 3.2 Lighting and background

- Use consistent, diffuse light. Avoid mixed colored grow-light spectra
  when possible; a neutral white work light is preferred for evaluation
  photos.
- Use a plain, non-reflective background (matte black or matte grey
  card) behind side views.
- Keep the camera roughly level with the subject for side views.

### 3.3 Reference marker

- Include a physical reference marker (ruler, ArUco tag, or printed
  scale card) in side and top views when possible. This is the
  `Reference_Marker` label.

### 3.4 Filename convention

```
<plant_id>_<YYYY-MM-DD>_<view>_<seq>.jpg
```

- `view` is one of `side`, `top`, `macro`.
- `seq` is a zero-padded sequence number per view per day (`01`, `02`).

Example: `P-0142_2026-06-27_macro_01.jpg`

---

## 4. Automated phenotyping output log

Maintain this log per plant evaluation event. It is a manual workbook
sheet in this slice — no app surface writes to it.

| Column                  | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Pheno ID                | Stable identifier for the phenotype evaluation row.                                          |
| Plant ID                | Verdant plant identifier.                                                                    |
| Project / Line          | Breeding project or line name.                                                               |
| Generation              | e.g. F1, F2, BC1.                                                                            |
| Photo ID / File Name    | Filename per Section 3.4.                                                                    |
| Photo Date              | Date the photo was captured (YYYY-MM-DD).                                                    |
| Stage                   | Grow stage at photo time (veg, flower week N, late flower, etc.).                            |
| View Type               | `side`, `top`, or `macro`.                                                                   |
| Tool / Method           | e.g. Roboflow model + version, PlantCV script + version, manual measurement.                 |
| Metric Name             | e.g. canopy_area_px, trichome_amber_pct, leaf_count.                                         |
| Automated Value         | The raw value the tool produced.                                                             |
| Unit                    | px, pct, count, ratio, etc.                                                                  |
| Confidence              | `High`, `Medium`, `Low`, `Unknown`.                                                          |
| Source Type             | `external_tool`, `manual_image_measurement`, `derived_from_photo`, `manual_import`, `unknown`. |
| Human Review Status     | `pending`, `reviewed`, `rejected`, `needs_more_photos`.                                      |
| Human Final Score       | The breeder's manual score. Required to consider the row complete.                           |
| Notes                   | Free-text breeder notes.                                                                     |
| Verdant Diary Reference | Diary entry ID this output was logged against (when applicable).                             |
| Action Queue Draft      | Grower-review-only draft text (optional). Not an actual Action Queue item.                   |

### Required provenance fields per row

- `source_type` — one of: `external_tool`, `manual_image_measurement`,
  `derived_from_photo`, `manual_import`, `unknown`.
- `confidence` — one of: `High`, `Medium`, `Low`, `Unknown`.
- `photo_id` / `filename`
- `photo_date`
- `tool_version`
- `human_review_status`

Rows missing any of these fields must be treated as `Uncertain` and
flagged `Needs human review`.

---

## 5. Roboflow-style annotation guide

This section is annotation guidance for an external Roboflow project.
Verdant does not call Roboflow at runtime in this slice.

### 5.1 Datasets

- **Trichome dataset:** macro photos only. Label with the trichome
  vocabulary in Section 2.2.
- **Structure dataset:** side and top photos. Label with the structure
  vocabulary in Section 2.3.
- **Condition dataset (optional):** if used, label only with the
  Verdant-safe condition vocabulary in Section 2.1. Do not introduce
  diagnosis classes.

### 5.2 Annotation rules

- Annotate `Reference_Marker` whenever it is visible. It is required for
  any pixel-to-length derivations.
- Prefer instance segmentation for `Cola` and `Leaf`; bounding boxes are
  acceptable for `Node` and `Main_Stem`.
- When in doubt, label the region `Mixed_Uncertain` (trichome) or
  `Uncertain` (condition) instead of forcing a class.

### 5.3 Export and use

- Export annotations and model predictions as files. Import into the
  workbook log per Section 4.
- Record `tool_version` for both the dataset version and the model
  version used to generate any prediction.

---

## 6. PlantCV appendix (optional external workflow)

PlantCV is an **optional external workflow**. Verdant does not run
PlantCV scripts in this slice. Any output must be manually reviewed and
manually imported into the workbook log per Section 4.

The snippets below are illustrative examples only.

### 6.1 Canopy area example (illustrative)

```python
# Illustrative only. Not executed by Verdant.
from plantcv import plantcv as pcv

pcv.params.debug = None
img, path, name = pcv.readimage("P-0142_2026-06-27_top_01.jpg")
gray = pcv.rgb2gray_hsv(rgb_img=img, channel="s")
binary = pcv.threshold.binary(gray_img=gray, threshold=60, max_value=255, object_type="light")
cleaned = pcv.fill(bin_img=binary, size=200)
# area_px is then read from pcv.analyze.size(...) output and logged manually.
```

### 6.2 Trichome ratio example (illustrative)

```python
# Illustrative only. Not executed by Verdant.
# Use color thresholding on a macro image to estimate clear/cloudy/amber
# pixel ratios. Treat the result as a visible trait proxy, not a
# diagnosis. Confidence should be set to Low unless the operator has
# validated the threshold parameters against ground-truth samples.
```

### 6.3 Required handling of PlantCV outputs

- Set `source_type = derived_from_photo` (or `manual_image_measurement`
  if a human measured the pixels).
- Default `confidence = Low` unless the operator has validated the
  pipeline against ground-truth photos.
- Always set `human_review_status = pending` on import.

### 6.4 Color-space appendix (optional visible trait proxy)

PlantCV color-space exploration (HSV, LAB, CMYK channel splits) is an
**optional** external workflow for surfacing visible trait proxies —
for example, leaf greenness shifts, trichome color band ratios, or
canopy color uniformity. It is documented here as supporting evidence
guidance only.

Rules:

- Any value derived from a color-space split is **supporting evidence
  only**. It is a visible trait proxy, not a diagnosis.
- Record the exact channel used (e.g. `LAB:a*`, `HSV:S`, `CMYK:K`) in
  the `Tool / Method` column alongside the PlantCV version.
- Default `confidence = Low`. Raise to `Medium` only after the operator
  has validated the threshold parameters against ground-truth samples
  on the same camera and lighting setup.
- Set `source_type = derived_from_photo`.
- A color-space value alone never justifies a keeper, cull, harvest, or
  release decision. It requires human review and corroborating
  in-person observation.


---

## 7. Verdant integration rules

- Log important outputs as **Diary entries** against the relevant plant.
  Include the `photo_id`, `tool_version`, `source_type`, and
  `confidence` in the entry body.
- Keep source and confidence labels on every metric value that travels
  with the row.
- AI Doctor may use these outputs only as **supporting context in a
  future phase**. This slice does not enable that use.
- **No automatic scoring.** No automatic keeper, cull, harvest, or
  release decisions. No automatic Action Queue creation. Any Action
  Queue entry derived from this protocol is a grower-review-only draft
  and requires explicit grower approval.

---

## 8. Human review workflow

1. Capture photos per Section 3.
2. Run external tools (Roboflow, PlantCV, manual measurements).
3. Populate the workbook log per Section 4 with full provenance.
4. Breeder reviews each row:
   - Confirms photos are representative.
   - Confirms label and metric make sense.
   - Writes the **Human Final Score**.
   - Sets `human_review_status` to `reviewed`, `rejected`, or
     `needs_more_photos`.
5. Only after human review is a row eligible to inform breeding
   decisions, and only in combination with multi-photo, multi-day,
   in-person observation.

---

## 9. Diary Entry and Photo Linking Workflow

Step-by-step workflow for getting an automated phenotyping observation
into Verdant as supporting evidence. None of these steps are automated
in this slice — every step is manual.

1. **Create or confirm Plant ID** in Verdant.
2. **Confirm Pheno ID / Line ID** for the breeding project.
3. **Capture standardized photo** per Section 3 (side, top, or macro).
4. **Name the file** using the convention in Section 11.
5. **Record Photo ID / File Name** in the workbook log.
6. **Record `photo_date`** from the capture date, not the upload date.
7. **Upload / link the photo** in Verdant against the plant.
8. **Create a Diary entry** using the template in Section 10 with the
   fields: Plant ID, Pheno ID, Project / Line, Generation, Photo ID /
   File Name, photo_date, Stage, View Type, Tool / Method, Source Type,
   Confidence, Human Review Status, Notes.
9. **Add automated phenotyping output as supporting evidence only.**
10. **Record Human Final Score only after review.** Until then leave it
    blank.
11. **Action Queue Draft** (if any) is recorded as grower-review-only
    text in the diary entry. It is not an actual Action Queue item and
    is never created automatically by this workflow.

---

## 10. Diary Entry Template

```
Title: [Pheno ID] Automated Phenotyping Review – [photo_date]

Plant ID:
Pheno ID:
Project / Line:
Generation:
Photo ID / File Name:
photo_date:
Stage:
View Type:
Tool / Method:
Source Type:
Confidence:
Automated Metric(s):
Human Review Status:
Human Final Score:
Missing Evidence:
Notes:
Action Queue Draft / Grower-review-only:
```

---

## 11. Filename Convention and Photo ID Mapping

### 11.1 Convention

```
{project}_{phenoId}_{stage}_{viewType}_{YYYY-MM-DD}_{sequence}
```

Rules:

- Use **hyphens inside IDs**, **underscores between fields**.
- Date is the **capture date**, not the upload date.
- Sequence is **two digits**: `01`, `02`, etc.
- Photo ID may equal the filename without extension, or a Verdant photo
  reference if one is available.
- `photo_date` must equal the `YYYY-MM-DD` in the filename unless
  corrected with a Note in the workbook log.

### 11.2 Examples

**Example 1 — Side view**

`SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01.jpg`

| Field      | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01`      |
| photo_date | 2026-06-26                                                  |
| Project    | SDxBD                                                       |
| Pheno ID   | SDxBD-F1-04                                                 |
| Stage      | flower-wk6                                                  |
| View Type  | side-view                                                   |
| Sequence   | 01                                                          |

**Example 2 — Top canopy**

`SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01.jpg`

| Field      | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01`     |
| photo_date | 2026-06-26                                                  |
| Project    | SDxBD                                                       |
| Pheno ID   | SDxBD-F1-04                                                 |
| Stage      | flower-wk6                                                  |
| View Type  | top-canopy                                                  |
| Sequence   | 01                                                          |

**Example 3 — Macro / trichome**

`SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome_2026-06-26_01.jpg`

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome_2026-06-26_01`  |
| photo_date | 2026-06-26                                                   |
| Project    | SDxBD                                                        |
| Pheno ID   | SDxBD-F1-04                                                  |
| Stage      | flower-wk6                                                   |
| View Type  | macro-trichome                                               |
| Sequence   | 01                                                           |

**Example 4 — Mother plant**

`SourD_SD-P1-Mother-01_veg-wk12_side-view_2026-06-26_01.jpg`

| Field      | Value                                                  |
| ---------- | ------------------------------------------------------ |
| Photo ID   | `SourD_SD-P1-Mother-01_veg-wk12_side-view_2026-06-26_01` |
| photo_date | 2026-06-26                                             |
| Project    | SourD                                                  |
| Pheno ID   | SD-P1-Mother-01                                        |
| Stage      | veg-wk12                                               |
| View Type  | side-view                                              |
| Sequence   | 01                                                     |

**Example 5 — Retake photo**

`SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome-retake_2026-06-26_02.jpg`

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome-retake_2026-06-26_02`    |
| photo_date | 2026-06-26                                                            |
| Project    | SDxBD                                                                 |
| Pheno ID   | SDxBD-F1-04                                                           |
| Stage      | flower-wk6                                                            |
| View Type  | macro-trichome-retake                                                 |
| Sequence   | 02                                                                    |

---

## 12. Grower Human-Review Checklist

Complete this one-page checklist before recording any keeper, cull,
harvest, or commercial-release decision.

### 12.1 Required for every decision

- [ ] Plant ID confirmed
- [ ] Pheno ID confirmed
- [ ] `photo_date` confirmed
- [ ] Stage confirmed
- [ ] Photo matches the standardized protocol in Section 3
- [ ] At least one supporting photo is clear and in focus
- [ ] Tool / Method recorded
- [ ] Source Type recorded
- [ ] Confidence recorded
- [ ] Output reviewed by a human
- [ ] Weak or low-confidence evidence marked `Needs human review` or
      `Retake Photo`
- [ ] Sensor and diary context reviewed where relevant
- [ ] Decision is based on multiple evidence points, not a single photo
- [ ] Keeper / cull / harvest / release decision is recorded manually
- [ ] Action Queue Draft remains grower-review-only

### 12.2 Decision-specific checks

**Keeper**

- [ ] Repeated trait evidence or diary support exists
- [ ] No unresolved `Visible concern` outstanding
- [ ] Grower final score recorded

**Cull**

- [ ] Reason documented in diary
- [ ] Evidence reviewed by a human (no model-only cull)
- [ ] No automatic cull from model output

**Harvest**

- [ ] Multiple trichome / macro / photo observations recorded if
      relevant
- [ ] Environmental and cure plan considered
- [ ] No harvest call made from a single image

**Commercial release**

- [ ] Release workbook traceability reviewed separately (see commercial
      release spec)
- [ ] Workbook formulas are treated as candidate signals only
- [ ] Human release decision recorded **outside** the automated
      phenotyping output

---

## 13. Sample Filled Phenotyping Output Log

The rows below are illustrative dummy values. They show how to populate
the log safely. Human Final Score is left blank when review is pending
or when confidence is too low to influence scoring.

| Pheno ID    | Plant ID | Project / Line | Generation | Photo ID / File Name                                              | Photo Date | Stage       | View Type      | Tool / Method            | Metric Name              | Automated Value | Unit  | Confidence | Source Type   | Human Review Status              | Human Final Score | Notes                                                  | Verdant Diary Reference | Action Queue Draft                          |
| ----------- | -------- | -------------- | ---------- | ----------------------------------------------------------------- | ---------- | ----------- | -------------- | ------------------------ | ------------------------ | --------------- | ----- | ---------- | ------------- | -------------------------------- | ----------------- | ------------------------------------------------------ | ----------------------- | ------------------------------------------- |
| SDxBD-F1-04 | P-0142   | SDxBD          | F1         | SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01              | 2026-06-26 | flower-wk6  | side-view      | PlantCV 4.x (manual run) | estimated_height_cm      | 82              | cm    | Medium     | derived_from_photo | Accepted as Supporting Evidence | 80                | Reference marker visible; pixels-to-cm calibrated.     | DIARY-9821              | (none)                                      |
| SDxBD-F1-04 | P-0142   | SDxBD          | F1         | SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome_2026-06-26_01         | 2026-06-26 | flower-wk6  | macro-trichome | Roboflow trichome v0.3   | trichome_cloudy_percent  | 62              | pct   | Low        | external_tool | Needs human review               |                   | Low confidence; do not use for harvest call.           | DIARY-9822              | Grower-review-only: schedule re-check in 48h |
| SDxBD-F1-04 | P-0142   | SDxBD          | F1         | SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome-retake_2026-06-26_02  | 2026-06-26 | flower-wk6  | macro-trichome | Roboflow trichome v0.3   | visible_concern_flag     | Uncertain       | label | Low        | external_tool | Retake Photo                     |                   | Out of focus; capture replacement macro shot.          | DIARY-9823              | (none)                                      |
| SDxBD-F1-04 | P-0142   | SDxBD          | F1         | SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01              | 2026-06-26 | flower-wk6  | side-view      | PlantCV 4.x (manual run) | node_count_estimate      | 14              | nodes | Medium     | derived_from_photo | Accepted as Supporting Evidence | 14                | Matches manual node count from diary.                  | DIARY-9821              | (none)                                      |

Rules reflected in the sample:

- Human Final Score may be blank until review.
- Low-confidence outputs do not affect the final score.
- Action Queue Draft is optional text only; it is never an actual
  Action Queue item and is never created automatically.

---

## 14. Rollback notes

This protocol is a single Markdown document. To roll back, delete
`docs/automated-phenotyping-protocol-v1.0.md`. No application behavior,
schema, RLS, Edge Function, or runtime surface depends on it.

If the static scanner (`scripts/assert-automated-phenotyping-docs-safety.mjs`)
is also being removed, delete that script, its test
(`src/test/assert-automated-phenotyping-docs-safety.test.ts`), and the
`docs:assert-automated-phenotyping-safety` package script.

