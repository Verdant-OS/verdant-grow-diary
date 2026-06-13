# Decision Record: Size-Proxy / VPD Demand

## Feature Name

size-proxy-vpd-demand

## Product Goal

Estimate plant demand or environmental stress using plant stage, VPD, and a plant size proxy. This is **not** a control system. It is an advisory layer that helps growers understand whether their environment matches the likely transpiration demand of the plant at its current size and stage.

## Required Inputs

| Input | V0 mode | Instrumented-tent mode | Notes |
|-------|---------|------------------------|-------|
| Plant stage | Required | Required | Must be a known canonical stage (see `vpd-stage-vocabulary.md`). |
| Temperature | Required | Required | Air temperature in °C. |
| Relative humidity | Required | Required | Used to compute VPD. |
| VPD | Computed | Computed | Derived from temp + RH. Must use stage-specific bands, not one universal target. |
| Recent logs | Required | Required | Watering, feeding, and observation context from Quick Log / Timeline. |
| Manual observations | Required | Required | Grower-entered observations, photos, and context. |
| Plant weight (`plant_weight_kg`) | Not used | Required | Only when real load-cell or manual weight data exists. |
| Load-cell cadence | Not used | Required | Daily or better. Less than daily → do not treat weight as reliable. |
| Soil moisture | Not used | Optional, low-confidence | May be used as supplementary context only. Never as primary driver in V0. |

## Known Risks

1. **Inferred plant weight.** Estimating plant weight from photos, height, or assumed growth curves is unreliable and can create false confidence. If weight is inferred, it must be explicitly labeled `estimated` or `manual_approximation`.
2. **Soil moisture as primary driver.** Soil moisture sensors vary wildly in calibration, placement, and plant-to-plant correlation. Treating them as primary demand signals risks over-watering or under-watering recommendations.
3. **One universal VPD target.** Using a single VPD target across all stages ignores the real physiological differences between seedling, veg, and flower. This can misclassify healthy environments as stressed.
4. **Missing stage context.** If the grower has not set or updated the plant stage, any demand estimate is meaningless. Unknown stage must yield "insufficient data," not a guess.
5. **Stale or bad telemetry.** A stuck humidity sensor (0 % or 100 %) or a disconnected probe would produce absurd VPD values. The feature must flag these, not treat them as healthy.
6. **Automation drift.** Even advisory features can create pressure toward automation. This feature must not write to Action Queue, create alerts, or control devices without explicit future approval.

## Decision Gates

| Gate | Status | Blocker / Criteria |
|------|--------|-------------------|
| Load-cell availability | **Open** | Confirm whether target grows have load-cell data and the expected cadence (daily or better). If yes, proceed to instrumented-tent mode. If no, stay in V0 mode and park weight-based logic. |
| Default size_proxy | **Open** | Confirm that `plant_weight_kg` is the default size proxy only when real weight data exists. Do not default to estimated weight. |
| Stage taxonomy + VPD bands | **Open** | Confirm Verdant stage taxonomy and stage-specific VPD band width with cultivation lead. Current draft: `seedling`, `vegetative`, `transition`, `flower_early`, `flower_mid`, `flower_late`. |
| Soil moisture confidence | **Open** | Decide whether lower-confidence soil-moisture logic is included in v1 or parked for later. Default: park until sensor reliability is proven. |

## Recommended V0 Mode

- **Inputs:** stage + temp + RH + VPD + recent logs + manual observations
- **Behavior:** Advisory only. No Action Queue writes. No alerts. No device control.
- **Output:** A contextual demand assessment (e.g., "High transpiration demand — plant is in late flower with low VPD. Consider increasing airflow or checking for over-watering.") with confidence level and missing-info callouts.
- **Size proxy:** None. V0 does not use size proxy because weight data is not confirmed available.

## Recommended Instrumented-Tent Mode

- **Gate:** Load-cell data exists and is updated daily or better.
- **Inputs:** stage + temp/RH/VPD + `plant_weight_kg` from load-cell or manual weighing + optional soil moisture as low-confidence context.
- **Behavior:** Advisory only. Demand estimate may reference weight trend (e.g., "Weight gain slowed while VPD rose — possible water stress or nutrient lockout").
- **Size proxy:** `plant_weight_kg` only.
- **Soil moisture:** Displayed as supplementary context with explicit "low confidence" label.

## Parked Items

| Item | Reason | Revisit Condition |
|------|--------|-------------------|
| Leaf-area index / imaging-based size proxy | Requires photo segmentation or canopy imaging pipeline not yet built. | When a reliable, calibrated imaging pipeline exists and is validated against known weights. |
| Soil moisture as primary demand driver | Sensor reliability unproven across pot types, mediums, and cultivars. | When soil moisture sensors are calibrated per-grow and show consistent correlation with plant behavior. |
| Automated watering / irrigation suggestions | Too close to device control for V0. Safety boundary. | Explicit future task with approval-required Action Queue design. |
| Alert generation from demand model | No validation data yet. Risk of false positives. | After instrumented-tent validation shows repeatable, actionable correlation. |

## Safety Rules

1. **No fake live data.** If a reading is missing, stale, or invalid, the UI must say so. Do not interpolate or back-fill.
2. **No inferred plant weight unless explicitly marked.** If weight must be estimated, label it `estimated` or `manual_approximation`. Never present estimated weight as measured.
3. **No aggressive recommendations from weak evidence.** If VPD is slightly off but logs show stable growth, the response should be "monitor" rather than "change now."
4. **No alerts or Action Queue items from this model until validation exists.** The feature must remain advisory-only.
5. **Grower approval remains required.** Any future automation path must go through the existing approval-required Action Queue.
6. **Bad, missing, stale, or suspicious telemetry must not be classified as healthy.** A VPD of 3.2 kPa with 0 % RH is invalid, not "very dry."
7. **Soil moisture cannot be the primary driver until reliability is proven.** It may be shown as context; it must not trigger recommendations on its own.
8. **This feature must not control devices.** No fan speed, humidity, irrigation, or light changes.

## Tests Required Before Implementation

1. **VPD computation accuracy.** Given temp + RH, compute VPD correctly across the full expected range.
2. **Stage-specific band evaluation.** Each canonical stage must have its own band. Unknown stage must return "insufficient data."
3. **Bad telemetry rejection.** Inputs with 0 % RH, 100 % RH, 0 °C, or missing temp must be flagged invalid, not processed.
4. **Stale data rejection.** Readings older than the configured staleness threshold must be excluded from demand estimates.
5. **No Action Queue writes.** Static scan and runtime test must prove this module cannot write to `action_queue`.
6. **No alert creation.** Static scan and runtime test must prove this module cannot create alerts.
7. **No device control imports.** Static scan must prove no device-control or automation modules are imported.
8. **Estimated weight labeling.** If an estimated-weight path exists, tests must prove the output carries the `estimated` flag.
9. **Soil moisture confidence gating.** If soil moisture is passed, tests must prove it is treated as low-confidence and cannot be the sole driver of a recommendation.
10. **Deterministic behavior.** Same inputs must produce same outputs. No randomness.

## Remaining Open Questions

1. Do any target grows currently have load-cell data? If so, what is the update cadence?
2. Is `plant_weight_kg` the right default size proxy, or should it be `canopy_height_cm` when weight is unavailable?
3. Should the canonical stage taxonomy include `transition` as a distinct stage, or merge it into `early_flower`?
4. What is the cultivation-approved VPD band for each stage? The current draft bands need cultivation sign-off.
5. Should soil moisture be excluded entirely from v1, or included with a mandatory "low confidence" disclaimer?
6. If load-cell data is missing, should the UI hide the demand panel entirely, or show it with a "insufficient data" state?
7. What is the acceptable staleness threshold for load-cell weight in demand calculations? 24 h? 48 h?

## Status

Parked. Awaiting load-cell availability confirmation and cultivation sign-off on stage taxonomy + VPD bands.

## Decision Owner

Product + Cultivation lead.

## Engineering Owner

Backend + Sensor lead.

## Last Updated

2026-06-13
