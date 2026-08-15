# Asset 7 — Lights-off transition timeline

**Revision** r1 · 2026-08-15 · **Risk** R2 · **Claims** C01, C03, C05, C09 · **Licence** repository

**Accessibility note.** A time-indexed table, no image. Each row is one observation; the
"chart" is the table itself.

---

## The window this asset captures

**This asset records what happens after lights-off; it does not explain it.** Rooms commonly
behave differently in that window than during the light period, and a daily average hides the
difference entirely — so the window is worth measuring on its own terms.

> **Why the explanation is not here.** The mechanism usually offered — that cooling-driven
> dehumidification loses capability as sensible load falls — is claim **C08**, which the
> pillar classifies **R3** and marks **blocked** (trade press only, below the evidence tier).
> Stating it here would import a blocked R3 claim into an R2 asset and let it bypass the
> qualified-safety lane. **Capacity interpretation belongs in asset 6**, which carries the
> pending-safety banner. This asset stays a neutral observation template.

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
- **_Botrytis_ prefers cool.** Extension guidance puts infection risk at **65–75 °F** with
  high humidity and free water on surfaces [claim C09, source **S6a**, read at source —
  **hemp, greenhouse-framed**, so treat as risk direction, not an indoor setpoint]. The
  post-lights-off window is cool _and_ humid at the same time. **A narrower optimum is quoted
  in the wider extension literature; the value is withheld here because its source (S6b) has
  not been read** — see the §8 source register. Do not reinstate it from memory or from a
  secondary summary.

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

**Record at least one full cycle at the stage you are actually concerned about**, and repeat
across stages if you want to compare them. **This asset does not tell you which stage binds**
— that is capacity interpretation derived from C08, which the pillar classifies R3 and marks
blocked, and it belongs in asset 6.

## Timeline

**First run: record through the entire lights-off period**, not to a fixed cut-off — you are
locating your peak, and a template that stops early will report a peak that is merely the
last point you measured. Rows below run to +120 minutes as a **starting scaffold — an
illustrative layout choice, not a sourced interval; no claim in §8 establishes one**; **add
rows to the end of your dark period** and keep going until RH has clearly turned and
recovered.
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

- **Judge a difference against the uncertainty OF THE DIFFERENCE — which is bigger than one
  reading's.** A stable calibration bias shifts every reading the same way, so **it cancels
  when you compare two readings from the same instrument**. The _random_ part does not: it
  appears at **both** endpoints, so

  ```text
  u_difference = sqrt(u₁² + u₂²) = √2 · u      for equal repeatability u
  ```

  **A ±0.5 °C repeatability therefore does not resolve a 0.3 °C difference** — the difference
  carries ≈0.71 °C (1σ), and ≈1.41 °C at k = 2. An earlier revision of these assets claimed
  the opposite; it was wrong and is corrected here.
  - **Best practice: measure it empirically.** Take repeated readings of the _same_ spot
    without moving anything, and look at the spread of the differences. That distribution is
    your real resolving power and needs no distributional assumption.
  - **One instrument, moved:** bias cancels; combine the two repeatability contributions as
    above, and add any drift across the hours the timeline spans.
  - **Two or more fixed instruments:** biases do **not** cancel — combine their full
    uncertainties, not just repeatability.
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

**Next observation:** repeat at each stage you want to compare, and again after any equipment
or canopy change. Which stage turns out to be the hardest is a finding of your own data, not
an assumption this asset supplies.
