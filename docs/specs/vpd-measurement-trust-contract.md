# VPD Measurement Trust Contract

**Status:** Phase 1 implementation contract

**Date:** 2026-07-18
**Scope:** VPD calculation, evidence, confidence, and target-claim safety

Verdant must not turn temperature and relative humidity into a healthy-looking
stage claim without proving that the inputs are fit for that decision. Air VPD
is useful context. Calibrated leaf-to-air VPD is the decision-grade
measurement.

This contract is read-only and suggest-only. It does not write alerts, create
Action Queue items, control equipment, or change schema/RLS.

## Measurement basis

Verdant distinguishes two calculations:

1. **Air VPD estimate** uses air temperature for both sides of the vapor
   pressure calculation. It may be shown as an estimate, but it cannot be
   labeled verified, healthy, or in target.
2. **Leaf-to-air VPD** uses saturation vapor pressure at the measured leaf
   temperature and ambient vapor pressure from the measured air temperature
   and RH:

```text
leaf VPD = es(leaf temperature) - es(air temperature) * RH / 100
```

The implementation preserves a negative leaf VPD. That result can reveal a
leaf below the ambient dew point and possible surface-condensation risk;
clamping it to zero would hide evidence.

## Minimum evidence for a target claim

A stage-target comparison is allowed only when all of the following hold:

- Air temperature is within the accepted measurement range.
- RH is in range and is not exactly 0% or 100%, which Verdant treats as a
  suspicious stuck extreme.
- Temperature has been checked against a named, trustworthy reference at the
  grow room's operating conditions.
- RH has been checked at a valid reference point from 75% through 100% RH.
- Temperature and RH verification dates are present and no older than 365
  days.
- A real canopy-leaf temperature is supplied.
- The leaf temperature and air/RH observation are no more than 15 minutes
  apart.
- Neither the air/RH observation nor the leaf measurement is more than five
  minutes in the future relative to the evaluation clock.
- The sensor placement is recorded as canopy level.

The 75% value is a **verification reference point**, not a recommended grow
room humidity setpoint. The 365-day interval is Verdant's conservative default
for this phase and may later become device-specific. The 15-minute coherence
window is a Verdant product rule for keeping a leaf measurement paired with
the same room state; it is not presented as a universal horticultural
standard. The five-minute future tolerance accommodates small device-clock
differences; it does not make future-dated evidence current.

An older sensor is not automatically rejected. If it has current verification
evidence, it can still be trusted. An older sensor without current verification
is explicitly downgraded.

## Confidence and rendering

| Confidence   | Meaning                                                                                            | Target rendering                                    |
| ------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `verified`   | Complete, current calibration evidence and contemporaneous canopy-leaf temperature                 | Stage target comparison allowed                     |
| `reduced`    | A value can be calculated, but evidence is stale, suspicious, or outside the verification contract | No healthy/in-target claim                          |
| `unverified` | Required evidence is missing                                                                       | No healthy/in-target claim                          |
| `invalid`    | Temperature, RH, or supplied leaf temperature is invalid                                           | No target claim; invalid data must not look healthy |

Target colors and target-band labels are evidence-gated. An air-only estimate
stays visually neutral/warning-toned even when its number happens to fall
inside a stage band.

## Persistence boundary

- The public calculator runs locally and saves nothing.
- Manual temperature + RH may produce an air estimate for preview context.
  That estimate is not silently stored as `vpd_kpa`.
- A grower-entered VPD value may still be stored, but it must not inherit a
  verified or in-target claim unless its measurement basis and evidence meet
  this contract.
- Persisting calibration records and measurement-basis metadata requires a
  later schema/RLS slice. Phase 1 deliberately makes no schema or RLS changes.

## Acceptance criteria

| ID     | Required state                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| VPD-01 | The canonical helper calculates leaf-to-air VPD from leaf temperature, air temperature, and RH.                  |
| VPD-02 | Air-only VPD is labeled as an estimate and cannot produce a target claim.                                        |
| VPD-03 | Complete, current evidence unlocks a stage-target comparison.                                                    |
| VPD-04 | An RH reference below 75% or above 100% blocks verification.                                                     |
| VPD-05 | Exact 0% or 100% RH blocks verification.                                                                         |
| VPD-06 | Missing, stale, or future-dated calibration evidence blocks verification.                                        |
| VPD-07 | Missing canopy placement, future-dated measurement, or non-contemporaneous leaf temperature blocks verification. |
| VPD-08 | Older, unverified sensors are lower confidence.                                                                  |
| VPD-09 | Temperature + RH entry never silently persists an air estimate as verified VPD.                                  |
| VPD-10 | Negative leaf VPD is preserved and flagged as condensation-risk evidence.                                        |

## Technical basis

- Vaisala documents saturated sodium chloride as an approximately 75% RH
  reference and recommends performing calibration near the conditions where
  the instrument is used:
  <https://docs.vaisala.com/r/M210185EN-E/en-US/GUID-F5D504C9-9271-4E25-9FDE-198CB99D2EA1>
- Vaisala gives one year as a typical humidity-probe calibration interval while
  noting that the real interval depends on the application:
  <https://docs.vaisala.com/r/M211060EN-N/en-US/GUID-E0F94BA2-0C38-4497-8473-8CEF1773D79C>
- Vaisala's measurement guidance uses a radiation shield to reduce solar and
  precipitation error around temperature/RH probes:
  <https://docs.vaisala.com/r/DOC232783EN-E/en-US/GUID-66E011C4-6567-4373-8321-C738F4826637/GUID-4D91D94D-2595-4596-BB81-8D2FEF28B897>
- Apogee documents infrared radiometer calibration and the importance of the
  instrument field of view when measuring canopy temperature:
  <https://www.apogeeinstruments.com/content/IRR-Poster-Wooster-April-2006.pdf>
  and
  <https://www.apogeeinstruments.com/estimating-the-canopy-fraction-in-your-irr-field-of-view/>
- Plant-science measurement literature distinguishes air VPD from leaf-to-air
  VPD and calculates the latter from leaf temperature, air temperature, and
  RH:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC12571154/>

## Deferred migration work

This slice establishes the pure rules and safe rendering/persistence boundary.
A later audited slice must add first-class calibration records, sensor age,
placement, leaf-temperature provenance, and measurement-basis metadata before
live dashboards, alerts, trend analytics, or AI Doctor can call persisted VPD
decision-grade. Existing dashboard/timeline/ingest surfaces are not declared
migrated by this contract.
