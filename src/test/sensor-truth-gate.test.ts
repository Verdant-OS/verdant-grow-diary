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
