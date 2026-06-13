# Spec: Transpiration Response Calculation Rules

**Feature ID:** transpiration-response-dashboard  
**Related docs:**
- `docs/decision-record-size-proxy-vpd-demand.md`
- `docs/cultivation-review-size-proxy-vpd-demand.md`
- `docs/spec-transpiration-response-dashboard.md`

**Status:** Parked — awaiting instrumented-tent data availability and cultivation sign-off.  
**Scope:** Documentation / calculation contract only. No production code, schema, UI, or automation.

---

## Dryback Window Definition

A dryback window is the bounded period over which water loss is measured.

### Start of window
- An irrigation, fertigation, or watering event timestamp.
- A confirmed post-irrigation weight baseline (stable reading after runoff has finished).
- A manual grower-entered reset event.

### End of window
- The next irrigation / fertigation / watering event.
- A manual reset or harvest event.
- The latest valid weight reading if no subsequent irrigation exists.

### Insufficient-data conditions for boundaries
- No irrigation or baseline event is identifiable.
- A subsequent irrigation timestamp is missing and no explicit end-of-window policy exists.
- The grower confirms boundaries are unclear.
- In all unclear-boundary cases, the window is marked `insufficient data` and no rate is computed.

---

## Required Inputs Per Window

| Field | Required | Description |
|-------|----------|-------------|
| `plant_id` or `tent_id` | Yes | Which scope the window belongs to. |
| `stage` | Yes | Canonical plant stage during the window. Must be explicit. |
| `start_time` | Yes | ISO-8601 timestamp of window start. |
| `end_time` | Yes | ISO-8601 timestamp of window end. |
| `start_weight_g` | Yes | Weight in grams at start of window (post-irrigation baseline). |
| `end_weight_g` | Yes | Weight in grams at end of window. |
| `vpd_readings` | Yes | Array of VPD readings (kPa) captured inside the window. |
| `data_source` | Yes | `load_cell`, `manual_weight`, `soil_moisture_proxy`, etc. |
| `confidence_source` | Yes | `high`, `medium`, `low`, or `insufficient` based on source and coverage. |
| `stale_flags` | Yes | Whether weight or VPD data has passed staleness thresholds. |
| `invalid_flags` | Yes | Whether any input failed validation (null, NaN, out of range, future timestamp). |

---

## Primary Metric: `water_loss_rate_per_vpd`

### Step-by-step computation

1. **Water loss**
   ```
   water_loss_g = start_weight_g - end_weight_g
   ```

2. **Duration**
   ```
   duration_hours = end_time - start_time   (in hours, > 0)
   ```

3. **Water-loss rate**
   ```
   water_loss_rate_g_per_h = water_loss_g / duration_hours
   ```

4. **Average VPD**
   ```
   average_vpd_kpa = mean of all valid VPD readings inside the window
   ```

5. **Transpiration-response rate**
   ```
   water_loss_rate_per_vpd = water_loss_rate_g_per_h / average_vpd_kpa
   ```
   - **Unit:** g/h/kPa
   - **Interpretation:** How many grams of water the plant (or container) loses per hour per kPa of atmospheric demand.

### Guardrails

| Condition | Result |
|-----------|--------|
| `end_weight_g >= start_weight_g` | Invalid unless explained by a known irrigation/top-off event inside the window. If unexplained, mark `invalid` with reason. |
| `duration_hours <= 0` | Invalid. Negative or zero duration makes rate meaningless. |
| `average_vpd_kpa` missing, zero, or outside realistic range (e.g., < 0.1 kPa or > 5.0 kPa) | Insufficient data. |
| Fewer than 2 valid weight readings | Insufficient data. |
| VPD coverage too sparse (e.g., < 1 reading per 4 hours over a 24 h window) | Low confidence or insufficient, depending on policy. |
| Weight data stale (exceeds configured staleness threshold) | Mark `stale` or `insufficient` depending on threshold. |
| Soil moisture used as the primary weight proxy | Confidence forced to `low`; metric must carry `proxy` label. |

---

## Confidence Model

| Tier | Source requirements | Boundary clarity | VPD coverage |
|------|---------------------|------------------|--------------|
| **High** | Load-cell weight with known tare | Clear start/end boundaries | ≥ 1 reading per 2 hours across the window |
| **Medium** | Manual weight entry by grower | Clear start/end boundaries | ≥ 1 reading per 4 hours across the window |
| **Low** | Soil moisture proxy or sparse VPD | Boundaries known but data sparse | < 1 reading per 4 hours, or soil-moisture-derived |
| **Insufficient** | Missing weight / dryback data, missing VPD, invalid window, stale data beyond threshold | Unclear or disputed boundaries | No coverage or entirely stale |

Confidence is the **minimum** of (source confidence, boundary clarity, coverage confidence). A load-cell window with sparse VPD cannot be `high`.

---

## Stage Handling

- `stage` must be explicit for every window.
- If the stage changes inside the window, the window is either:
  - **Split** at the stage-change timestamp into two sub-windows, or
  - **Marked** as `mixed-stage` with lower confidence.
- `mixed-stage` windows cannot be used for stage-comparative analysis without explicit grower review.
- Unknown or uncanonical stage → `insufficient data`.

---

## Soil Moisture Proxy Rules

1. Soil moisture **cannot** produce `water_loss_rate_per_vpd` directly.
2. It may produce a separate, explicitly labeled metric: `moisture_response_proxy`.
3. Any output derived from soil moisture must:
   - Carry confidence `low`.
   - Be labeled `proxy`.
   - Not be compared 1:1 with load-cell-derived `water_loss_rate_per_vpd`.
4. Suspicious values:
   - `0 %` or `100 %` → flagged suspicious, marked invalid for that reading, and noted in warnings.
5. Calibration requirements:
   - Media type (soil, coco, rockwool).
   - Pot size / container geometry.
   - Sensor depth and placement.
   - Without per-grow calibration, soil-moisture data is treated as uncalibrated and low-confidence.

---

## Output Shape (Future Pure Helper)

This is the intended return shape of a future pure calculation helper. It is **not** a schema or table definition.

```ts
interface TranspirationWindowResult {
  windowId: string;               // stable UUID for the window
  plantId: string;                // plant scope
  tentId: string;                 // tent scope
  stage: string;                  // canonical stage
  startTime: string;              // ISO-8601
  endTime: string;                // ISO-8601
  durationHours: number;          // > 0
  waterLossG: number;             // grams
  waterLossRateGPerH: number;     // g/h
  averageVpdKpa: number;          // kPa
  waterLossRatePerVpd: number;    // g/h/kPa (primary metric)
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  confidenceReasons: string[];    // human-readable list of confidence factors
  status: 'valid' | 'invalid' | 'insufficient';
  warnings: string[];             // e.g., "VPD coverage sparse", "Mixed stage"
  sourceSummary: {
    weightSource: 'load_cell' | 'manual' | 'soil_moisture_proxy' | 'none';
    vpdReadingsCount: number;
    vpdCoverageHours: number;    // how many hours had at least one VPD reading
    staleDataFlag: boolean;
    invalidDataFlag: boolean;
    soilMoistureProxyUsed: boolean;
  };
}
```

---

## Safety Rules

1. **Never classify missing, stale, or invalid data as healthy.**  
   Absence of a valid window is itself information. Show "insufficient data" instead of synthesizing a score.
2. **Never infer live plant status from historical windows.**  
   A historical window describes past behavior, not current health.
3. **Never create alerts or Action Queue items from this calculation in v1.**  
   The calculation is advisory and read-only. No automation handoff.
4. **Never control devices.**  
   No fan, humidifier, irrigation, or light changes are triggered by this metric.
5. **Never recommend aggressive irrigation or environmental changes from low-confidence data.**  
   If confidence is `low` or `insufficient`, the output must say "monitor" or "insufficient data," never "increase irrigation now."
6. **Never present estimated or proxy data as measured.**  
   Soil-moisture-derived outputs must always carry the `proxy` label.
7. **Never mix demo data with real data in the same window.**  
   Demo windows must be tagged `demo` and excluded from live KPIs.

---

## Tests Required Before Implementation

Before any production code is written, the following tests must pass:

1. **Valid load-cell window** — happy path with clean boundaries and dense VPD.
2. **Valid manual-weight window** — medium confidence, clear boundaries.
3. **Missing VPD** — returns `insufficient` with correct reason.
4. **Zero or invalid VPD** — rejects unrealistic values (≤ 0, > 5 kPa).
5. **Stale weight** — flags stale and returns `insufficient` or `low` depending on threshold.
6. **Negative or zero duration** — returns `invalid`.
7. **End weight ≥ start weight (unexplained)** — returns `invalid`.
8. **Sparse VPD coverage** — low confidence or insufficient depending on threshold.
9. **Mixed-stage window** — lower confidence, includes `mixed-stage` warning.
10. **Soil moisture proxy** — output carries `proxy` label and `low` confidence.
11. **Suspicious soil moisture (0 % / 100 %)** — flagged suspicious, reading marked invalid.
12. **Static guard: no alert creation** — static scan proves this module cannot create alerts.
13. **Static guard: no Action Queue writes** — static scan proves this module cannot write to Action Queue.
14. **Static guard: no device-control imports** — static scan proves no automation or device-control modules are imported.

---

## Decision Dependencies

This spec cannot be implemented until the following are resolved:

- Load-cell availability and cadence (see `docs/cultivation-review-size-proxy-vpd-demand.md`).
- Cultivation-approved VPD bands per stage.
- Cultivation-approved stage taxonomy.
- Acceptable staleness threshold for weight data.
- Irrigation timestamp source (manual entry, sensor trigger, or inferred).

---

## Document Control

| Field | Value |
|-------|-------|
| Document | Spec: Transpiration Response Calculation Rules |
| Feature ID | transpiration-response-dashboard |
| Related dashboard spec | `docs/spec-transpiration-response-dashboard.md` |
| Version | 1.0 |
| Created | 2026-06-13 |
| Last updated | 2026-06-13 |
| Owner | Engineering + Cultivation lead |

