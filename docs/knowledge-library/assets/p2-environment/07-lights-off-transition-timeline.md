# Asset 7 — Lights-off transition timeline

**Revision** r1 · 2026-08-15 · **Risk** R2 · **Claims** C01, C03, C05, C09 · **Licence** repository

**Accessibility note.** A time-indexed table, no image. Each row is one observation; the
"chart" is the table itself.

---

## The window this asset captures

At lights-off, sensible (heat) load falls quickly while latent (moisture) load does not.
Equipment that removes moisture as a by-product of cooling loses its moisture-removal
capability exactly when the room needs it most — and that is invisible in a daily average.

**This asset states no duration for that window, because no source in the claim map
establishes one.** An earlier revision asserted "the first one to two hours," which was an
unmapped number and is withdrawn — the pillar's own rule is that assets introduce no figure
absent from §8. **When the peak occurs, and how long it lasts, is a property of your room's
moisture release and equipment cycling.** Rooms whose HVAC cycles slowly, or whose substrate
releases moisture late, can peak well after any fixed template would stop watching. **Record
through the full lights-off period at least once** to find out where your own peak sits;
only then is a shorter recurring template defensible, and only at the interval your own data
justifies.

Two reasons this window matters beyond equipment:

- **Condensation is governed by surface temperature, not room RH.** A cold wall, duct, or
  fixture housing can be below dew point while the room reads acceptable.
- **_Botrytis_ prefers cool.** Extension guidance puts infection risk at **65–75 °F (68 °F
  optimal)** with high humidity and free water on surfaces [claim C09 — **hemp,
  greenhouse-framed**, so treat as risk direction, not an indoor setpoint]. The post-lights-off
  window is cool _and_ humid at the same time.

## Setup

| Field                                   | Value |
| --------------------------------------- | ----- |
| Room / tent                             |       |
| Date                                    |       |
| Stage / week of flower                  |       |
| Lights-off clock time                   |       |
| Probe used + position (asset 1 locator) |       |
| Probe accuracy (T / RH)                 |       |
| Surface thermometer used                |       |
| Recorded by                             |       |

**Record at least one full cycle in late flower.** That is the case that binds.

## Timeline

**First run: record through the entire lights-off period**, not to a fixed cut-off — you are
locating your peak, and a template that stops early will report a peak that is merely the
last point you measured. Rows below run to +120 minutes as a starting scaffold; **add rows
to the end of your dark period** and keep going until RH has clearly turned and recovered.
Note in the findings table whether the peak fell inside the sampled window or at its edge.

Compute VPD per row using asset 3 — **do not average the inputs first** (claims C01, C02).

| Minutes from lights-off | Air T (°C) | RH (%) | VPD (kPa) | Coldest surface T (°C) | Equipment state | Notes |
| ----------------------: | ---------- | ------ | --------- | ---------------------- | --------------- | ----- |
|                     −15 |            |        |           |                        |                 |       |
|                       0 |            |        |           |                        |                 |       |
|                      +5 |            |        |           |                        |                 |       |
|                     +10 |            |        |           |                        |                 |       |
|                     +15 |            |        |           |                        |                 |       |
|                     +30 |            |        |           |                        |                 |       |
|                     +45 |            |        |           |                        |                 |       |
|                     +60 |            |        |           |                        |                 |       |
|                     +90 |            |        |           |                        |                 |       |
|                    +120 |            |        |           |                        |                 |       |

**Equipment state:** which units are running, and whether any is at continuous duty.

**Coldest surface temperature:** walk the room with the surface thermometer and record the
_lowest_ reading you find, plus where. Candidates: exterior walls, duct runs, fixture
housings after cool-down, uninsulated pipework, glass.

## Findings

| Metric                                                      | Value | At minute |
| ----------------------------------------------------------- | ----- | --------- |
| Peak RH                                                     |       |           |
| Minimum VPD                                                 |       |           |
| Time for RH to peak                                         |       |           |
| **Did the peak fall at the edge of the sampled window?**    | y / n |           |
| Full dark-period length                                     |       |           |
| Was the whole dark period sampled?                          | y / n |           |
| Time for RH to return to its lights-on level (or "did not") |       |           |
| Lowest surface temperature observed                         |       |           |
| Did any equipment reach continuous duty?                    |       |           |
| Longest period at continuous duty                           |       |           |

## Condensation check

Condensation risk is a comparison between the **coldest surface** and the **dew point of the
air**, not a room RH threshold.

| Field                                          | Value |
| ---------------------------------------------- | ----- |
| Coldest surface temperature observed (°C)      |       |
| Dew point of room air at that same minute (°C) |       |
| Margin (surface − dew point, °C)               |       |
| Was liquid water observed anywhere?            | y / n |
| Where                                          |       |

**A negative or near-zero margin means condensation is occurring or imminent**, regardless of
whether room RH looks acceptable. Record it; do not respond with plant intervention.

> **Dew point:** if your instrument does not report it, an evidence editor should supply a
> method reference before this row is published — this draft carries **no verified dew-point
> formula** in its claim map, and inventing one here would be exactly the unsourced
> quantitative claim the pillar refuses elsewhere. Record the instrument's own dew-point
> output and its accuracy, or leave the row blank and say why.

## Interpretation rules

- **Judge a difference against repeatability, not absolute accuracy.** A stable calibration
  bias shifts every reading the same way, so **it cancels when you compare two readings from
  the same instrument** — a repeatable ±0.5 °C probe can resolve a real 0.3 °C difference
  perfectly well. Absolute accuracy governs "what is the true value here"; **repeatability,
  drift over the survey, and any room change during it** govern "is this difference real."
  - **One instrument, left in place across the timeline:** compare against its **repeatability** (plus drift across the hours the timeline spans).
  - **Two or more fixed instruments:** their biases do **not** cancel — combine their
    individual uncertainties (in quadrature if independent) and compare against that.
  - Where a datasheet gives no repeatability figure, **record that absence**; you then cannot
    state how small a difference you can resolve.
- **A room that never recovers is a capacity finding**, not a plant problem. It belongs in
  asset 6, to hand to a qualified designer.
- **Stabilise the environment; do not respond with defoliation, irrigation, or feeding
  changes.** Environmental instability is diagnosed with environmental evidence.

## What not to conclude

- No setpoint, no target, no equipment recommendation.
- Not a _Botrytis_ diagnosis. Elevated risk conditions are not an infection; symptom
  observation and diagnosis belong to P6.
- Not transferable between rooms, stages, or cycles.

**Next observation:** repeat in late flower, the stage where the constraint binds hardest,
and again after any equipment or canopy change.
