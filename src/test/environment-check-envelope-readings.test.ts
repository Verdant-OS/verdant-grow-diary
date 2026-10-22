/**
 * Pure parser for `details.environment_check` readings (#2316 correction note,
 * #2319 Timeline RH humidity alias). A sibling file so scorer-locked timeline
 * view-model tests stay untouched.
 */
import { describe, expect, it } from "vitest";
import {
  environmentCheckEnvelopeHasRecordedReading,
  environmentCheckEnvelopeReadings,
} from "@/lib/environmentCheckTimelineViewModel";

describe("environmentCheckEnvelopeReadings", () => {
  it("reads canonical writer keys", () => {
    expect(
      environmentCheckEnvelopeReadings({
        temp_c: 24.5,
        room_temp_f: 76,
        humidity_pct: 58,
        vpd_kpa: 1.1,
        co2_ppm: 900,
      }),
    ).toEqual({
      tempC: 24.5,
      tempF: 76,
      rhPercent: 58,
      vpdKpa: 1.1,
      co2Ppm: 900,
    });
  });

  it("accepts legacy and alias keys, with humidity_pct winning over humidity", () => {
    expect(
      environmentCheckEnvelopeReadings({
        tempC: 25,
        air_temp_f: 77,
        rh_percent: 52,
        vpdKpa: 0.9,
        co2: 800,
      }),
    ).toEqual({
      tempC: 25,
      tempF: 77,
      rhPercent: 52,
      vpdKpa: 0.9,
      co2Ppm: 800,
    });

    expect(environmentCheckEnvelopeReadings({ humidity_pct: 60, humidity: 55 })).toMatchObject({
      rhPercent: 60,
    });
    expect(environmentCheckEnvelopeReadings({ humidity: 55 })).toMatchObject({
      rhPercent: 55,
    });
  });

  it("parses numeric strings like persisted JSON", () => {
    expect(environmentCheckEnvelopeReadings({ room_temp_f: "76", humidity_pct: "58" })).toEqual({
      tempC: null,
      tempF: 76,
      rhPercent: 58,
      vpdKpa: null,
      co2Ppm: null,
    });
  });

  it("returns null for each reading when input is not a plain object", () => {
    for (const bad of [null, undefined, [], "x", 7]) {
      expect(environmentCheckEnvelopeReadings(bad)).toEqual({
        tempC: null,
        tempF: null,
        rhPercent: null,
        vpdKpa: null,
        co2Ppm: null,
      });
    }
  });

  it("never treats non-finite numbers as readings", () => {
    expect(
      environmentCheckEnvelopeReadings({
        temp_c: NaN,
        humidity_pct: Infinity,
        vpd_kpa: "",
        co2_ppm: "not-a-number",
      }),
    ).toEqual({
      tempC: null,
      tempF: null,
      rhPercent: null,
      vpdKpa: null,
      co2Ppm: null,
    });
  });
});

describe("environmentCheckEnvelopeHasRecordedReading", () => {
  it("is false for metadata-only envelopes and non-objects", () => {
    expect(environmentCheckEnvelopeHasRecordedReading(null)).toBe(false);
    expect(environmentCheckEnvelopeHasRecordedReading({ checkType: "smell" })).toBe(false);
  });

  it("detects alias-only RH (#2319) and alias-only CO₂", () => {
    expect(environmentCheckEnvelopeHasRecordedReading({ humidity: 55 })).toBe(true);
    expect(environmentCheckEnvelopeHasRecordedReading({ co2: 900 })).toBe(true);
  });

  it("detects writer keys that never appear in environmentCheckEnvelopeReadings aliases", () => {
    expect(environmentCheckEnvelopeHasRecordedReading({ water_temp_c: 20 })).toBe(true);
    expect(environmentCheckEnvelopeHasRecordedReading({ ec_mscm: 1.4 })).toBe(true);
  });
});
