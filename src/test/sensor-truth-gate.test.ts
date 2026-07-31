/**
 * Sensor Truth Gate (Build 2) — deterministic pre-AI telemetry gate.
 *
 * Locks: canonical-six source vocabulary with deny-by-default
 * normalization, freshness via the shared live window + status-contract
 * registry, realism/suspicion via sensorTruthRules, unit conversion via
 * temperatureUnits/ecUnits, truth-gated VPD derivation, explicit-only
 * aggregation, conflict surfacing, and deterministic output.
 */

import { describe, it, expect } from "vitest";
import {
  SENSOR_TRUTH_CONFIDENCE_FACTORS,
  deriveTruthGatedVpd,
  evaluateSensorSeries,
  evaluateSensorTruth,
  normalizeSensorCandidate,
  summarizeSensorProvenance,
  usabilityToDbQuality,
  usabilityToSnapshotStatus,
  type SensorReadingCandidate,
} from "@/lib/sensorTruthGateRules";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";

const NOW_MS = Date.parse("2026-07-30T12:00:00.000Z");
const TENT = "22222222-2222-4222-8222-222222222222";

function minutesAgo(mins: number): string {
  return new Date(NOW_MS - mins * 60_000).toISOString();
}

function makeCandidate(overrides: Partial<SensorReadingCandidate> = {}): SensorReadingCandidate {
  return {
    provider: "ecowitt",
    transport: "api",
    source: "live",
    capturedAt: minutesAgo(5),
    tentId: TENT,
    metric: "temperature_c",
    value: 24,
    unit: "°C",
    ...overrides,
  };
}

describe("single-candidate evaluation", () => {
  it("accepts a fresh live valid reading as usable", () => {
    const e = evaluateSensorTruth(makeCandidate(), { nowMs: NOW_MS });
    expect(e.source).toBe("live");
    expect(e.freshness).toBe("fresh");
    expect(e.validity).toBe("valid");
    expect(e.usability).toBe("usable");
    expect(e.excludedFromReasoning).toBe(false);
    expect(e.exclusionReason).toBeNull();
    expect(e.confidenceFactor).toBe(1);
    expect(e.adjustedConfidence).toBe(1);
    expect(e.normalizedValue).toBe(24);
    expect(e.provenanceSummary).toContain("live reading");
    expect(e.provenanceSummary).toContain("EcoWitt");
  });

  it("accepts fresh manual and csv readings without ever relabeling them live", () => {
    const manual = evaluateSensorTruth(
      makeCandidate({ source: "manual", provider: null, capturedAt: minutesAgo(120) }),
      { nowMs: NOW_MS },
    );
    expect(manual.source).toBe("manual");
    expect(manual.usability).toBe("usable");
    const csv = evaluateSensorTruth(makeCandidate({ source: "csv", capturedAt: minutesAgo(60) }), {
      nowMs: NOW_MS,
    });
    expect(csv.source).toBe("csv");
    expect(csv.usability).toBe("usable");
  });

  it("applies the live-only 15-minute freshness window asymmetry", () => {
    const staleLive = evaluateSensorTruth(makeCandidate({ capturedAt: minutesAgo(20) }), {
      nowMs: NOW_MS,
    });
    expect(staleLive.usability).toBe("stale");
    expect(staleLive.excludedFromReasoning).toBe(true);
    expect(staleLive.exclusionReason).toBe("stale_reading");
    expect(staleLive.confidenceFactor).toBe(SENSOR_TRUTH_CONFIDENCE_FACTORS.stale);
    // Same age, manual source: still fresh under the 24h contract window,
    // and the source label itself is never downgraded.
    const manual = evaluateSensorTruth(
      makeCandidate({ source: "manual", capturedAt: minutesAgo(20) }),
      { nowMs: NOW_MS },
    );
    expect(manual.usability).toBe("usable");
    expect(manual.source).toBe("manual");
  });

  it("excludes demo readings and keeps the demo label intact", () => {
    const e = evaluateSensorTruth(makeCandidate({ source: "demo" }), {
      nowMs: NOW_MS,
    });
    expect(e.source).toBe("demo");
    expect(e.usability).toBe("invalid");
    expect(e.excludedFromReasoning).toBe(true);
    expect(e.exclusionReason).toBe("demo_source");
    expect(e.adjustedConfidence).toBe(0);
  });

  it("deny-by-default: unknown and vendor source labels are invalid, never live", () => {
    for (const source of ["vendor_x", "unknown", "mqtt", "webhook", "", null]) {
      const e = evaluateSensorTruth(makeCandidate({ source }), { nowMs: NOW_MS });
      expect(e.source).toBe("invalid");
      expect(e.excludedFromReasoning).toBe(true);
      expect(e.warnings).toContain("unknown_source");
    }
  });

  it("normalizes only the two sanctioned legacy aliases", () => {
    const imported = evaluateSensorTruth(makeCandidate({ source: "imported" }), {
      nowMs: NOW_MS,
    });
    expect(imported.source).toBe("csv");
    expect(imported.warnings).toContain("legacy_source_alias");
    const sim = evaluateSensorTruth(makeCandidate({ source: "sim" }), {
      nowMs: NOW_MS,
    });
    expect(sim.source).toBe("demo");
    expect(sim.excludedFromReasoning).toBe(true);
  });

  it("flags suspicious Fahrenheit/Celsius mappings", () => {
    // 22°F is unrealistic as air temp but realistic if it was really °C.
    const fAsC = evaluateSensorTruth(
      makeCandidate({ metric: "temperature_f", value: 22, unit: "F" }),
      { nowMs: NOW_MS },
    );
    expect(fAsC.warnings).toContain("temperature_unit_suspected");
    expect(fAsC.validity).toBe("invalid");
    expect(fAsC.normalizedValue).toBeNull();
    // 75 declared °C is unrealistic, but plausible as °F.
    const cAsF = evaluateSensorTruth(makeCandidate({ metric: "temperature_c", value: 75 }), {
      nowMs: NOW_MS,
    });
    expect(cAsF.warnings).toContain("temperature_unit_suspected");
    expect(cAsF.validity).toBe("invalid");
  });

  it("converts µS/cm to mS/cm and flags µS-as-mS unit mismatches", () => {
    const converted = evaluateSensorTruth(
      makeCandidate({ metric: "soil_ec_ms_cm", value: 1200, unit: "uS/cm" }),
      { nowMs: NOW_MS },
    );
    expect(converted.normalizedValue).toBe(1.2);
    expect(converted.normalizedUnit).toBe("mS/cm");
    expect(converted.usability).toBe("usable");
    const mismatch = evaluateSensorTruth(
      makeCandidate({ metric: "soil_ec_ms_cm", value: 1200, unit: "mS/cm" }),
      { nowMs: NOW_MS },
    );
    expect(mismatch.validity).toBe("invalid");
    expect(mismatch.warnings).toContain("unit_mismatch_suspected");
    expect(mismatch.normalizedValue).toBeNull();
  });

  it("rejects unrecognized explicit units instead of assuming canonical", () => {
    const kelvin = evaluateSensorTruth(
      makeCandidate({ metric: "temperature_c", value: 24, unit: "K" }),
      { nowMs: NOW_MS },
    );
    expect(kelvin.warnings).toContain("unit_unknown");
    expect(kelvin.normalizedValue).toBeNull();
    expect(kelvin.usability).toBe("invalid");
    // An absent unit is the one documented canonical-unit assumption.
    const implicit = evaluateSensorTruth(
      makeCandidate({ metric: "temperature_c", value: 24, unit: null }),
      { nowMs: NOW_MS },
    );
    expect(implicit.usability).toBe("usable");
    expect(implicit.normalizedValue).toBe(24);
    // Non-temperature metrics are guarded too.
    const badRh = evaluateSensorTruth(
      makeCandidate({ metric: "humidity_pct", value: 55, unit: "g/m3" }),
      { nowMs: NOW_MS },
    );
    expect(badRh.warnings).toContain("unit_unknown");
    expect(badRh.usability).toBe("invalid");
  });

  it("flags unrealistic pH and accepts realistic pH via both metric aliases", () => {
    const high = evaluateSensorTruth(makeCandidate({ metric: "ph", value: 12, unit: "pH" }), {
      nowMs: NOW_MS,
    });
    expect(high.validity).toBe("invalid");
    expect(high.warnings).toContain("invalid_ph");
    expect(high.normalizedValue).toBeNull();
    const reservoir = evaluateSensorTruth(
      makeCandidate({ metric: "reservoir_ph", value: 6.2, unit: "pH" }),
      { nowMs: NOW_MS },
    );
    expect(reservoir.metric).toBe("ph");
    expect(reservoir.usability).toBe("usable");
    expect(reservoir.normalizedValue).toBe(6.2);
  });

  it("applies realism ranges to CO2 and soil temperature", () => {
    const co2 = evaluateSensorTruth(
      makeCandidate({ metric: "co2_ppm", value: 50000, unit: "ppm" }),
      { nowMs: NOW_MS },
    );
    expect(co2.validity).toBe("invalid");
    expect(co2.normalizedValue).toBeNull();
    const co2Ok = evaluateSensorTruth(
      makeCandidate({ metric: "co2_ppm", value: 900, unit: "ppm" }),
      { nowMs: NOW_MS },
    );
    expect(co2Ok.usability).toBe("usable");
    const soilTemp = evaluateSensorTruth(
      makeCandidate({ metric: "soil_temp_c", value: 80, unit: "°C" }),
      { nowMs: NOW_MS },
    );
    expect(soilTemp.validity).toBe("invalid");
    expect(soilTemp.warnings).toContain("invalid_soil_temp");
  });

  it("rejects soil_ec_us_cm contradicted by an explicit non-µS unit", () => {
    const e = evaluateSensorTruth(
      makeCandidate({ metric: "soil_ec_us_cm", value: 1.8, unit: "mS/cm" }),
      { nowMs: NOW_MS },
    );
    expect(e.normalizedValue).toBeNull();
    expect(e.warnings).toContain("unit_mismatch_suspected");
    expect(e.usability).toBe("invalid");
    // Consistent declarations still convert.
    const consistent = evaluateSensorTruth(
      makeCandidate({ metric: "soil_ec_us_cm", value: 1200, unit: "uS/cm" }),
      { nowMs: NOW_MS },
    );
    expect(consistent.normalizedValue).toBe(1.2);
    expect(consistent.usability).toBe("usable");
  });

  it("treats prototype-inherited keys as unknown, never as matches", () => {
    for (const source of ["constructor", "toString", "hasOwnProperty"]) {
      const e = evaluateSensorTruth(makeCandidate({ source }), { nowMs: NOW_MS });
      expect(e.source).toBe("invalid");
      expect(e.warnings).toContain("unknown_source");
      expect(e.excludedFromReasoning).toBe(true);
    }
    const badMetric = evaluateSensorTruth(makeCandidate({ metric: "constructor" }), {
      nowMs: NOW_MS,
    });
    expect(badMetric.metric).toBeNull();
    expect(badMetric.exclusionReason).toBe("unknown_metric");
    // One crafted candidate must not abort a whole series batch.
    const series = evaluateSensorSeries(
      [makeCandidate({ metric: "constructor" }), makeCandidate()],
      { nowMs: NOW_MS },
    );
    expect(series.evaluations).toHaveLength(2);
    expect(series.evaluations[1].usability).toBe("usable");
    const badQuality = evaluateSensorTruth(makeCandidate({ quality: "constructor" }), {
      nowMs: NOW_MS,
    });
    expect(badQuality.usability).toBe("invalid");
    expect(badQuality.warnings).toContain("unknown_quality");
    const badProvider = evaluateSensorTruth(makeCandidate({ provider: "constructor" }), {
      nowMs: NOW_MS,
    });
    expect(badProvider.provenanceSummary).not.toContain("function");
    expect(badProvider.provenanceSummary).not.toContain("Constructor");
  });

  it("classifies PPFD with the ppfdRules bounds", () => {
    const ok = evaluateSensorTruth(
      makeCandidate({ metric: "ppfd", value: 800, unit: "µmol/m²/s" }),
      { nowMs: NOW_MS },
    );
    expect(ok.metric).toBe("ppfd");
    expect(ok.usability).toBe("usable");
    expect(ok.normalizedValue).toBe(800);
    const tooHigh = evaluateSensorTruth(makeCandidate({ metric: "ppfd", value: 3000 }), {
      nowMs: NOW_MS,
    });
    expect(tooHigh.validity).toBe("invalid");
    expect(tooHigh.normalizedValue).toBeNull();
  });

  it("carries the opaque raw-payload reference through, never contents", () => {
    const e = evaluateSensorTruth(makeCandidate({ rawPayloadRef: "sr-row-42" }), {
      nowMs: NOW_MS,
    });
    expect(e.rawPayloadRef).toBe("sr-row-42");
    const absent = evaluateSensorTruth(makeCandidate(), { nowMs: NOW_MS });
    expect(absent.rawPayloadRef).toBeNull();
  });

  it("persisted quality can only worsen an evaluation, never upgrade it", () => {
    // A fresh in-range live reading the sensor layer marked invalid.
    const invalidQ = evaluateSensorTruth(makeCandidate({ quality: "invalid" }), {
      nowMs: NOW_MS,
    });
    expect(invalidQ.usability).toBe("invalid");
    expect(invalidQ.excludedFromReasoning).toBe(true);
    expect(invalidQ.exclusionReason).toBe("upstream_quality");
    const staleQ = evaluateSensorTruth(makeCandidate({ quality: "stale" }), {
      nowMs: NOW_MS,
    });
    expect(staleQ.usability).toBe("stale");
    const degradedQ = evaluateSensorTruth(makeCandidate({ quality: "degraded" }), {
      nowMs: NOW_MS,
    });
    expect(degradedQ.usability).toBe("degraded");
    expect(degradedQ.warnings).toContain("upstream_quality");
    // quality "ok" never upgrades an untrusted source.
    const demoOk = evaluateSensorTruth(makeCandidate({ source: "demo", quality: "ok" }), {
      nowMs: NOW_MS,
    });
    expect(demoOk.excludedFromReasoning).toBe(true);
    expect(demoOk.exclusionReason).toBe("demo_source");
    // Unknown quality labels are deny-by-default invalid.
    const weird = evaluateSensorTruth(makeCandidate({ quality: "vibes" }), {
      nowMs: NOW_MS,
    });
    expect(weird.usability).toBe("invalid");
    expect(weird.warnings).toContain("unknown_quality");
  });

  it("rejects a unit-encoding metric key contradicted by an explicit unit", () => {
    const e = evaluateSensorTruth(
      makeCandidate({ metric: "temperature_f", value: 77, unit: "°C" }),
      { nowMs: NOW_MS },
    );
    expect(e.normalizedValue).toBeNull();
    expect(e.warnings).toContain("temperature_unit_suspected");
    expect(e.usability).toBe("invalid");
  });

  it("maps the persisted long-form ec metric to canonical soil EC", () => {
    const e = evaluateSensorTruth(makeCandidate({ metric: "ec", value: 1.8, unit: "mS/cm" }), {
      nowMs: NOW_MS,
    });
    expect(e.metric).toBe("soil_ec_ms_cm");
    expect(e.normalizedValue).toBe(1.8);
    expect(e.usability).toBe("usable");
  });

  it("treats explicitly malformed confidence conservatively, not as 1", () => {
    const nan = evaluateSensorTruth(makeCandidate({ confidence: Number.NaN }), {
      nowMs: NOW_MS,
    });
    expect(nan.adjustedConfidence).toBe(0);
    expect(nan.warnings).toContain("invalid_confidence");
    const absent = evaluateSensorTruth(makeCandidate({ confidence: null }), {
      nowMs: NOW_MS,
    });
    expect(absent.adjustedConfidence).toBe(1);
  });

  it("keeps unknown provider strings out of the provenance summary", () => {
    const e = evaluateSensorTruth(makeCandidate({ provider: "sk_live_secretvalue" }), {
      nowMs: NOW_MS,
    });
    expect(e.provenanceSummary).not.toContain("secretvalue");
    expect(e.provenanceSummary).not.toContain("Sk_live");
  });

  it("keeps arbitrary transport strings out of the provenance summary", () => {
    const e = evaluateSensorTruth(makeCandidate({ transport: "Bearer eyJhbGciOi.secret-token" }), {
      nowMs: NOW_MS,
    });
    expect(e.provenanceSummary).not.toContain("secret-token");
    expect(e.provenanceSummary).not.toContain("Bearer");
    // Canonical transports are still echoed.
    const canonical = evaluateSensorTruth(makeCandidate({ transport: "webhook" }), {
      nowMs: NOW_MS,
    });
    expect(canonical.provenanceSummary).toContain("webhook");
  });

  it("preserves the canonical capture timestamp for downstream auditing", () => {
    const e = evaluateSensorTruth(makeCandidate({ capturedAt: minutesAgo(5) }), {
      nowMs: NOW_MS,
    });
    expect(e.capturedAt).toBe(new Date(NOW_MS - 5 * 60_000).toISOString());
    const unparseable = evaluateSensorTruth(makeCandidate({ capturedAt: "nope" }), {
      nowMs: NOW_MS,
    });
    expect(unparseable.capturedAt).toBeNull();
  });

  it("rejects unknown units without guessing a conversion", () => {
    const e = evaluateSensorTruth(
      makeCandidate({ metric: "soil_ec_ms_cm", value: 2.4, unit: "banana" }),
      { nowMs: NOW_MS },
    );
    expect(e.warnings).toContain("ec_unit_unknown");
    expect(e.normalizedValue).toBeNull();
    expect(e.usability).toBe("invalid");
  });

  it("degrades humidity stuck at an extreme instead of calling it healthy", () => {
    const e = evaluateSensorTruth(
      makeCandidate({ metric: "humidity_pct", value: 100, unit: "%" }),
      { nowMs: NOW_MS },
    );
    expect(e.validity).toBe("suspicious");
    expect(e.usability).toBe("degraded");
    expect(e.excludedFromReasoning).toBe(false);
    expect(e.warnings).toContain("humidity_stuck_extreme");
    expect(e.adjustedConfidence).toBe(0.5);
  });

  it("degrades soil moisture stuck at 0 or 100", () => {
    for (const value of [0, 100]) {
      const e = evaluateSensorTruth(
        makeCandidate({ metric: "soil_moisture_pct", value, unit: "%" }),
        { nowMs: NOW_MS },
      );
      expect(e.usability).toBe("degraded");
      expect(e.warnings).toContain("soil_moisture_stuck_extreme");
    }
  });

  it("treats malformed or missing timestamps as unknown, excluded", () => {
    for (const capturedAt of ["not-a-time", "", null, undefined]) {
      const e = evaluateSensorTruth(makeCandidate({ capturedAt }), {
        nowMs: NOW_MS,
      });
      expect(e.freshness).toBe("unknown_timestamp");
      expect(e.usability).toBe("unknown");
      expect(e.excludedFromReasoning).toBe(true);
      expect(e.exclusionReason).toBe("missing_timestamp");
    }
  });

  it("rejects future-dated readings beyond the shared skew limit", () => {
    const e = evaluateSensorTruth(makeCandidate({ capturedAt: minutesAgo(-10) }), {
      nowMs: NOW_MS,
    });
    expect(e.freshness).toBe("future_invalid");
    expect(e.usability).toBe("invalid");
    expect(e.exclusionReason).toBe("future_timestamp");
    // Within the 5-minute skew allowance: still fresh.
    const withinSkew = evaluateSensorTruth(makeCandidate({ capturedAt: minutesAgo(-3) }), {
      nowMs: NOW_MS,
    });
    expect(withinSkew.freshness).toBe("fresh");
  });

  it("keeps missing values null — never zero", () => {
    const e = evaluateSensorTruth(makeCandidate({ value: null }), {
      nowMs: NOW_MS,
    });
    expect(e.normalizedValue).toBeNull();
    expect(e.validity).toBe("missing");
    expect(e.usability).toBe("unknown");
    expect(e.exclusionReason).toBe("missing_value");
  });

  it("classifies unknown metrics as unknown, excluded", () => {
    const e = evaluateSensorTruth(makeCandidate({ metric: "vibe_level", value: 11 }), {
      nowMs: NOW_MS,
    });
    expect(e.metric).toBeNull();
    expect(e.usability).toBe("unknown");
    expect(e.exclusionReason).toBe("unknown_metric");
  });
});

describe("truth-gated VPD derivation", () => {
  const temp = () => evaluateSensorTruth(makeCandidate(), { nowMs: NOW_MS });
  const rh = (value: number, overrides: Partial<SensorReadingCandidate> = {}) =>
    evaluateSensorTruth(makeCandidate({ metric: "humidity_pct", value, unit: "%", ...overrides }), {
      nowMs: NOW_MS,
    });

  it("derives vpd_kpa from usable inputs", () => {
    const r = deriveTruthGatedVpd(temp(), rh(55));
    expect(r.reason).toBe("derived");
    expect(r.vpdKpa).toBeCloseTo(1.34, 2);
  });

  it("refuses vpd_kpa from invalid temperature", () => {
    const badTemp = evaluateSensorTruth(makeCandidate({ value: 300 }), {
      nowMs: NOW_MS,
    });
    const r = deriveTruthGatedVpd(badTemp, rh(55));
    expect(r.vpdKpa).toBeNull();
    expect(r.reason).toBe("inputs_missing");
  });

  it("refuses vpd_kpa from stuck-at-extreme humidity (degraded, not usable)", () => {
    const r = deriveTruthGatedVpd(temp(), rh(0));
    expect(r.vpdKpa).toBeNull();
    expect(r.reason).toBe("humidity_not_usable");
  });

  it("refuses vpd_kpa from stale temperature", () => {
    const staleTemp = evaluateSensorTruth(makeCandidate({ capturedAt: minutesAgo(30) }), {
      nowMs: NOW_MS,
    });
    const r = deriveTruthGatedVpd(staleTemp, rh(55));
    expect(r.vpdKpa).toBeNull();
    expect(r.reason).toBe("temperature_not_usable");
  });

  it("refuses to combine readings from different tents", () => {
    const otherTentRh = evaluateSensorTruth(
      makeCandidate({
        metric: "humidity_pct",
        value: 55,
        unit: "%",
        tentId: "99999999-9999-4999-8999-999999999999",
      }),
      { nowMs: NOW_MS },
    );
    const r = deriveTruthGatedVpd(temp(), otherTentRh);
    expect(r.vpdKpa).toBeNull();
    expect(r.reason).toBe("context_mismatch");
  });

  it("refuses to pair non-contemporaneous temperature and humidity", () => {
    // Both usable (manual is fresh for 24h), but 2 hours apart — not the
    // same environmental moment.
    const oldRh = evaluateSensorTruth(
      makeCandidate({
        metric: "humidity_pct",
        value: 55,
        unit: "%",
        source: "manual",
        capturedAt: minutesAgo(120),
      }),
      { nowMs: NOW_MS },
    );
    expect(oldRh.usability).toBe("usable");
    const r = deriveTruthGatedVpd(temp(), oldRh);
    expect(r.vpdKpa).toBeNull();
    expect(r.reason).toBe("not_contemporaneous");
  });

  it("a missing vpd_kpa stays null — never zero", () => {
    const r = deriveTruthGatedVpd(null, null);
    expect(r.vpdKpa).toBeNull();
    expect(r.vpdKpa).not.toBe(0);
  });
});

describe("series evaluation", () => {
  it("surfaces conflicting sensors without flattening them", () => {
    const series = evaluateSensorSeries(
      [makeCandidate({ value: 22 }), makeCandidate({ value: 27 })],
      { nowMs: NOW_MS },
    );
    expect(series.conflicts).toHaveLength(1);
    expect(series.conflicts[0]).toMatchObject({
      tentId: TENT,
      metric: "temperature_c",
      spread: 5,
      readingCount: 2,
    });
    for (const e of series.evaluations) {
      expect(e.warnings).toContain("sensor_conflict");
      expect(e.normalizedValue).not.toBeNull();
    }
    // No aggregation was requested → none happens.
    expect(series.aggregates).toEqual([]);
  });

  it("keeps root-zone readings from different plants in separate groups", () => {
    const rootZone = (plantId: string, value: number) =>
      makeCandidate({ metric: "soil_moisture_pct", unit: "%", plantId, value });
    const series = evaluateSensorSeries([rootZone("plant-a", 20), rootZone("plant-b", 65)], {
      nowMs: NOW_MS,
      aggregation: { rule: "mean" },
    });
    // Two plants legitimately differing is NOT a sensor conflict...
    expect(series.conflicts).toEqual([]);
    // ...and their values are never averaged into one tent-level number.
    expect(series.aggregates).toHaveLength(2);
    expect(series.aggregates.map((a) => a.plantId).sort()).toEqual(["plant-a", "plant-b"]);
    expect(series.aggregates.map((a) => a.value).sort((x, y) => x - y)).toEqual([20, 65]);
    // Atmospheric metrics stay tent-scoped regardless of plant id.
    const air = evaluateSensorSeries(
      [
        makeCandidate({ plantId: "plant-a", value: 22 }),
        makeCandidate({ plantId: "plant-b", value: 27 }),
      ],
      { nowMs: NOW_MS },
    );
    expect(air.conflicts).toHaveLength(1);
    expect(air.conflicts[0].plantId).toBeNull();
  });

  it("a device whose newest sample is excluded contributes nothing current", () => {
    const dev = (minsAgo: number, value: number) =>
      makeCandidate({ deviceId: "dev-1", capturedAt: minutesAgo(minsAgo), value });
    // Older usable 24, newer invalid 999: the stale-good sample must not
    // be resurrected as the device's current reading.
    const series = evaluateSensorSeries([dev(10, 24), dev(5, 999)], {
      nowMs: NOW_MS,
      aggregation: { rule: "mean" },
    });
    expect(series.aggregates).toEqual([]);
    expect(series.conflicts).toEqual([]);
  });

  it("does not report readings far apart in time as a simultaneous conflict", () => {
    const manual = (minsAgo: number, value: number, deviceId: string) =>
      makeCandidate({
        source: "manual",
        deviceId,
        capturedAt: minutesAgo(minsAgo),
        value,
      });
    // Both usable under the 24h manual window, but 23h apart — history,
    // not simultaneous disagreement; only the newest is current.
    const series = evaluateSensorSeries([manual(23 * 60, 20, "m-1"), manual(5, 30, "m-2")], {
      nowMs: NOW_MS,
      aggregation: { rule: "mean" },
    });
    expect(series.conflicts).toEqual([]);
    expect(series.aggregates).toHaveLength(1);
    expect(series.aggregates[0].value).toBe(30);
  });

  it("treats successive samples from one device as history, not a conflict", () => {
    const sample = (minsAgo: number, value: number) =>
      makeCandidate({ deviceId: "dev-1", capturedAt: minutesAgo(minsAgo), value });
    const series = evaluateSensorSeries([sample(10, 21), sample(5, 27)], {
      nowMs: NOW_MS,
      aggregation: { rule: "mean" },
    });
    // Same device, two moments in time: no cross-sensor conflict...
    expect(series.conflicts).toEqual([]);
    // ...and only the LATEST sample enters the aggregate.
    expect(series.aggregates).toHaveLength(1);
    expect(series.aggregates[0].value).toBe(27);
    expect(series.aggregates[0].usableCount).toBe(1);
    // Two DIFFERENT devices disagreeing at the same time is a conflict.
    const twoDevices = evaluateSensorSeries(
      [
        makeCandidate({ deviceId: "dev-1", value: 21 }),
        makeCandidate({ deviceId: "dev-2", value: 27 }),
      ],
      { nowMs: NOW_MS },
    );
    expect(twoDevices.conflicts).toHaveLength(1);
  });

  it("flags conflicts between two sensors on the same plant", () => {
    const rootZone = (value: number) =>
      makeCandidate({
        metric: "soil_moisture_pct",
        unit: "%",
        plantId: "plant-a",
        value,
      });
    const series = evaluateSensorSeries([rootZone(20), rootZone(65)], {
      nowMs: NOW_MS,
    });
    expect(series.conflicts).toHaveLength(1);
    expect(series.conflicts[0].plantId).toBe("plant-a");
  });

  it("does not flag agreeing sensors", () => {
    const series = evaluateSensorSeries(
      [makeCandidate({ value: 23 }), makeCandidate({ value: 24 })],
      { nowMs: NOW_MS },
    );
    expect(series.conflicts).toEqual([]);
  });

  it("aggregates only under an explicit rule and excludes non-usable data", () => {
    const series = evaluateSensorSeries(
      [
        makeCandidate({ value: 22 }),
        makeCandidate({ value: 24 }),
        makeCandidate({ value: 300 }),
        makeCandidate({ value: 23, source: "demo" }),
      ],
      { nowMs: NOW_MS, aggregation: { rule: "mean" } },
    );
    expect(series.aggregates).toHaveLength(1);
    expect(series.aggregates[0]).toMatchObject({
      metric: "temperature_c",
      rule: "mean",
      value: 23,
      usableCount: 2,
      excludedCount: 2,
    });
  });

  it("is deterministic: same rows and injected time produce identical output", () => {
    const candidates = [
      makeCandidate({ value: 22 }),
      makeCandidate({ metric: "humidity_pct", value: 61, unit: "%" }),
      makeCandidate({ source: "demo", value: 25 }),
      makeCandidate({ capturedAt: minutesAgo(45) }),
    ];
    const a = evaluateSensorSeries(candidates, { nowMs: NOW_MS });
    const b = evaluateSensorSeries(candidates, { nowMs: NOW_MS });
    expect(serializeSkillContract(a)).toBe(serializeSkillContract(b));
  });
});

describe("provenance summary", () => {
  it("counts sources in canonical order and rolls up warnings", () => {
    const series = evaluateSensorSeries(
      [
        makeCandidate(),
        makeCandidate({ source: "manual" }),
        makeCandidate({ source: "demo" }),
        makeCandidate({ source: "vendor_x" }),
      ],
      { nowMs: NOW_MS },
    );
    const summary = summarizeSensorProvenance(series.evaluations);
    expect(summary.sourceCounts).toEqual([
      { source: "live", count: 1 },
      { source: "manual", count: 1 },
      { source: "demo", count: 1 },
      { source: "invalid", count: 1 },
    ]);
    expect(summary.includedCount).toBe(2);
    expect(summary.excludedCount).toBe(2);
    expect(summary.warnings).toContain("demo_source");
    expect(summary.warnings).toContain("unknown_source");
    expect([...summary.warnings]).toEqual([...summary.warnings].sort());
  });
});

describe("interop mappers", () => {
  it("maps usability onto the snapshot status contract and DB quality", () => {
    expect(usabilityToSnapshotStatus("usable")).toBe("usable");
    expect(usabilityToSnapshotStatus("degraded")).toBe("needs_review");
    expect(usabilityToSnapshotStatus("stale")).toBe("stale");
    expect(usabilityToSnapshotStatus("invalid")).toBe("invalid");
    expect(usabilityToSnapshotStatus("unknown")).toBe("needs_review");
    expect(usabilityToDbQuality("usable")).toBe("ok");
    expect(usabilityToDbQuality("degraded")).toBe("degraded");
    expect(usabilityToDbQuality("stale")).toBe("stale");
    expect(usabilityToDbQuality("invalid")).toBe("invalid");
    expect(usabilityToDbQuality("unknown")).toBe("invalid");
  });
});

describe("normalizeSensorCandidate", () => {
  it("converts declared Fahrenheit readings to Celsius", () => {
    const n = normalizeSensorCandidate({
      metric: "temperature_f",
      value: 77,
      unit: "F",
    });
    expect(n.metric).toBe("temperature_c");
    expect(n.value).toBeCloseTo(25, 5);
    expect(n.unit).toBe("°C");
  });

  it("never substitutes zero for a missing value", () => {
    const n = normalizeSensorCandidate({
      metric: "temperature_c",
      value: null,
      unit: "°C",
    });
    expect(n.value).toBeNull();
    expect(n.warnings).toContain("missing_value");
  });
});
