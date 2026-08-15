# Asset 4 — Airflow and microclimate map

**Revision** r1 · 2026-08-15 · **Risk** R1 · **Claims** C01, C03 · **Licence** repository

**Accessibility note.** The map is a **written grid**, not a drawing: positions are cell
references (A1, A2, B1 …) defined in prose, and every observation is a table row. A screen
reader can traverse it in full. Any rendered heat-map added later must reproduce this table.

---

## Why a map instead of a reading

An average describes no plant. A room with a real gradient has plants living at the extremes,
and the mean is the one value at which nothing is actually growing. **The output of this
asset is the spread and the location of the extremes, not a room number.**

## Define your grid first

Divide the canopy into cells and name them in writing. **This asset sets no sourced minimum
grid size** — no claim in §8 establishes one. The 3 × 3 layout below is an illustrative
template choice, not a threshold; what matters is whether your cells are fine enough to catch
the gradients your room actually has, which you learn by mapping and then refining where the
differences turn up.

**Columns (left→right, facing the room from the door):** A, B, C …
**Rows (front→back):** 1, 2, 3 …
**Heights sampled:** canopy top / mid-canopy / below canopy — record which.

> **Written locator convention:** `B2-mid` means column B, row 2, mid-canopy height. Define
> any deviation from this in the notes.

## Survey conditions (record before starting)

| Field                                    | Value |
| ---------------------------------------- | ----- |
| Room / tent                              |       |
| Date / time started                      |       |
| Light state (on / off / transition)      |       |
| Minutes since last light-state change    |       |
| All equipment in normal operating state? |       |
| Doors opened during survey? (y/n)        |       |
| Instrument(s) used + accuracy            |       |
| Recorded by                              |       |

**Survey the whole grid in one pass, quickly.** A slow survey measures time as much as
position.

## Grid record

| Cell | Height | Temp (°C) | RH (%) | Airflow observation | Notes |
| ---- | ------ | --------- | ------ | ------------------- | ----- |
| A1   |        |           |        |                     |       |
| A2   |        |           |        |                     |       |
| A3   |        |           |        |                     |       |
| B1   |        |           |        |                     |       |
| B2   |        |           |        |                     |       |
| B3   |        |           |        |                     |       |
| C1   |        |           |        |                     |       |
| C2   |        |           |        |                     |       |
| C3   |        |           |        |                     |       |

**Airflow observation** without an anemometer: use a light indicator (a ribbon, a length of
thread, or smoke where safe) and record one of — `still` (indicator hangs), `gentle`
(indicator lifts and drifts), `moderate` (indicator holds a steady angle), `strong`
(indicator snaps taut, leaves moving continuously). **This is an ordinal observation, not a
velocity.** Record it as such; do not convert it to m/s.

## Vertical profile (one column, all heights)

Vertical gradients are the ones most often missed, because the probe lives at one height.

| Height                  | Temp (°C) | RH (%) |
| ----------------------- | --------- | ------ |
| Just below canopy       |           |        |
| Mid-canopy              |           |        |
| Just above canopy       |           |        |
| Ceiling / fixture level |           |        |

## Findings

| Metric                             | Value | Cell(s) |
| ---------------------------------- | ----- | ------- |
| Warmest cell                       |       |         |
| Coolest cell                       |       |         |
| **Temperature spread (max − min)** |       |         |
| Most humid cell                    |       |         |
| Driest cell                        |       |         |
| **RH spread (max − min)**          |       |         |
| Cells recorded `still`             |       |         |
| Vertical temperature spread        |       |         |

## Interpretation rules

- **Judge a difference against repeatability, not absolute accuracy.** A stable calibration
  bias shifts every reading the same way, so **it cancels when you compare two readings from
  the same instrument** — a repeatable ±0.5 °C probe can resolve a real 0.3 °C difference
  perfectly well. Absolute accuracy governs "what is the true value here"; **repeatability,
  drift over the survey, and any room change during it** govern "is this difference real."
  - **One instrument, walked around:** compare against its **repeatability** (plus any drift
    over the time the survey took).
  - **Two or more fixed instruments:** their biases do **not** cancel — combine their
    individual uncertainties (in quadrature if independent) and compare against that.
  - Where a datasheet gives no repeatability figure, **record that absence**; you then cannot
    state how small a difference you can resolve.
- **A `still` cell is a finding, not a gap.** Stagnant pockets are where boundary-layer and
  condensation problems begin.
- **A single probe's reading is now interpretable.** Note which cell your fixed probe sits
  in and how far that cell is from the extremes — that difference is the correction you have
  been unknowingly applying to every historical reading.

| Question                                                        | Answer |
| --------------------------------------------------------------- | ------ |
| Which cell does the room's fixed probe occupy?                  |        |
| How far is it from the warmest cell (°C)?                       |        |
| How far from the most humid (%RH)?                              |        |
| Does the fixed probe over- or under-report the canopy extremes? |        |

## What not to conclude

- Not a fan prescription. This asset locates a problem; it does not specify equipment.
- Not a one-time result. Re-map when the canopy closes, when equipment moves, and at stage
  transitions — a map of an open canopy does not describe a closed one.
- Not a target. No cell value here is compared against a band.

**Next observation:** re-map at the next stage transition, and immediately after any change
to fan placement, canopy height, or plant spacing.
