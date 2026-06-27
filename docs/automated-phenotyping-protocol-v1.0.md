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

## 9. Rollback notes

This protocol is a single Markdown document. To roll back, delete
`docs/automated-phenotyping-protocol-v1.0.md`. No application behavior,
schema, RLS, Edge Function, or runtime surface depends on it.
