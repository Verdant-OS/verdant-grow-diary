# P2 Environment — original field assets

The eight original assets required by `pillar-pages.md`'s P2 section, built to satisfy the
`sourced → drafted` exit proof in `editorial-workflow.md`.

**Authored by:** Claude (Knowledge Library and Product Specification Architect), 2026-08-15,
under the owner's standing authority to build in Codex's place where Codex has not started.
Verified before starting: no Codex branch or PR touches `docs/knowledge-library/`, and
`docs/agents/CURRENT_STATE.md` records Codex as not yet started.

**Revision:** r1. **Licence:** same as the repository. **Sources:** every figure traces to a
claim ID in
[the P2 pillar draft](../../../knowledge-library-pillar-p2-environment-draft.md) §8.
No asset introduces a number that is not in that claim map.

## Accessibility

Every asset here is **text and tables only — there is no image anywhere in this set.** That
is deliberate rather than a shortcut: `pillar-pages.md` requires each original asset to ship
"accessibility text, revision, and a non-image equivalent," so building the non-image form
first means the equivalent is the artifact rather than an afterthought. If a rendered
diagram is added later it must reproduce this content, not replace it. Each asset states its
own accessibility note.

## The set

| #   | Asset                                                                            | R3 boundary | Purpose                                                        |
| --- | -------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| 1   | [Canopy sensor-placement record](01-canopy-sensor-placement.md)                  | no          | Where the probe is, and why one probe is one point             |
| 2   | [Leaf-offset method card](02-leaf-offset-method-card.md)                         | no          | Measure a leaf offset with its error, or do not claim leaf VPD |
| 3   | [VPD input and uncertainty worksheet](03-vpd-input-uncertainty-worksheet.md)     | no          | Produce a VPD **range**, never a single number                 |
| 4   | [Airflow and microclimate map](04-airflow-microclimate-map.md)                   | no          | Find stagnant pockets instead of averaging them away           |
| 5   | [PPFD mapping grid](05-ppfd-mapping-grid.md)                                     | no          | Uniformity, not only a mean                                    |
| 6   | [Peak-load evidence worksheet](06-peak-load-evidence-worksheet.md) **†**         | **yes**     | Evidence to hand a qualified designer — never a sizing output  |
| 7   | [Lights-off transition timeline](07-lights-off-transition-timeline.md)           | no          | Record the window where latent load outlives sensible load     |
| 8   | [CO2 monitoring and escalation card](08-co2-monitoring-escalation-card.md) **†** | **yes**     | Monitor, alarm, egress, escalate. No enrichment procedure      |

**† Pending qualified-safety approval.** Assets 6 and 8 sit inside the R3 boundary
(`hvac_safety`, `co2_safety`). Per `editorial-workflow.md`, `safety_review` runs **after**
`drafted`, so these are drafted here and carry a pending-approval banner on their face. They
must not be used operationally until a qualified reviewer clears them.

## What these assets deliberately do not do

- **No target values.** Not one asset states a VPD, temperature, humidity, CO2, or PPFD
  target. They record what was measured and how well it is known. The pillar's open question
  about the shipped stage bands (draft §9) is unresolved, and nothing here presumes it.
- **No sizing, no device control, no automation.** Asset 6 produces inputs for a qualified
  designer and says so on every page.
- **No unsourced numbers — with one bounded exception, stated here.** Every **cultivation,
  safety, or measurement** figure cites its claim ID; where a figure would be needed but none
  is verified, the field is a blank for the user's own instrument rather than a default.
  **The exception is template structure** — how many sample rows, grid cells, or timeline
  intervals an asset happens to lay out. Those are **illustrative layout choices, not
  thresholds**; no claim in §8 establishes them, and each asset says so where it uses one.
  **Do not read a row count as a sampling minimum.**
