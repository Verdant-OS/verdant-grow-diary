import { describe, expect, it } from "vitest";

import {
  buildPublicVpdShareData,
  evaluatePublicVpdCalculator,
  PUBLIC_VPD_SOURCE_NOTE,
} from "@/lib/publicVpdCalculatorRules";

describe("public VPD calculator rules", () => {
  it("derives the same stage-aware air VPD from Celsius and Fahrenheit", () => {
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
      classification: "in_target",
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
      classification: "stage_unknown",
      targetLabel: "Select a stage for a stage-aware range.",
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
      classification: "context_only",
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
