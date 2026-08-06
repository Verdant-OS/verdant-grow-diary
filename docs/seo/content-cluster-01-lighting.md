# Content cluster 01 — indoor lighting decisions

## Job to be done

“I am about to change a light, schedule, or fixture height—or I think the canopy is stressed. Help me decide what to measure, what not to assume, and what to log so I can see whether the change helped.”

## Pillar and supporting architecture

| Role            | Working page                                         | Primary decision                                                          | Product path                                                           | Update trigger                                                    |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Pillar          | `cannabis-grow-light-distance-and-schedule`          | How do I set/verify intensity, distance, DLI, and schedule?               | Log a measured baseline and each light change                          | New peer-reviewed cannabis lighting evidence or a GSC query trend |
| Troubleshooting | `cannabis-light-stress-light-burn-bleaching-or-heat` | Is this pattern more consistent with light, heat, or another cause?       | Add a symptom/photo/sensor timeline before changing multiple variables | New evidence, safety review, GSC symptom queries                  |
| Supporting      | `autoflower-light-schedule-and-grow-log`             | Should an autoflower schedule change, and how do I compare it?            | Log photoperiod, stage, DLI and response                               | Cultivar/context evidence, query trend                            |
| Supporting      | `ppfd-canopy-map-and-dli-grow-log`                   | How do I measure coverage and daily dose rather than guess from distance? | Save a canopy map and sensor/meter provenance                          | Product measurement surface changes                               |
| Supporting      | `light-change-checklist-for-grow-diary`              | What should I record before/after one light change?                       | Quick Log / plant timeline                                             | Logging UI changes                                                |

## Information-quality rules

- Treat fixture distance as a **measurement prompt**, not a universal prescription. Fixture optics, dimmer setting, canopy shape, height, and coverage change the answer.
- Explain PPFD and DLI definitions and calculations. Do not assert universal stage targets without a cited, scoped source and context qualifiers.
- Separate a possible light-stress pattern from a diagnosis. Bleaching, heat stress, nutrient issues, water status, pest pressure, and leaf age can overlap.
- Recommend small, reversible changes and a stable observation window. Never suggest automatically changing equipment or increasing/decreasing nutrients from weak evidence.
- Preserve metric units (`µmol·m⁻²·s⁻¹`, `mol·m⁻²·d⁻¹`) and add a plain-language explanation rather than fake imperial conversion for photon flux.

## Source stack for publication

1. Peer-reviewed controlled-environment cannabis lighting studies, including [Rodriguez-Morrison et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144505/) for a clearly scoped indoor intensity experiment.
2. Peer-reviewed work on photoperiod and cultivar-specific response; do not generalize micropropagation findings to mature flowering plants.
3. Manufacturer documentation only for fixture-specific hanging/dimmer guidance, with date/version and an explicit manufacturer attribution.
4. Verdant product documentation only for what the product actually records or displays.

## Visible schema plan

- Pillar and troubleshooting pages: `Article`, `BreadcrumbList`, and `FAQPage` only for questions visibly rendered on the page.
- Do not use HowTo schema for cultivation changes that need context and cannot be safely universalized.
- Emit Article only from the guide's visible, repository-backed publication/review fields. Keep
  WebPage, FAQ, and Breadcrumb schema but omit Article for legacy guides without a verified
  publication date.

## Conversion path and internal links

1. Educational answer above the CTA.
2. Contextual link to `/tools/vpd-calculator` where temperature/RH interpretation matters.
3. Contextual link to `/hardware-integrations` for source-labeled hardware data, not a device-control claim.
4. Contextual link to `/quick-log` for the no-account first entry.
5. Signed-in continuation speaks to a plant timeline, not a generic signup.

## Publication gate

The two production-ready pages passed this gate:

1. Start on PR #560’s exact head while it owns the shared registry, then rebase the post-PR commits
   onto the current deploy head after its squash merge.
2. Use scoped primary research and explicit non-generalization notes.
3. Render the same shared FAQ arrays used by FAQPage JSON-LD.
4. Add exact publication/review provenance before emitting Article dates.
5. Run static-head, JSON-LD, sitemap, render, type, lint, and production-build verification.

Publication to the live site remains unclaimed until this branch is merged and deployed.
