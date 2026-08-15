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

**But do not translate that into a proportional yield penalty — the evidence does not support <!-- claim-check: allow proportional-corner-yield -->
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

So the honest argument for mapping is narrower than any of those: **a room-average PPFD
figure hides where the spatial extremes are.** That is all the cited evidence supports.
Whether plants at an extreme cell actually underperform is a **within-canopy outcome
question**, and the trials compared whole treatments — they never measured it. An earlier
revision asserted the extremes are "where the plants that underperform are living"; that was
still the same unsupported inference in gentler words, and is withdrawn. Locate the extremes;
do not price them, and do not predict them.

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

| Metric                                                 | Value |
| ------------------------------------------------------ | ----- |
| Mean of all cells                                      |       |
| Minimum cell (and which)                               |       |
| Maximum cell (and which)                               |       |
| **Min ÷ mean** (uniformity ratio)                      |       |
| **Min ÷ max**                                          |       |
| Spread (max − min)                                     |       |
| **Equal-area cells?** (y / n)                          |       |
| If no — area-weighted mean                             |       |
| Sensor accuracy (absolute, from above)                 |       |
| Sensor **repeatability** (if published)                |       |
| **Uncertainty of a difference** = `√2 ×` repeatability |       |
| Did you **re-measure** the min and max cells?          | y / n |
| `m` — repeats per cell                                 |       |
| Repeat mean and SD — min cell                          |       |
| Repeat mean and SD — max cell                          |       |
| `u_confirm`, and `U_confirm` at stated k               |       |
| **Confirmed gap greater than `U_confirm`?**            | y / n |

**Report the mean with the min÷mean ratio beside it, always.** A mean quoted alone is the
failure this asset exists to prevent.

**Both metrics assume every cell covers the same canopy area.** If you refined the grid where
gradients appeared — which asset 4 tells you to do — your cells are **not** equal-area, and an
unweighted mean over-represents the refined region while `min ÷ mean` is biased with it.
Either keep cells equal-area, or record each cell's area and compute

```text
area-weighted mean = Σ(reading_i × area_i) ÷ Σ(area_i)
```

and state which you did. A refined-then-unweighted map can report worse uniformity than the
room actually has, purely because you sampled the bad region more densely.

**Judge the spread against the uncertainty of a _difference_, not against absolute accuracy —
and not against a single reading's repeatability either.** One sensor carried around the grid
keeps the same calibration bias at every cell, and that bias cancels from a cell-to-cell
comparison, so a sensor well off in absolute terms can still map uniformity. But the random
part appears at **both** cells:

```text
u_difference = sqrt(u₁² + u₂²) = √2 · u      for equal repeatability u
```

So a sensor with repeatability `u` resolves differences of roughly `√2·u` (1σ), not `u`.
Add drift over the minutes the survey took, plus anything that changed in the room meanwhile.
**Better still, measure it:** re-read one cell several times without moving anything and use
the spread of those differences.

**But `√2 · u` is still the wrong threshold for `max − min`, because those two cells were
selected for being extreme.** A pairwise threshold applies to a pair chosen in advance. Pick
the largest and smallest of many noisy cells and the gap is wide **even with no real
gradient** — and it widens as you add cells. Monte Carlo on pure noise, σ = 1, no gradient at
all (author computation, deterministic seed, 200,000 trials per row):

| Grid size     | Mean observed `max − min`, pure noise | Pairwise `√2·u` threshold |
| ------------- | ------------------------------------: | ------------------------: |
| 4 cells       |                                2.08 σ |                    1.41 σ |
| 9 cells (3×3) |                                3.00 σ |                    1.41 σ |
| 16 cells      |                                3.56 σ |                    1.41 σ |
| 25 cells      |                                3.96 σ |                    1.41 σ |

**A perfectly uniform 3 × 3 grid typically shows a range about twice the pairwise
threshold.** Testing `max − min` against `√2·u` would declare non-uniformity in a uniform
room most of the time.

**What to do instead: re-measure the min and max cells, and apply a stated criterion.**
"The gap persists" is not a test — two truly equal cells still show a nonzero gap on repeat,
and the false-positive rate depends on how many repeats you took. Take `m` fresh readings at
each of the two cells and compare their **means**:

```text
u_confirm = sqrt(SD_min^2 / m  +  SD_max^2 / m)     combined standard uncertainty of the gap
U_confirm = k * u_confirm,   k = 2 for roughly 95%
```

**Declare non-uniformity only if the confirmed gap exceeds `U_confirm`**, and record `m`,
both SDs, and the coverage factor. Because the two cells were _selected_, the confirmation
must run on **fresh, pre-designated** measurements — that is what removes the selection
effect. If the gap fails the test, you selected noise; say so.

**Only claim non-uniformity when the extreme cells survive re-measurement.** If you used more
than one sensor, their biases do **not** cancel: combine their full uncertainties instead.
(Absolute accuracy still governs the _absolute_ PPFD and DLI values below, just not the
uniformity comparison.)

## DLI (only if your readings are true PPFD)

```text
DLI (mol·m⁻²·d⁻¹) = PPFD (µmol·m⁻²·s⁻¹) × photoperiod (h) × 3600 ÷ 1,000,000
```

**This form is valid only if PPFD is constant for the whole photoperiod.** This worksheet
records a single spot map, so it gives you one instant. If the fixture dims, ramps at
sunrise/sunset, or changes output through the cycle, that multiplication is wrong — you need
to **sum over intervals** instead: map at each distinct output level, multiply each by the
hours spent there, and add. Record which case you are in.

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
