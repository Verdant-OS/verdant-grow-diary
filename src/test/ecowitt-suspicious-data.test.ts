import { describe, it, expect } from "vitest";
import { evaluateEcowittSuspicion } from "@/lib/ecowittSuspiciousReadingRules";
import { normalizeEcowittPayload } from "@/lib/ecowittPayloadRules";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z";

describe("ecowittSuspiciousReadingRules.evaluateEcowittSuspicion", () => {
  it("returns no flags for a clean reading", () => {
    const r = evaluateEcowittSuspicion({
      temperatureC: 25,
      humidityPct: 55,
      soilMoisturePct: 40,
      rawTempF: 77,
    });
    expect(r.flags).toEqual([]);
    expect(r.worst).toBeNull();
    expect(r.hasInvalid).toBe(false);
  });

  it("marks RH > 100 as invalid", () => {
    const r = evaluateEcowittSuspicion({ humidityPct: 150 });
    expect(r.hasInvalid).toBe(true);
    expect(r.flags[0].code).toBe("rh_out_of_range_invalid");
  });

  it("marks RH < 0 as invalid", () => {
    const r = evaluateEcowittSuspicion({ humidityPct: -5 });
    expect(r.hasInvalid).toBe(true);
  });

  it("marks implausibly hot temperature as invalid", () => {
    const r = evaluateEcowittSuspicion({ temperatureC: 95 });
    expect(r.hasInvalid).toBe(true);
    expect(r.flags[0].code).toBe("temperature_implausible_invalid");
  });

  it("flags Celsius-looking Fahrenheit as suspicious", () => {
    const r = evaluateEcowittSuspicion({ temperatureC: 5, rawTempF: 25 });
    expect(r.worst).toBe("suspicious");
    expect(r.flags.some((f) => f.code === "celsius_looking_fahrenheit")).toBe(true);
  });

  it("flags humidity stuck at extreme after 3+ samples", () => {
    const r = evaluateEcowittSuspicion({
      humidityPct: 100,
      recentHumidityPct: [100, 100, 100],
    });
    expect(r.flags.some((f) => f.code === "humidity_stuck_extreme")).toBe(true);
  });

  it("does not flag humidity stuck after only 2 samples", () => {
    const r = evaluateEcowittSuspicion({
      humidityPct: 0,
      recentHumidityPct: [0, 0],
    });
    expect(r.flags.some((f) => f.code === "humidity_stuck_extreme")).toBe(false);
  });

  it("flags soil moisture stuck at extreme", () => {
    const r = evaluateEcowittSuspicion({
      soilMoisturePct: 0,
      recentSoilMoisturePct: [0, 0, 0, 0],
    });
    expect(r.flags.some((f) => f.code === "soil_moisture_stuck_extreme")).toBe(true);
  });

  it("marks RH 0 + sub-freezing temperature as physically impossible", () => {
    const r = evaluateEcowittSuspicion({ humidityPct: 0, temperatureC: -5 });
    expect(r.hasInvalid).toBe(true);
    expect(r.flags.some((f) => f.code === "impossible_temp_rh_combo")).toBe(true);
  });

  it("never returns 'healthy' phrasing in any flag message", () => {
    const r = evaluateEcowittSuspicion({ humidityPct: 200 });
    for (const f of r.flags) expect(f.message.toLowerCase()).not.toContain("healthy");
  });
});

describe("ecowittPayloadRules suspicious-data integration", () => {
  it("propagates RH out-of-range to snapshot.invalid=true and refuses derived VPD", () => {
    const snap = normalizeEcowittPayload(
      { dateutc: FRESH_AT, temp1f: 77, humidity1: 150 },
      { now: NOW },
    );
    expect(snap.invalid).toBe(true);
    expect(snap.derivedVpdKpa).toBeNull();
    expect(snap.suspicionSeverity).toBe("invalid");
  });

  it("propagates stuck-humidity history into the snapshot as suspicious", () => {
    const snap = normalizeEcowittPayload(
      { dateutc: FRESH_AT, temp1f: 77, humidity1: 100 },
      {
        now: NOW,
        recentHumidityPct: [100, 100, 100, 100],
      },
    );
    expect(snap.suspicionSeverity).toBe("suspicious");
    expect(snap.invalid).toBe(false);
    // Suspicious (not invalid) → derived VPD may still compute.
    expect(snap.derivedVpdKpa).not.toBeNull();
  });

  it("keeps the snapshot ok=false when invalid even if readings parsed", () => {
    const snap = normalizeEcowittPayload(
      { dateutc: FRESH_AT, temp1f: 200 /* implausible */, humidity1: 55 },
      { now: NOW },
    );
    expect(snap.invalid).toBe(true);
    expect(snap.ok).toBe(false);
  });
});
