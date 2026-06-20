# Multi-tent environment baseline — Jun 4–13 imported XLSX sensor history

- **Date logged:** 2026-06-13
- **Source:** Imported XLSX sensor history from Verdant Genetics export
- **Data label:** `csv` (historical context only — **not live telemetry**)
- **Window covered:** 2026-06-04 03:00 → 2026-06-13 11:00
- **Reading count:** 57 timestamped readings
- **Companion fixture:** [`fixtures/diary/2026-06-13-multi-tent-baseline.json`](../../fixtures/diary/2026-06-13-multi-tent-baseline.json)

## Summary

Imported 57 timestamped readings covering Flower, Seedling, Vegetation, and
associated soil probes. This entry is **historical sensor context only** and
must not be presented as live telemetry, nor used as a standalone diagnosis.

## Flower Tent

Stable but consistently high-VPD.

| Metric | Value |
| --- | --- |
| Avg temperature | ~77.3 °F |
| Avg RH | ~50.1 % |
| Avg VPD | ~1.61 kPa |
| Recent peak | ~82.5 °F / 45 % RH / 2.09 kPa |

Recent readings trended warmer and drier. May be acceptable if intentional for
the current flower stage, but should be **visually checked against canopy
stress markers** before any environmental change.

## Seedling Tent

Episodic high-humidity / low-VPD events. **Highest watch item.**

- RH spikes as high as **97 %**
- VPD dropping near **0 kPa** in some windows
- Repeated humidity spikes can increase damping-off, mold, stretch, or weak
  root-zone transition risk

## Vegetation Tent

Most balanced and stable of the three. Avg VPD ~1.01 kPa with moderate
temperature and RH. **Use as the current benchmark** for stable environmental
control.

## Soil Probe Notes

Early soil moisture values include zeros / missing values that may reflect
probe commissioning, placement, or inactive channels.

**Do not treat early zero values as healthy or meaningful** without confirming
active probe placement. Per sensor truth rules, zero/missing soil moisture
must remain flagged (e.g. `invalid` / `stale` / unknown), never silently
classified as healthy.

## AI Doctor Context

Use this entry as **historical sensor context only**. It is not live telemetry
and not a standalone diagnosis. Before any grow change, AI Doctor needs:

- Visual photos (canopy + stems)
- Recent watering / feeding logs
- Recent plant observations
- Current live or manual readings

If those are missing, AI Doctor must say what is missing rather than guess.

## Suggested Action Queue Items (approval-required)

> Suggestions only. Nothing here is auto-enqueued. Any Action Queue item must
> be approval-required, hold a back-pointer to this entry, and must not
> include device-control execution.

### 1. Investigate seedling tent RH/VPD spikes
- Verify whether spikes were real environment events or sensor/placement artifacts.
- Physically check seedlings.
- Capture canopy / stem photos.
- Review watering and ventilation/dehumidifier behavior around **Jun 6** and **Jun 11**.
- Keep approval-required.

### 2. Monitor flower tent for high-VPD stress markers
- Upload current Sour Diesel canopy photos.
- Compare against recent high-VPD windows.
- If healthy → log as a **high-VPD flower baseline**.
- If stress signs appear → review RH/temperature balance **before** changing irrigation or feed.
- Keep approval-required.

## What not to do

Do **not** make aggressive nutrient, irrigation, defoliation, or equipment
changes from this imported sensor history alone. Confirm with photos, logs,
and current readings first.

## 24-hour follow-up

Capture current manual/live readings for each tent and upload seedling +
flower canopy photos.

## 3-day follow-up

Review whether seedling RH spikes recur and whether flower high-VPD
conditions correlate with any visible stress.

## Safety verdict

Documentation only. No DB writes, no migrations, no RLS changes, no Edge
Functions, no Action Queue writes, no AI calls, no device control. Imported
data remains labeled `csv` per sensor truth rules.
