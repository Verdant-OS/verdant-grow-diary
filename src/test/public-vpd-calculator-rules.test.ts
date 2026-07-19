import { describe, expect, it } from "vitest";

import {
  buildPublicVpdShareData,
  evaluatePublicVpdCalculator,
  PUBLIC_VPD_SOURCE_NOTE,
} from "@/lib/publicVpdCalculatorRules";

describe("public VPD calculator rules", () => {
  it("derives the same air estimate from Celsius and Fahrenheit without a target claim", () => {
    const celsius = evaluatePublicVpdCalculator({
      temperature: 25,
      temperatureUnit: "C",
      humidity: 60,
      stage: "flower",
    });
    const fahrenheit = evaluatePublicVpdCalculator({
      temperature: 77,
      temperatureUnit: "F",
      humidity: 60,
      stage: "flower",
    });

    expect(celsius).toMatchObject({
      state: "derived",
      vpdKpa: 1.27,
      temperatureC: 25,
      humidity: 60,
      classification: null,
      basis: "air_estimate",
      confidence: "unverified",
      canCompareToStageTarget: false,
      sourceNote: PUBLIC_VPD_SOURCE_NOTE,
    });
    expect(fahrenheit).toEqual(celsius);
    expect(
      evaluatePublicVpdCalculator({
        temperature: 25,
        temperatureUnit: "C",
        humidity: 60,
        stage: "flower",
      }),
    ).toEqual(celsius);
  });

  it("unlocks stage comparison only for verified leaf VPD evidence", () => {
    const verified = evaluatePublicVpdCalculator({
      temperature: 25,
      leafTemperature: 25,
      temperatureUnit: "C",
      humidity: 60,
      stage: "flower",
      nowMs: Date.parse("2026-07-18T18:00:00.000Z"),
      measurementEvidence: {
        observedAt: "2026-07-18T17:55:00.000Z",
        temperatureVerifiedAt: "2026-06-01T12:00:00.000Z",
        temperatureReference: "Traceable reference thermometer",
        temperatureVerifiedAtOperatingConditions: true,
        humidityVerifiedAt: "2026-06-01T12:00:00.000Z",
        humidityReferenceRhPercent: 75,
        leafTemperatureMeasuredAt: "2026-07-18T17:56:00.000Z",
        placement: "canopy",
      },
    });

    expect(verified).toMatchObject({
      state: "derived",
      vpdKpa: 1.27,
      leafVpdKpa: 1.27,
      basis: "leaf",
      confidence: "verified",
      canCompareToStageTarget: true,
      classification: "in_target",
    });
    expect(verified.classificationLabel).toMatch(/in flower vpd range/i);
  });

  it("withholds a target claim when the RH reference is below 75%", () => {
    const result = evaluatePublicVpdCalculator({
      temperature: 25,
      leafTemperature: 25,
      temperatureUnit: "C",
      humidity: 60,
      stage: "flower",
      nowMs: Date.parse("2026-07-18T18:00:00.000Z"),
      measurementEvidence: {
        observedAt: "2026-07-18T17:55:00.000Z",
        temperatureVerifiedAt: "2026-06-01T12:00:00.000Z",
        temperatureReference: "Traceable reference thermometer",
        temperatureVerifiedAtOperatingConditions: true,
        humidityVerifiedAt: "2026-06-01T12:00:00.000Z",
        humidityReferenceRhPercent: 74.9,
        leafTemperatureMeasuredAt: "2026-07-18T17:56:00.000Z",
        placement: "canopy",
      },
    });

    expect(result.classification).toBeNull();
    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.trustIssues).toContain("humidity_reference_below_minimum");
  });

  it("withholds a target claim for mutually contemporaneous future measurements", () => {
    const result = evaluatePublicVpdCalculator({
      temperature: 25,
      leafTemperature: 25,
      temperatureUnit: "C",
      humidity: 60,
      stage: "flower",
      nowMs: Date.parse("2026-07-18T18:00:00.000Z"),
      measurementEvidence: {
        observedAt: "2026-07-19T18:00:00.000Z",
        temperatureVerifiedAt: "2026-06-01T12:00:00.000Z",
        temperatureReference: "Traceable reference thermometer",
        temperatureVerifiedAtOperatingConditions: true,
        humidityVerifiedAt: "2026-06-01T12:00:00.000Z",
        humidityReferenceRhPercent: 75,
        leafTemperatureMeasuredAt: "2026-07-19T18:01:00.000Z",
        placement: "canopy",
      },
    });

    expect(result.classification).toBeNull();
    expect(result.canCompareToStageTarget).toBe(false);
    expect(result.classificationLabel).not.toMatch(/in .*vpd range/i);
    expect(result.trustIssues).toContain("observation_time_in_future");
    expect(result.trustIssues).toContain("leaf_measurement_time_in_future");
  });

  it("keeps unknown and harvest stages contextual rather than inventing a target", () => {
    expect(
      evaluatePublicVpdCalculator({
        temperature: 25,
        temperatureUnit: "C",
        humidity: 60,
        stage: "unknown",
      }),
    ).toMatchObject({
      state: "derived",
      classification: null,
      targetLabel: "Verify the measurement before selecting a stage target.",
    });
    expect(
      evaluatePublicVpdCalculator({
        temperature: 25,
        temperatureUnit: "C",
        humidity: 60,
        stage: "harvest",
      }),
    ).toMatchObject({
      state: "derived",
      classification: null,
    });
  });

  it("fails closed for missing, non-finite, and out-of-range inputs", () => {
    expect(
      evaluatePublicVpdCalculator({
        temperature: null,
        temperatureUnit: "C",
        humidity: 60,
        stage: "veg",
      }),
    ).toMatchObject({ state: "needs_inputs", vpdKpa: null, invalidReason: null });
    expect(
      evaluatePublicVpdCalculator({
        temperature: Number.NaN,
        temperatureUnit: "C",
        humidity: 60,
        stage: "veg",
      }),
    ).toMatchObject({ state: "invalid", vpdKpa: null, invalidReason: "invalid_temperature" });
    expect(
      evaluatePublicVpdCalculator({
        temperature: 61,
        temperatureUnit: "C",
        humidity: 60,
        stage: "veg",
      }),
    ).toMatchObject({ state: "invalid", vpdKpa: null, invalidReason: "invalid_temperature" });
    expect(
      evaluatePublicVpdCalculator({
        temperature: 25,
        temperatureUnit: "C",
        humidity: 101,
        stage: "veg",
      }),
    ).toMatchObject({ state: "invalid", vpdKpa: null, invalidReason: "invalid_humidity" });
  });

  it("shares a fixed blank calculator URL without grow inputs", () => {
    const share = buildPublicVpdShareData();
    const url = new URL(String(share.url));

    expect(url.pathname).toBe("/tools/vpd-calculator");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "vpd_calculator_share",
      utm_medium: "referral",
      utm_campaign: "vpd_calculator",
    });
    expect(String(share.url)).not.toMatch(/temperature|humidity|stage|plant|email|user_?id/i);
  });
});
