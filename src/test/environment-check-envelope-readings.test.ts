/**
 * Shared Environment Check envelope parser — every consumer (Timeline card,
 * diary snapshot, correction notes) must read the same aliases. #2319 fixed
 * buildFields lagging behind this parser for the `humidity` alias; these tests
 * lock the full alias matrix so paths cannot diverge again.
 */
import { describe, expect, it } from "vitest";
import { ENVIRONMENT_CHECK_ENVELOPE_READING_KEYS } from "@/lib/environmentCheckQuickLogRules";
import {
  buildEnvironmentCheckTimelineViewModel,
  environmentCheckEnvelopeHasRecordedReading,
  environmentCheckEnvelopeReadings,
} from "@/lib/environmentCheckTimelineViewModel";

describe("environmentCheckEnvelopeReadings", () => {
  it("reads canonical and legacy temperature aliases", () => {
    expect(environmentCheckEnvelopeReadings({ temp_c: 24.5 }).tempC).toBe(24.5);
    expect(environmentCheckEnvelopeReadings({ tempC: 24.5 }).tempC).toBe(24.5);
    expect(environmentCheckEnvelopeReadings({ air_temp_c: 24.5 }).tempC).toBe(24.5);
    expect(environmentCheckEnvelopeReadings({ room_temp_f: 75.2 }).tempF).toBe(75.2);
    expect(environmentCheckEnvelopeReadings({ tempF: 75.2 }).tempF).toBe(75.2);
    expect(environmentCheckEnvelopeReadings({ air_temp_f: 75.2 }).tempF).toBe(75.2);
  });

  it("reads every humidity alias, including the legacy humidity key", () => {
    expect(environmentCheckEnvelopeReadings({ humidity_pct: 58 }).rhPercent).toBe(58);
    expect(environmentCheckEnvelopeReadings({ rhPercent: 58 }).rhPercent).toBe(58);
    expect(environmentCheckEnvelopeReadings({ rh_percent: 58 }).rhPercent).toBe(58);
    expect(environmentCheckEnvelopeReadings({ humidity: 58 }).rhPercent).toBe(58);
  });

  it("prefers humidity_pct over the humidity alias when both are present", () => {
    expect(environmentCheckEnvelopeReadings({ humidity_pct: 60, humidity: 55 }).rhPercent).toBe(60);
  });

  it("reads VPD and CO₂ aliases and parses numeric strings", () => {
    expect(environmentCheckEnvelopeReadings({ vpd_kpa: 1.12 }).vpdKpa).toBe(1.12);
    expect(environmentCheckEnvelopeReadings({ vpdKpa: 1.12 }).vpdKpa).toBe(1.12);
    expect(environmentCheckEnvelopeReadings({ co2_ppm: 850 }).co2Ppm).toBe(850);
    expect(environmentCheckEnvelopeReadings({ co2Ppm: 850 }).co2Ppm).toBe(850);
    expect(environmentCheckEnvelopeReadings({ co2: 850 }).co2Ppm).toBe(850);
    expect(environmentCheckEnvelopeReadings({ humidity: "55" }).rhPercent).toBe(55);
  });

  it("returns nulls for absent, non-finite, or empty values", () => {
    expect(environmentCheckEnvelopeReadings(null)).toEqual({
      tempC: null,
      tempF: null,
      rhPercent: null,
      vpdKpa: null,
      co2Ppm: null,
    });
    expect(environmentCheckEnvelopeReadings({ humidity_pct: "n/a" }).rhPercent).toBeNull();
    expect(environmentCheckEnvelopeReadings({ temp_c: Number.NaN }).tempC).toBeNull();
  });
});

describe("environmentCheckEnvelopeHasRecordedReading", () => {
  it("is true when any parser alias carries a finite number", () => {
    expect(environmentCheckEnvelopeHasRecordedReading({ humidity: 55 })).toBe(true);
  });

  it("detects readings listed only on ENVIRONMENT_CHECK_ENVELOPE_READING_KEYS", () => {
    for (const key of ENVIRONMENT_CHECK_ENVELOPE_READING_KEYS) {
      expect(environmentCheckEnvelopeHasRecordedReading({ [key]: 1 })).toBe(true);
    }
  });

  it("is false for an empty envelope or note-only payload", () => {
    expect(environmentCheckEnvelopeHasRecordedReading({})).toBe(false);
    expect(environmentCheckEnvelopeHasRecordedReading({ note: "balanced" })).toBe(false);
  });
});

describe("environmentCheckEnvelopeReadings — Timeline card parity", () => {
  const entry = (envelope: Record<string, unknown>) => ({
    id: "env-parity",
    entry_at: "2026-06-15T18:30:00.000Z",
    details: { event_type: "environment", environment_check: envelope },
  });

  it("shows RH on the Timeline card when only the humidity alias is stored", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(entry({ humidity: 55 }));
    expect(environmentCheckEnvelopeReadings({ humidity: 55 }).rhPercent).toBe(55);
    expect(vm?.fields).toEqual([{ key: "humidity", label: "RH", value: "55%" }]);
  });

  it("omits RH when the parser finds no humidity reading", () => {
    const vm = buildEnvironmentCheckTimelineViewModel(entry({ temp_c: 24, vpd_kpa: 1.1 }));
    expect(vm?.fields.map((f) => f.key)).toEqual(["temp", "vpd"]);
  });
});
