# Asset 5 — PPFD mapping grid

**Revision** r1 · 2026-08-15 · **Risk** R2 · **Claims** C04a, C04b · **Licence** repository

**Accessibility note.** Written grid and tables, no image. Cell references follow asset 4's
convention (`B2` = column B, row 2) so the two maps overlay by reference rather than by
picture.

---

## Why uniformity, not the average

P2's acceptance gate requires light pages to "provide uniformity, not only an average," and
there is direct cannabis evidence for why. In one indoor trial, inflorescence yield rose
**linearly from 116 to 519 g·m⁻² (4.5×) as canopy PPFD rose from 120 to
1,800 µmol·m⁻²·s⁻¹**, with no plateau inside that range, and an independent group reported
dry-matter production likewise rising from 600 to 1,200 µmol·m⁻²·s⁻¹ [claim C04a].

**But do not translate that into a proportional yield penalty — the evidence does not support
it.** In the same trial PPFD rose **15×** (120→1,800) while yield rose only **4.5×**, so the
linear fit carries a large positive intercept and a fractional light deficit produces a
**smaller** fractional yield deficit. **This asset publishes no percentage for that deficit,
and earlier revisions that did are withdrawn.** Two independent reasons: any such figure
depends entirely on the baseline PPFD it assumes, and — more fundamentally — the trial
compared **whole treatments**, never positions within one canopy, so it cannot quantify a
corner penalty at any baseline. A number here would be an unsupported extrapolation
regardless of how it was framed.

Two further limits on any such estimate:

- The trial varied intensity **across whole treatments**, not across positions within one
  canopy. It does not directly measure how a shaded corner of an otherwise bright room
  behaves — neighbouring plants, edge effects, and airflow all differ there.
- The fit is bounded to that trial's cultivar, medium, facility, and range.

So the honest argument for mapping is not a yield multiplier: **a room-average PPFD figure
hides where the extremes are, and the extremes are where the plants that underperform are
living.** Locate them; do not price them.

> **What this asset will not tell you: whether light affects potency.** The evidence
> conflicts. One trial found **no** effect of PPFD on the potency of any measured cannabinoid
> across 120–1,800 µmol·m⁻²·s⁻¹; an independent group reported cannabinoid and terpenoid
> **concentrations** rising ~60% and ~40% across 600–1,200. Different cultivars, facilities,
> and ranges [claim C04b]. **Do not use this map to argue either way.**

## Instrument reality check — read this before recording

| Question                                       | Why it matters                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Is it a quantum sensor or a lux meter / phone? | Lux and phone apps are weighted for human vision, not photosynthesis. A lux-to-PPFD conversion factor is **spectrum-specific** and wrong for a different fixture.                                                                                      |
| What is its stated accuracy?                   | Record it — it bounds the **absolute** PPFD and DLI values. It does **not** bound uniformity: for a grid walked with one sensor, a stable bias cancels, so repeatability and drift govern whether a spatial difference is real (see Uniformity below). |
| What is its repeatability?                     | Record it if published. This is the figure that decides whether a cell-to-cell difference is resolvable.                                                                                                                                               |
| Calibration date?                              | Quantum sensors drift. An uncalibrated map is ordinal, not absolute.                                                                                                                                                                                   |

**If you are using a lux meter or a phone, record that.** Your map is still useful for
_uniformity_ — the relative pattern across cells — but the absolute numbers are not PPFD and
must not be labelled as such.

## Survey conditions

| Field                            | Value                      |
| -------------------------------- | -------------------------- |
| Room / tent                      |                            |
| Date / time                      |                            |
| Fixture(s) make / model          |                            |
| Dimming setting                  |                            |
| Fixture height above canopy (cm) |                            |
| Hours of operation on fixture    |                            |
| Measurement height               | canopy top / other: ...... |
| Sensor make / model + accuracy   |                            |
| Sensor type                      | quantum / lux / phone      |
| Recorded by                      |                            |

**Sensor held level, facing straight up, at a constant height, with your body and arm out of
the beam.** Shading yourself is the most common way to produce a fake dim spot.

## Grid record

Same cell convention as asset 4. Add rows for larger rooms.

| Cell | Reading | Cell | Reading | Cell | Reading |
| ---- | ------- | ---- | ------- | ---- | ------- |
| A1   |         | B1   |         | C1   |         |
| A2   |         | B2   |         | C2   |         |
| A3   |         | B3   |         | C3   |         |

**Units:** µmol·m⁻²·s⁻¹ (quantum sensor) or lux (record which — they are not the same
quantity).

## Uniformity

| Metric                                        | Value |
| --------------------------------------------- | ----- |
| Mean of all cells                             |       |
| Minimum cell (and which)                      |       |
| Maximum cell (and which)                      |       |
| **Min ÷ mean** (uniformity ratio)             |       |
| **Min ÷ max**                                 |       |
| Spread (max − min)                            |       |
| Sensor accuracy (absolute, from above)        |       |
| Sensor **repeatability** (if published)       |       |
| Is the spread larger than that repeatability? | y / n |

**Report the mean with the min÷mean ratio beside it, always.** A mean quoted alone is the
failure this asset exists to prevent.

**Judge the spread against repeatability, not absolute accuracy.** One sensor carried around
the grid keeps the same calibration bias at every cell, and that bias cancels out of a
cell-to-cell comparison — so a sensor well off in absolute terms can still map uniformity
reliably. What limits you is its repeatability, plus drift over the minutes the survey took,
plus anything that changed in the room meanwhile.

**If the spread is not larger than that, you have not demonstrated non-uniformity** — say so
rather than acting on it. If you used more than one sensor, their biases do **not** cancel:
combine their uncertainties and compare against that instead. (Absolute accuracy still
governs the _absolute_ PPFD and DLI values below, just not the uniformity comparison.)

## DLI (only if your readings are true PPFD)

```text
DLI (mol·m⁻²·d⁻¹) = PPFD (µmol·m⁻²·s⁻¹) × photoperiod (h) × 3600 ÷ 1,000,000
```

| Cell | PPFD | Photoperiod (h) | DLI |
| ---- | ---- | --------------- | --- |
| Mean |      |                 |     |
| Min  |      |                 |     |
| Max  |      |                 |     |

**Compute DLI per cell, not from the room mean** — the same aggregation trap as asset 3.
And do not compute DLI from lux readings; the conversion is spectrum-dependent.

## What not to conclude

- **No target.** This asset states no PPFD or DLI target. The cannabis evidence in C04a is
  bounded to specific facilities, cultivars, media, and intensity ranges, and observing no
  plateau within a tested range is not evidence that none exists beyond it.
- **No potency claim** in either direction (C04b).
- **Not a fixture recommendation.** Equipment selection is P10's territory.
- **Not transferable.** A map describes this fixture, at this height, at this dimming
  setting, over this canopy.

**Next observation:** re-map after any change to fixture height, dimming, canopy height, or
plant spacing, and periodically to track fixture depreciation.
