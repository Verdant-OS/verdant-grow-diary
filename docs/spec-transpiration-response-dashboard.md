# Spec: Transpiration Response Dashboard

## Feature Summary

**Feature ID:** transpiration-response-dashboard

**Proposed dashboard name:** Transpiration Response

**Renaming decision:** Use "Transpiration Response" or "Water Movement Response" for v1. Do **not** use "Transpiration Efficiency" because true efficiency implies biomass or yield per unit water used — a metric Verdant does not yet measure. The v1 dashboard focuses on **response** (how water moves out of the system under atmospheric demand), not **efficiency**.

**Status:** Spec-only. No implementation work may begin until the instrumented-tent data layer and cultivation review (`docs/cultivation-review-size-proxy-vpd-demand.md`) are complete.

**Decision record:** `docs/decision-record-size-proxy-vpd-demand.md`

---

## Product Goal

Help growers in instrumented tents understand how their plants respond to atmospheric demand by comparing water loss / dryback behavior against VPD over time.

The dashboard answers:

- How much water is the plant/system losing per unit of VPD?
- Is the water movement response stable, increasing, or decreasing?
- Are there windows where response dropped despite high VPD (possible stomatal closure, overwatering, or root stress)?
- Is the data reliable enough to act on, or is it missing / stale / invalid?

This is an **observation and advisory** tool, not a control system.

---

## Target Users

| User type | Why they care | V0 / V1 access |
|-----------|-------------|----------------|
| Home growers with load cells | Want to validate dryback schedules and correlate plant behavior with environment. | V1 — instrumented tent. |
| Commercial / craft cultivators | Need repeatable dryback data across runs and phenotypes. | V1 — instrumented tent. |
| Advanced hobbyists without load cells | May see the dashboard as a "coming soon" or "instrumented tent only" upsell. | V0 — insufficient data state. |
| Beginner growers | Likely do not have load cells. Should see a clear "insufficient data" state with explanation. | V0 — insufficient data state. |

---

## Required Data

| Data source | V1 requirement | Notes |
|-------------|--------------|-------|
| Plant / tent / stage mapping | Required | Links dryback data to the correct plant and current stage. |
| VPD history | Required | Computed from temperature + RH over the same windows as weight data. |
| Measured weight or load-cell readings | Required | The core input for water-loss calculation. Must be real measured data. |
| `captured_at` timestamps | Required | Every weight reading and environmental reading must have a reliable timestamp. |
| Irrigation event timestamps | Required | Needed to define dryback windows (start = post-irrigation weight, end = pre-next-irrigation weight). |
| Data source and confidence | Required | Label each reading as `load_cell`, `manual_weigh`, or `soil_moisture_proxy`. |
| Stale / invalid handling | Required | Missing, stale, or out-of-range data must be excluded from calculations and surfaced to the user. |

---

## Metric Definitions

### Primary v1 Metric: Water Movement Response

| Field | Value |
|-------|-------|
| Internal name | `water_loss_rate_per_vpd` |
| Display label | Water movement response |
| Unit | g/h/kPa |
| Formula | `grams_lost_per_hour / average_vpd_kpa` over a defined dryback window |
| Window definition | Post-irrigation to pre-next-irrigation, or a fixed rolling window if irrigation events are not logged |

**Calculation details:**

1. Identify a dryback window:
   - Start weight = weight immediately after irrigation (or first reading post-irrigation).
   - End weight = weight immediately before next irrigation (or last reading before next irrigation).
   - If irrigation events are not logged, fall back to a fixed rolling window (e.g., 24 h) with a clear "irrigation events not logged" disclaimer.
2. Compute `grams_lost` = start weight − end weight.
3. Compute `hours_elapsed` = end timestamp − start timestamp.
4. Compute `grams_lost_per_hour` = `grams_lost / hours_elapsed`.
5. Compute `average_vpd_kpa` = average VPD over the same window.
6. Compute `water_loss_rate_per_vpd` = `grams_lost_per_hour / average_vpd_kpa`.

**Edge cases:**

- If `grams_lost` ≤ 0, flag as "no net loss or weight gain — possible irrigation event not captured, or sensor drift."
- If `average_vpd_kpa` ≤ 0 or is `null`, flag as "invalid VPD — cannot compute response."
- If the window contains fewer than N weight readings (threshold TBD by cultivation), flag as "insufficient data."

---

## Confidence Rules

| Data quality | Confidence label | Used in primary metric? | Display treatment |
|--------------|------------------|------------------------|-------------------|
| Load-cell weight, daily or better, calibrated | High | Yes | Solid line / full opacity |
| Manual weight (grower-entered) | Medium | Yes | Dashed line / medium opacity |
| Soil moisture proxy | Low | No — supporting context only | Dotted line / low opacity, with "low confidence" badge |
| No weight / dryback data | Insufficient data | No | Grayed-out state, "insufficient data" message |
| Stale weight (> threshold) | Stale | No | Excluded from calculation, flagged in UI |
| Invalid weight (negative, jump, stuck) | Invalid | No | Excluded from calculation, flagged in UI |

**Confidence is computed per window, not per reading.** A window that mixes high and medium confidence readings defaults to the lower confidence.

---

## v1 Dashboard Layout

### Header

| Element | Content |
|---------|---------|
| Dashboard name | Transpiration Response |
| Plant / phenotype | [Plant name] / [Phenotype name] |
| Stage | [Current stage] |
| Date range | [Start date] – [End date] (default: last 7 days) |
| Data confidence | [High / Medium / Low / Insufficient data] |

### Summary Cards

| Card | Content |
|------|---------|
| Current water movement response | Value in g/h/kPa + confidence badge |
| 7-day trend | Arrow + % change vs previous 7-day window, or "insufficient data" |
| Data confidence | Overall confidence for the current view + breakdown by source |
| Missing inputs / risk | Callouts for missing irrigation events, stale weight, missing VPD, etc. |

### Main Chart: Water Movement Response Over Time

| Element | Behavior |
|---------|----------|
| X-axis | Time (date) |
| Y-axis | Water movement response (g/h/kPa) |
| Series | Daily or per-window response score |
| Rolling average | Optional 3-day or 7-day rolling average (dashed line) |
| Stage markers | Vertical markers at stage transitions, if available |
| Confidence bands | Shaded region or opacity change where confidence is low |
| Tooltips | Value, confidence, window start/end, average VPD, grams lost |

### Scatter Plot: Response vs VPD

| Element | Behavior |
|---------|----------|
| X-axis | Average VPD (kPa) for the window |
| Y-axis | Water movement response (g/h/kPa) |
| Points | One point per dryback window |
| Point confidence | Color or opacity indicates confidence (high = dark/solid, low = light/dashed) |
| Trend line | Optional linear regression if ≥ N points |
| Tooltips | Value, confidence, stage, window dates |

### Recent Windows Table

| Column | Content |
|--------|---------|
| Window | Start date – End date |
| Irrigation / Dryback | Post-irrigation to pre-next-irrigation, or "rolling window" |
| Average VPD | Average VPD over the window (kPa) |
| Water loss rate | Grams lost per hour (g/h) |
| Response score | Water movement response (g/h/kPa) |
| Confidence | High / Medium / Low / Insufficient |
| Notes link | Link to related Quick Log or observation, if available |

### Disclosure Banner

> This dashboard uses measured historical dryback and weight data. It is not live telemetry. It does not create actions, alerts, or device commands automatically. All recommendations require grower review and approval.

---

## Out-of-Scope Items (Parked)

| Item | Why parked | Revisit condition |
|------|-----------|-------------------|
| AI insights | No validated model yet. Risk of overconfident advice. | After instrumented-tent validation shows repeatable patterns. |
| Target-setting actions | Too close to automation. Needs grower trust first. | Explicit future task with approval-required design. |
| Alerts | No validation data to set reliable thresholds. | After baseline data exists across multiple grows. |
| Action Queue suggestions | Advisory-only in v1. No automatic action creation. | Explicit future task with cultivation sign-off. |
| Phenotype baselines across last 3 grows | Requires multi-run data history. | After growers have completed 3+ runs with instrumented data. |
| Heatmaps | Visual complexity not justified without validated data. | After v1 proves useful. |
| Leaf area via imaging | Requires photo segmentation pipeline. | After canopy imaging pipeline is built and validated. |
| Soil-moisture-led recommendations | Sensor reliability unproven. | After per-grow calibration shows consistent correlation. |
| Automation / device control | Safety boundary. Never in v1. | Explicit future phase with full safety review. |

---

## Safety Rules

1. **No fake live data.** If weight or VPD is missing, stale, or invalid, the dashboard must show "insufficient data" — never interpolate, back-fill, or synthesize.
2. **No inferred plant weight unless explicitly marked.** If weight must be estimated, label it `estimated` or `manual_approximation`. Never present estimated weight as measured.
3. **No aggressive irrigation, nutrient, or equipment recommendations from weak evidence.** If response dropped but data is sparse, the message should be "monitor" or "log more data," not "increase runoff."
4. **No alerts or Action Queue items from this dashboard in v1.** The dashboard is read-only advisory.
5. **Grower approval remains required.** Any future automation path must go through the existing approval-required Action Queue.
6. **Missing / stale / invalid weight or VPD data must show insufficient data.** A dashboard with bad data is worse than no dashboard.
7. **Soil moisture may only be supporting low-confidence context.** It must never be the sole driver of a response calculation or recommendation.
8. **Suspicious soil values (0 %, 100 %) must be flagged, not trusted.** These are invalid, not "very dry" or "saturated."
9. **The dashboard must not classify unknown telemetry as healthy.** "Healthy" is a positive claim requiring fresh, valid, in-range data.

---

## Decision Gates Before Implementation

| Gate | Status | Criteria |
|------|--------|----------|
| Load-cell availability | **Open** | Confirm whether target grows have load cells installed. |
| Load-cell cadence | **Open** | Confirm required cadence (daily or better recommended). |
| Weight scope | **Open** | Confirm whether weight is per-plant, per-container, per-bench, or per-room. |
| Irrigation event source | **Open** | Confirm where irrigation timestamps come from (manual Quick Log, sensor, bridge, etc.). |
| Stage taxonomy | **Open** | Confirm approved stage taxonomy with cultivation (`docs/cultivation-review-size-proxy-vpd-demand.md`). |
| VPD bands | **Open** | Confirm cultivation-approved VPD bands per stage. |
| Staleness threshold | **Open** | Confirm acceptable staleness for weight data in calculations. |
| Soil moisture proxy | **Open** | Confirm whether soil moisture is included in v1 or parked for later. |

---

## Tests Required Before Implementation

1. **Water loss calculation accuracy.** Given start weight, end weight, and window duration, compute `grams_lost_per_hour` correctly.
2. **VPD averaging.** Given a window of temp/RH readings, compute average VPD correctly.
3. **Response score accuracy.** Given `grams_lost_per_hour` and `average_vpd_kpa`, compute `water_loss_rate_per_vpd` correctly.
4. **Bad data rejection.** Windows with ≤0 grams lost, null VPD, or fewer than N readings must be flagged, not computed.
5. **Stale data rejection.** Weight readings older than the configured threshold must be excluded from window calculations.
6. **Confidence labeling.** A window with load-cell data must be labeled high. A window with manual weight must be labeled medium. A window with soil moisture only must be labeled low and not used in the primary metric.
7. **No Action Queue writes.** Static scan and runtime test must prove this module cannot write to `action_queue`.
8. **No alert creation.** Static scan and runtime test must prove this module cannot create alerts.
9. **No device control imports.** Static scan must prove no device-control or automation modules are imported.
10. **Deterministic behavior.** Same inputs must produce same outputs. No randomness.
11. **Disclosure banner presence.** UI test must prove the disclosure banner renders on every view.
12. **Insufficient data state.** UI test must prove the dashboard shows "insufficient data" when weight or VPD is missing.

---

## Remaining Open Questions

1. Do any target grows currently have load cells, and what is the update cadence?
2. Is the weight measurement per plant, per container, per bench, or per room?
3. Is irrigation/fertigation weight included, and how is tare handled?
4. What is the cultivation-approved VPD band for each stage?
5. Should `transition` remain a distinct stage or merge into `early_flower`?
6. What is the acceptable staleness threshold for weight data (12 h? 24 h? 48 h?)?
7. Where do irrigation event timestamps come from — manual Quick Log, sensor, or bridge?
8. Should soil moisture be included in v1 at all, or parked entirely?
9. What is the minimum number of weight readings per window before a response score is computed?
10. Should the rolling average be 3-day or 7-day by default?
11. Should phenotype baselines be computed automatically, or is that a v2 feature?
12. How should the dashboard behave when a grower has multiple plants in one tent with shared load-cell data?

---

## Document Control

| Field | Value |
|-------|-------|
| Document | Spec: Transpiration Response Dashboard |
| Feature ID | transpiration-response-dashboard |
| Decision record | `docs/decision-record-size-proxy-vpd-demand.md` |
| Cultivation review | `docs/cultivation-review-size-proxy-vpd-demand.md` |
| Version | 1.0 |
| Created | 2026-06-13 |
| Last updated | 2026-06-13 |
| Owner | Product + Engineering |
| Approved by | *(awaiting cultivation review)* |
