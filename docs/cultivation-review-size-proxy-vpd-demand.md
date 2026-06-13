# Cultivation Review: Size-Proxy / VPD Demand

## Feature Summary

**Feature:** size-proxy-vpd-demand

**Purpose:** Estimate plant demand or environmental stress using plant stage, VPD, and a plant size proxy. This is an **advisory-only** layer to help growers understand whether their environment matches the likely transpiration demand of the plant at its current size and stage.

**Status:** Awaiting cultivation review. No implementation work may begin until this worksheet is completed and signed off.

**Decision record:** `docs/decision-record-size-proxy-vpd-demand.md`

---

## Explicit Non-Goals

This worksheet covers what the feature **will not** do in V0 or v1. Mark each as reviewed.

| Non-goal | Description | Reviewed |
|----------|-------------|----------|
| **No automation** | This feature will not execute any device command, schedule, or control loop. | ☐ |
| **No device control** | No fan speed, humidity, irrigation, lighting, or dosing changes will be triggered by this model. | ☐ |
| **No alerts** | This feature will not create alert records or send notifications. | ☐ |
| **No Action Queue items** | This feature will not write suggested or required actions to the Action Queue. | ☐ |
| **No AI Doctor behavior changes** | AI Doctor may consume demand context if explicitly passed, but this feature does not modify AI Doctor rules or output contract. | ☐ |

---

## Stage Taxonomy Review

Current proposed taxonomy. Please confirm, reject, or rename each stage.

| Proposed stage | Cultivation-approved name? | Notes / changes |
|----------------|---------------------------|-----------------|
| `seedling` | ☐ Yes ☐ No ☐ Rename to: | |
| `vegetative` | ☐ Yes ☐ No ☐ Rename to: | |
| `transition` | ☐ Yes ☐ No ☐ Rename to: | |
| `flower_early` | ☐ Yes ☐ No ☐ Rename to: | |
| `flower_mid` | ☐ Yes ☐ No ☐ Rename to: | |
| `flower_late` | ☐ Yes ☐ No ☐ Rename to: | |

**Cultivation reviewer notes:**

*(free response)*

---

## VPD Band Review Table

Please provide the target and warning VPD bands (in kPa) for each approved stage.

| Stage | Target low kPa | Target high kPa | Warning low kPa | Warning high kPa | Notes |
|-------|---------------|-----------------|-----------------|------------------|-------|
| `seedling` | | | | | |
| `vegetative` | | | | | |
| `transition` | | | | | |
| `flower_early` | | | | | |
| `flower_mid` | | | | | |
| `flower_late` | | | | | |

**Cultivation reviewer notes:**

*(free response — e.g., strain-specific exceptions, autoflower considerations, dry-back targets)*

---

## Load-Cell Readiness Questions

These questions determine whether the instrumented-tent mode (plant weight + VPD) is viable.

### Availability

1. **Do target grows currently have load cells or scales installed?**
   - ☐ Yes — describe setup:
   - ☐ No
   - ☐ Planned — ETA:

2. **What cadence is weight data available?**
   - ☐ Real-time / continuous
   - ☐ Daily
   - ☐ Every 2–3 days
   - ☐ Weekly or less
   - ☐ Manual weigh-ins only

3. **Is the weight measurement per plant, per container, per bench, or per room?**
   - ☐ Per plant
   - ☐ Per container / pot
   - ☐ Per bench / tray
   - ☐ Per room / zone
   - ☐ Other:

4. **Is irrigation / fertigation weight included in the measurement?**
   - ☐ Yes — full system weight (plant + medium + reservoir)
   - ☐ Yes — but reservoir is tared separately
   - ☐ No — plant + medium only
   - ☐ Unknown / varies by grow

5. **How often is tare / zero-reset performed?**
   - ☐ At every reading
   - ☐ Daily
   - ☐ At stage change
   - ☐ At transplant
   - ☐ Ad-hoc / as needed
   - ☐ Never / no current process

6. **What is the acceptable staleness for weight data in a demand calculation?**
   - ☐ 12 hours
   - ☐ 24 hours
   - ☐ 48 hours
   - ☐ 72 hours
   - ☐ Other:
   - ☐ Not sure — needs trial

---

## Size Proxy Decision

**Engineering recommendation:** Use `plant_weight_kg` as the default size proxy **only when real measured weight exists** (from load cell or manual weigh-in). If weight is unavailable, the feature falls back to V0 mode (no size proxy).

| Proxy | V0 scope | Instrumented-tent scope | Parked? | Notes |
|-------|----------|------------------------|---------|-------|
| `plant_weight_kg` | ☐ Not used | ☐ Default when real data exists | ☐ | Measured only. Not estimated. |
| `canopy_height_cm` | ☐ Descriptive field only | ☐ Descriptive field only | ☐ | Manual entry. Not used in model. |
| `leaf_area_index` | ☐ Not used | ☐ Not used | ☐ Parked for imaging upgrade | Requires photo segmentation pipeline. |

**Cultivation reviewer notes:**

*(free response — e.g., whether canopy height or leaf count should ever serve as a proxy, or if weight-per-plant is impractical)*

---

## Soil Moisture Decision

**Engineering recommendation:** Soil moisture is treated as **low-confidence supporting context only** in v1. It must never be the primary driver of a demand estimate or recommendation.

| Question | Reviewed |
|----------|----------|
| Should soil moisture be included in v1 at all? | ☐ Yes — low-confidence context only ☐ No — park for later |
| Should suspicious values (0 %, 100 %) be automatically flagged? | ☐ Yes ☐ No |
| Should soil moisture require per-grow calibration (media type, pot size, sensor depth)? | ☐ Yes ☐ No |
| If included, should the UI show an explicit "low confidence / uncalibrated" warning? | ☐ Yes ☐ No |

**Cultivation reviewer notes:**

*(free response — e.g., media-specific behavior, dry-back targets, correlation with plant behavior)*

---

## Safety Rules Review

These are engineering-imposed safety boundaries. Confirm that each aligns with cultivation expectations.

| Safety rule | Cultivation agrees? | Notes |
|-------------|---------------------|-------|
| No fake live data. Missing data = "insufficient data," not an interpolation. | ☐ Yes ☐ Concern: | |
| No inferred plant weight unless explicitly labeled `estimated` or `manual_approximation`. | ☐ Yes ☐ Concern: | |
| No aggressive watering, nutrient, or equipment recommendations from weak evidence. | ☐ Yes ☐ Concern: | |
| No alerts or Action Queue items from this model until validation data exists. | ☐ Yes ☐ Concern: | |
| Grower approval remains required for any future automation path. | ☐ Yes ☐ Concern: | |
| Bad, missing, stale, or suspicious telemetry must not be classified as healthy. | ☐ Yes ☐ Concern: | |
| Soil moisture cannot be the primary driver until sensor reliability is proven. | ☐ Yes ☐ Concern: | |
| This feature must not control devices. | ☐ Yes ☐ Concern: | |

**Cultivation reviewer notes:**

*(free response)*

---

## Approval Section

**Cultivation reviewer:** _________________________________

**Date:** _________________________________

**Approved stage taxonomy:** ☐ Yes — as proposed ☐ Yes — with changes noted above ☐ No — blocked

**Approved VPD bands:** ☐ Yes — as filled above ☐ Yes — with changes noted above ☐ No — blocked

**Approved data cadence for instrumented-tent mode:** ☐ Yes — as stated above ☐ Yes — with changes ☐ No — instrumented mode blocked

**Approved v1 scope:** ☐ V0 only (stage + temp + RH + VPD + logs + observations) ☐ v1 with load-cell weight ☐ v1 with soil moisture as low-confidence context ☐ Parked pending more data

**Overall status:** ☐ Approved to proceed ☐ Approved with conditions ☐ Not approved — see notes

**Reviewer signature / initials:** _________________________________

---

## Engineering Follow-Up

After cultivation review is returned, engineering will:

1. Update `docs/decision-record-size-proxy-vpd-demand.md` with approved taxonomy, bands, and scope.
2. File a build ticket only after both documents are complete and signed off.
3. Do not begin schema, code, or test work until the decision record reflects cultivation approval.

---

## Document Control

| Field | Value |
|-------|-------|
| Document | Cultivation Review: Size-Proxy / VPD Demand |
| Feature ID | size-proxy-vpd-demand |
| Decision record | `docs/decision-record-size-proxy-vpd-demand.md` |
| Version | 1.0 |
| Created | 2026-06-13 |
| Last updated | 2026-06-13 |
| Owner | Product + Cultivation lead |
