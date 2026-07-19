import { describe, expect, it } from "vitest";

import {
  evaluateVpdMeasurementTrust,
  VPD_CALIBRATION_MAX_AGE_DAYS,
  VPD_HUMIDITY_REFERENCE_MIN_PERCENT,
  VPD_MEASUREMENT_FUTURE_TOLERANCE_MINUTES,
} from "@/lib/vpdMeasurementTrustStatusRules";
import { calculateLeafVpdKpa } from "@/lib/vpdRules";

const NOW_MS = Date.parse("2026-07-18T18:00:00.000Z");

const VERIFIED_EVIDENCE = {
  observedAt: "2026-07-18T17:55:00.000Z",
  temperatureVerifiedAt: "2026-06-01T12:00:00.000Z",
  temperatureReference: "NIST-traceable handheld reference",
  temperatureVerifiedAtOperatingConditions: true,
  humidityVerifiedAt: "2026-06-01T12:00:00.000Z",
  humidityReferenceRhPercent: 75,
  leafTemperatureMeasuredAt: "2026-07-18T17:56:00.000Z",
  placement: "canopy" as const,
};

describe("calculateLeafVpdKpa", () => {
  it("uses leaf saturation pressure and air vapor pressure", () => {
    expect(
      calculateLeafVpdKpa({
        airTempC: 25,
        leafTempC: 23,
        rhPercent: 60,
      }),
    ).toBe(0.91);
  });

  it("does not silently clamp a below-dew-point result", () => {
    expect(
      calculateLeafVpdKpa({
        airTempC: 25,
        leafTempC: 15,
        rhPercent: 90,
      }),
    ).toBeLessThan(0);
  });

  it("fails closed for invalid or missing inputs", () => {
    expect(calculateLeafVpdKpa({ airTempC: 25, leafTempC: null, rhPercent: 60 })).toBeNull();
    expect(calculateLeafVpdKpa({ airTempC: 25, leafTempC: 23, rhPercent: 101 })).toBeNull();
    expect(calculateLeafVpdKpa({ airTempC: 25, leafTempC: Number.NaN, rhPercent: 60 })).toBeNull();
  });
});

describe("evaluateVpdMeasurementTrust", () => {
  it("allows stage comparison only for a fully verified leaf measurement", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: VERIFIED_EVIDENCE,
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      basis: "leaf",
      confidence: "verified",
      valueKpa: 0.91,
      airVpdKpa: 1.27,
      leafVpdKpa: 0.91,
      canCompareToStageTarget: true,
      issues: [],
    });
  });

  it("keeps air-only VPD as an unverified estimate with no target claim", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      humidityPct: 60,
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      basis: "air_estimate",
      confidence: "unverified",
      valueKpa: 1.27,
      leafVpdKpa: null,
      canCompareToStageTarget: false,
    });
    expect(result.issues).toContain("leaf_temperature_missing");
    expect(result.issues).toContain("temperature_verification_missing");
    expect(result.issues).toContain("humidity_verification_missing");
    expect(result.issues).toContain("placement_not_canopy");
  });

  it("accepts the 75% RH verification boundary and rejects a lower point", () => {
    expect(VPD_HUMIDITY_REFERENCE_MIN_PERCENT).toBe(75);
    expect(
      evaluateVpdMeasurementTrust({
        airTempC: 25,
        leafTempC: 23,
        humidityPct: 60,
        evidence: VERIFIED_EVIDENCE,
        nowMs: NOW_MS,
      }).canCompareToStageTarget,
    ).toBe(true);

    const below = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: { ...VERIFIED_EVIDENCE, humidityReferenceRhPercent: 74.9 },
      nowMs: NOW_MS,
    });
    expect(below.canCompareToStageTarget).toBe(false);
    expect(below.issues).toContain("humidity_reference_below_minimum");
  });

  it("rejects an impossible RH verification reference above 100%", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: { ...VERIFIED_EVIDENCE, humidityReferenceRhPercent: 100.1 },
      nowMs: NOW_MS,
    });

    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.issues).toContain("humidity_reference_invalid");
  });

  it("reduces confidence when a logged calibration is older than one year", () => {
    expect(VPD_CALIBRATION_MAX_AGE_DAYS).toBe(365);
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: {
        ...VERIFIED_EVIDENCE,
        temperatureVerifiedAt: "2025-01-01T12:00:00.000Z",
        humidityVerifiedAt: "2025-01-01T12:00:00.000Z",
        sensorCommissionedAt: "2023-01-01T00:00:00.000Z",
      },
      nowMs: NOW_MS,
    });

    expect(result.confidence).toBe("reduced");
    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.issues).toContain("temperature_verification_stale");
    expect(result.issues).toContain("humidity_verification_stale");
    expect(result.issues).toContain("older_sensor_unverified");
  });

  it("reduces confidence when the leaf reading is not contemporaneous", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: {
        ...VERIFIED_EVIDENCE,
        leafTemperatureMeasuredAt: "2026-07-18T12:00:00.000Z",
      },
      nowMs: NOW_MS,
    });

    expect(result.confidence).toBe("reduced");
    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.issues).toContain("leaf_measurement_not_contemporaneous");
  });

  it("blocks mutually contemporaneous observation and leaf timestamps in the future", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: {
        ...VERIFIED_EVIDENCE,
        observedAt: "2026-07-19T18:00:00.000Z",
        leafTemperatureMeasuredAt: "2026-07-19T18:01:00.000Z",
      },
      nowMs: NOW_MS,
    });

    expect(result.confidence).toBe("reduced");
    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.issues).toContain("observation_time_in_future");
    expect(result.issues).toContain("leaf_measurement_time_in_future");
  });

  it("blocks a future leaf timestamp even when it is inside the pairing window", () => {
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: {
        ...VERIFIED_EVIDENCE,
        observedAt: "2026-07-18T18:00:00.000Z",
        leafTemperatureMeasuredAt: "2026-07-18T18:06:00.000Z",
      },
      nowMs: NOW_MS,
    });

    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.issues).toContain("leaf_measurement_time_in_future");
    expect(result.issues).not.toContain("leaf_measurement_not_contemporaneous");
  });

  it("keeps the documented five-minute future tolerance inclusive", () => {
    const toleranceMs = VPD_MEASUREMENT_FUTURE_TOLERANCE_MINUTES * 60_000;
    const exactBoundary = new Date(NOW_MS + toleranceMs).toISOString();
    const result = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: 60,
      evidence: {
        ...VERIFIED_EVIDENCE,
        observedAt: exactBoundary,
        leafTemperatureMeasuredAt: exactBoundary,
      },
      nowMs: NOW_MS,
    });

    expect(result.confidence).toBe("verified");
    expect(result.canCompareToStageTarget).toBe(true);
    expect(result.issues).not.toContain("observation_time_in_future");
    expect(result.issues).not.toContain("leaf_measurement_time_in_future");
  });

  it("never converts whitespace-only measurement strings into numeric zero", () => {
    const airWhitespace = evaluateVpdMeasurementTrust({
      airTempC: " \t ",
      leafTempC: 23,
      humidityPct: 60,
      evidence: VERIFIED_EVIDENCE,
      nowMs: NOW_MS,
    });
    const leafWhitespace = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: " \t ",
      humidityPct: 60,
      evidence: VERIFIED_EVIDENCE,
      nowMs: NOW_MS,
    });
    const humidityWhitespace = evaluateVpdMeasurementTrust({
      airTempC: 25,
      leafTempC: 23,
      humidityPct: " \t ",
      evidence: VERIFIED_EVIDENCE,
      nowMs: NOW_MS,
    });

    expect(airWhitespace).toMatchObject({
      airTempC: null,
      confidence: "invalid",
      canCompareToStageTarget: false,
    });
    expect(leafWhitespace.issues).toContain("leaf_temperature_missing");
    expect(leafWhitespace.canCompareToStageTarget).toBe(false);
    expect(humidityWhitespace).toMatchObject({
      humidityPct: null,
      confidence: "invalid",
      canCompareToStageTarget: false,
    });
  });

  it("never verifies exact 0% or 100% humidity", () => {
    for (const humidityPct of [0, 100]) {
      const result = evaluateVpdMeasurementTrust({
        airTempC: 25,
        leafTempC: 23,
        humidityPct,
        evidence: VERIFIED_EVIDENCE,
        nowMs: NOW_MS,
      });
      expect(result.canCompareToStageTarget).toBe(false);
      expect(result.issues).toContain("humidity_stuck_extreme");
    }
  });

  it("is deterministic for identical inputs and injected time", () => {
    const input = {
      airTempF: 77,
      leafTempF: 73.4,
      humidityPct: 60,
      evidence: VERIFIED_EVIDENCE,
      nowMs: NOW_MS,
    };
    expect(evaluateVpdMeasurementTrust(input)).toEqual(evaluateVpdMeasurementTrust(input));
  });
});
