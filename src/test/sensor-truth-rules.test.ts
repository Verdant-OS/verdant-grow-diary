/**
 * Tests for src/lib/sensorTruthRules.ts and its wiring into the tent
 * header view + AI Doctor sensor context classifier.
 *
 * Safety scope:
 *   - No fake-live labels are introduced.
 *   - Invalid readings are excluded from latest-snapshot fields and AI
 *     Doctor "usable" inputs.
 *   - Stale-but-realistic readings stay stale, not invalid.
 *   - Manual realistic readings stay manual.
 */
import { describe, it, expect } from "vitest";
import {
  AIR_TEMP_F_REALISTIC,
  applySensorTruth,
  classifySnapshotTruth,
  isAirTempCRealistic,
  isAirTempFRealistic,
  isHumidityRealistic,
  isHumidityStuckExtreme,
  isPhRealistic,
  isSoilEcMscmRealistic,
  isSoilEcUnitMismatchSuspected,
  isSoilMoistureRealistic,
  isVpdRealistic,
  TRUTH_REASON_CHIP,
} from "@/lib/sensorTruthRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";
import { mapSensorReadingToAiDoctorContext } from "@/lib/aiDoctorSensorContextRules";
import type { NormalizedSensorReading } from "@/lib/sensorReadingNormalizationRules";

const NOW = Date.UTC(2026, 5, 7, 12, 0, 0);
const FRESH = new Date(NOW - 60_000).toISOString();
const STALE = new Date(NOW - 60 * 60 * 1000).toISOString();

function snap(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "manual",
    ts: FRESH,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: null,
    soil: 35,
    soil_ec: 1.4,
    soil_temp: 22,
    ppfd: null,
    device_id: null,
    ...overrides,
  };
}

describe("sensorTruthRules · pure validators", () => {
  it("rejects extreme air temperatures outside grow-room realism", () => {
    // 60°C ≈ 140°F (above AIR_TEMP_F_REALISTIC.max=110)
    expect(isAirTempCRealistic(60)).toBe(false);
    // -5°C ≈ 23°F (below 40°F)
    expect(isAirTempCRealistic(-5)).toBe(false);
    // 24°C ≈ 75°F is fine.
    expect(isAirTempCRealistic(24)).toBe(true);
    // missing is allowed (missing ≠ invalid)
    expect(isAirTempCRealistic(null)).toBe(true);
  });

  it("validates Fahrenheit bounds directly", () => {
    expect(isAirTempFRealistic(AIR_TEMP_F_REALISTIC.min - 1)).toBe(false);
    expect(isAirTempFRealistic(AIR_TEMP_F_REALISTIC.max + 1)).toBe(false);
    expect(isAirTempFRealistic(75)).toBe(true);
  });

  it("rejects humidity outside 0–100 and flags stuck extremes", () => {
    expect(isHumidityRealistic(-1)).toBe(false);
    expect(isHumidityRealistic(101)).toBe(false);
    expect(isHumidityRealistic(55)).toBe(true);
    expect(isHumidityStuckExtreme(0)).toBe(true);
    expect(isHumidityStuckExtreme(100)).toBe(true);
    expect(isHumidityStuckExtreme(55)).toBe(false);
  });

  it("rejects impossible VPD values", () => {
    expect(isVpdRealistic(0)).toBe(false); // below 0.2 floor
    expect(isVpdRealistic(5)).toBe(false); // way above 3.0 kPa
    expect(isVpdRealistic(1.0)).toBe(true);
  });

  it("rejects soil moisture outside 0–100", () => {
    expect(isSoilMoistureRealistic(-5)).toBe(false);
    expect(isSoilMoistureRealistic(150)).toBe(false);
    expect(isSoilMoistureRealistic(40)).toBe(true);
  });

  it("flags suspicious soil EC unit-mismatch (µS/cm posing as mS/cm)", () => {
    expect(isSoilEcUnitMismatchSuspected(1450)).toBe(true);
    expect(isSoilEcUnitMismatchSuspected(1.4)).toBe(false);
    expect(isSoilEcMscmRealistic(1450)).toBe(false);
    expect(isSoilEcMscmRealistic(1.4)).toBe(true);
  });

  it("validates pH realism for cultivation", () => {
    expect(isPhRealistic(6.2)).toBe(true);
    expect(isPhRealistic(2.5)).toBe(false);
    expect(isPhRealistic(9.5)).toBe(false);
  });
});

describe("classifySnapshotTruth", () => {
  it("returns an unchanged-shape result for unavailable snapshots", () => {
    const r = classifySnapshotTruth(null);
    expect(r.snapshot).toBe(EMPTY_SNAPSHOT);
    expect(r.invalidFields).toEqual([]);
    expect(r.reasonChips).toEqual([]);
    expect(r.hasInvalid).toBe(false);
  });

  it("rejects impossible temperature and chips it as 'Invalid temp'", () => {
    const r = classifySnapshotTruth(snap({ temp: 65 /* ≈ 149°F */ }), NOW);
    expect(r.snapshot.temp).toBeNull();
    expect(r.invalidFields).toContain("temp");
    expect(r.reasonChips).toContain(TRUTH_REASON_CHIP.invalid_temp);
    // VPD must also drop because its derivation input is invalid.
    expect(r.snapshot.vpd).toBeNull();
    expect(r.reasonCodes).toContain("vpd_dropped_temp_rh_invalid");
    expect(r.hasInvalid).toBe(true);
  });

  it("rejects impossible VPD on its own (temp/rh fine)", () => {
    const r = classifySnapshotTruth(snap({ vpd: 7.2 }), NOW);
    expect(r.snapshot.vpd).toBeNull();
    expect(r.reasonChips).toContain(TRUTH_REASON_CHIP.invalid_vpd);
    expect(r.snapshot.temp).toBe(24);
    expect(r.snapshot.rh).toBe(55);
  });

  it("flags Celsius-looking Fahrenheit as suspicious (very low °C value)", () => {
    // 5°C ≈ 41°F — within bounds but unusual. We expect it to be allowed
    // (no over-flagging). The dedicated invalid case is 35°F = 1.66°C.
    expect(classifySnapshotTruth(snap({ temp: 5 }), NOW).hasInvalid).toBe(false);
    // 1.6°C ≈ 35°F → below 40°F realistic floor → invalid temp
    const r = classifySnapshotTruth(snap({ temp: 1.6 }), NOW);
    expect(r.invalidFields).toContain("temp");
  });

  it("keeps a stale-but-realistic reading classified as stale, not invalid", () => {
    const r = classifySnapshotTruth(snap({ ts: STALE }), NOW);
    expect(r.stale).toBe(true);
    expect(r.hasInvalid).toBe(false);
    expect(r.snapshot.temp).toBe(24); // value preserved
    expect(r.reasonChips).toContain(TRUTH_REASON_CHIP.stale_reading);
  });

  it("keeps a manual realistic reading classified as manual with no chips", () => {
    const r = classifySnapshotTruth(snap({ source: "manual" }), NOW);
    expect(r.snapshot.source).toBe("manual"); // not collapsed
    expect(r.hasInvalid).toBe(false);
    expect(r.reasonChips).toEqual([]);
  });

  it("flags soil EC unit-mismatch with the dedicated chip", () => {
    const r = classifySnapshotTruth(snap({ soil_ec: 1450 }), NOW);
    expect(r.snapshot.soil_ec).toBeNull();
    expect(r.reasonChips).toContain(TRUTH_REASON_CHIP.unit_mismatch_suspected);
  });

  it("does not invent a fake-live label for invalid data", () => {
    const r = classifySnapshotTruth(
      snap({ source: "manual", temp: 99, rh: 200 }),
      NOW,
    );
    // Source is preserved as-is; we never promote it to "live" or
    // downgrade it silently.
    expect(r.snapshot.source).toBe("manual");
  });
});

describe("applySensorTruth", () => {
  it("strips invalid metrics and excludes them from the latest snapshot", () => {
    const cleaned = applySensorTruth(snap({ temp: 75, rh: -3, vpd: 1.2 }), NOW);
    expect(cleaned.rh).toBeNull();
    // VPD dropped because RH invalid
    expect(cleaned.vpd).toBeNull();
    expect(cleaned.temp).toBe(75); // wait: 75°C ≈ 167°F → invalid
  });

  it("excludes impossible temp from the latest healthy snapshot", () => {
    const cleaned = applySensorTruth(snap({ temp: 75 }), NOW);
    expect(cleaned.temp).toBeNull();
  });
});

describe("buildTentSensorHeaderView · truth filtering", () => {
  it("nulls impossible header values and exposes reason chips", () => {
    const rows = [
      { ts: FRESH, metric: "temperature_c", value: 70, source: "manual" }, // ≈ 158°F
      { ts: FRESH, metric: "humidity_pct", value: 55, source: "manual" },
      { ts: FRESH, metric: "vpd_kpa", value: 1.1, source: "manual" },
    ];
    const view = buildTentSensorHeaderView(rows, NOW);
    expect(view.hasReadings).toBe(true);
    expect(view.snapshot?.temp).toBeNull();
    expect(view.snapshot?.vpd).toBeNull();
    expect(view.truth?.invalidFields).toEqual(
      expect.arrayContaining(["temp", "vpd"]),
    );
    expect(view.truth?.reasonChips).toContain(TRUTH_REASON_CHIP.invalid_temp);
    expect(view.sourceLabel).toBeTruthy();
    // No fake-live promotion.
    expect(view.snapshot?.source).toBe("manual");
  });

  it("preserves realistic stale headers as stale, not invalid", () => {
    const rows = [
      { ts: STALE, metric: "temperature_c", value: 24, source: "live" },
      { ts: STALE, metric: "humidity_pct", value: 55, source: "live" },
    ];
    const view = buildTentSensorHeaderView(rows, NOW);
    expect(view.stale).toBe(true);
    expect(view.truth?.hasInvalid).toBe(false);
    expect(view.snapshot?.temp).toBe(24);
  });
});

describe("mapSensorReadingToAiDoctorContext · VPD depends on temp/RH", () => {
  function reading(
    overrides: Partial<NormalizedSensorReading> = {},
  ): NormalizedSensorReading {
    return {
      source: "live",
      captured_at: FRESH,
      temperature_c: 24,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      co2_ppm: 800,
      soil_moisture_pct: 40,
      ppfd_umol_m2s: 600,
      ...overrides,
    } as NormalizedSensorReading;
  }

  it("excludes VPD from usable metrics when temperature is invalid", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      reading({ temperature_c: 999 }),
    );
    expect(ctx.invalidMetrics).toContain("temperature_c");
    expect(ctx.invalidMetrics).toContain("vpd_kpa");
    expect(ctx.usableMetrics).not.toContain("vpd_kpa");
    expect(ctx.confidenceImpact).toBe("untrusted");
  });

  it("excludes VPD when humidity is invalid", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      reading({ humidity_pct: 250 }),
    );
    expect(ctx.invalidMetrics).toContain("humidity_pct");
    expect(ctx.invalidMetrics).toContain("vpd_kpa");
    expect(ctx.usableMetrics).not.toContain("vpd_kpa");
  });

  it("keeps VPD usable when temp/RH are realistic", () => {
    const ctx = mapSensorReadingToAiDoctorContext(reading());
    expect(ctx.usableMetrics).toContain("vpd_kpa");
    expect(ctx.invalidMetrics).not.toContain("vpd_kpa");
  });

  it("never introduces a fake-live label for invalid readings", () => {
    const ctx = mapSensorReadingToAiDoctorContext(
      reading({ source: "invalid", temperature_c: 999 }),
    );
    expect(ctx.sourceState).toBe("invalid");
    expect(ctx.contextSummary.toLowerCase()).not.toContain("healthy");
    expect(ctx.contextSummary.toLowerCase()).not.toContain("normal");
  });
});
