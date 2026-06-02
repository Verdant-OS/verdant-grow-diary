/**
 * manualSensorSnapshotRules — pure validation + VPD tests.
 */
import { describe, it, expect } from "vitest";

import {
  computeVpdKpa,
  validateManualSnapshot,
  EC_SUSPICIOUS_MSCM_MAX,
  PH_REALISTIC_RANGE,
} from "@/lib/manualSensorSnapshotRules";

describe("validateManualSnapshot — happy path", () => {
  it("accepts valid temp/RH/CO2 + soil + reservoir fields", () => {
    const out = validateManualSnapshot({
      airTemp: 75,
      airTempUnit: "F",
      humidityPct: 55,
      co2Ppm: 900,
      soilMoisturePct: 45,
      soilTempC: 22,
      soilEc: 2.3,
      soilEcUnit: "mS/cm",
      reservoirPh: 5.8,
      reservoirEc: 1.6,
      reservoirEcUnit: "mS/cm",
      ppfd: 650,
    });
    expect(out.ok).toBe(true);
    expect(out.errors).toEqual([]);
    expect(out.source).toBe("manual");
    const fields = out.metrics.map((m) => m.field).sort();
    expect(fields).toContain("air_temp_c");
    expect(fields).toContain("humidity_pct");
    expect(fields).toContain("co2_ppm");
    expect(fields).toContain("soil_moisture_pct");
    expect(fields).toContain("soil_temp_c");
    expect(fields).toContain("soil_ec_mscm");
    expect(fields).toContain("reservoir_ph");
    expect(fields).toContain("reservoir_ec_mscm");
    expect(fields).toContain("ppfd");
    expect(fields).toContain("vpd_kpa");
  });

  it("does not invent demo values when fields are missing", () => {
    const out = validateManualSnapshot({ humidityPct: 50 });
    expect(out.ok).toBe(true);
    const fieldSet = new Set(out.metrics.map((m) => m.field));
    expect(fieldSet.has("humidity_pct")).toBe(true);
    expect(fieldSet.has("co2_ppm")).toBe(false);
    expect(fieldSet.has("soil_moisture_pct")).toBe(false);
    // No VPD without temp.
    expect(fieldSet.has("vpd_kpa")).toBe(false);
  });
});

describe("computeVpdKpa", () => {
  it("is deterministic and rounded to 3 decimals", () => {
    const a = computeVpdKpa({ tempC: 24, rhPct: 55 });
    const b = computeVpdKpa({ tempC: 24, rhPct: 55 });
    expect(a).toEqual(b);
    expect(a.state).toBe("computed");
    if (a.state === "computed") {
      expect(Number.isFinite(a.valueKpa)).toBe(true);
      // VPD at 24°C / 55% RH is ~1.34 kPa.
      expect(a.valueKpa).toBeGreaterThan(1.2);
      expect(a.valueKpa).toBeLessThan(1.5);
      // 3-decimal rounding.
      expect(Math.round(a.valueKpa * 1000)).toBe(a.valueKpa * 1000);
    }
  });

  it("returns needs_inputs when temp or RH is missing", () => {
    expect(computeVpdKpa({ tempC: null, rhPct: 55 }).state).toBe("needs_inputs");
    expect(computeVpdKpa({ tempC: 24, rhPct: null }).state).toBe("needs_inputs");
    expect(computeVpdKpa({ tempC: null, rhPct: null }).state).toBe("needs_inputs");
    const r = computeVpdKpa({ tempC: 24, rhPct: 150 });
    expect(r.state).toBe("needs_inputs");
  });
});

describe("validateManualSnapshot — flags bad / suspicious values", () => {
  it("flags humidity outside 0–100 as error", () => {
    const high = validateManualSnapshot({ humidityPct: 120 });
    expect(high.ok).toBe(false);
    expect(high.errors.join(" ")).toMatch(/Humidity/);
    const neg = validateManualSnapshot({ humidityPct: -1 });
    expect(neg.ok).toBe(false);
  });

  it("warns on unrealistic reservoir pH (outside cultivation range)", () => {
    const out = validateManualSnapshot({ reservoirPh: 9.2 });
    expect(out.warnings.join(" ")).toMatch(/realistic/i);
    expect(out.warnings.join(" ")).toMatch(new RegExp(`${PH_REALISTIC_RANGE.max}`));
    // Still produces a metric — does not silently drop the reading.
    expect(out.metrics.find((m) => m.field === "reservoir_ph")?.value).toBe(9.2);
  });

  it("rejects pH outside 0..14 as error", () => {
    const out = validateManualSnapshot({ reservoirPh: 15 });
    expect(out.errors.join(" ")).toMatch(/0 and 14/);
  });

  it("warns when reservoir EC looks like µS/cm but mS/cm is selected", () => {
    const out = validateManualSnapshot({
      reservoirEc: EC_SUSPICIOUS_MSCM_MAX + 100,
      reservoirEcUnit: "mS/cm",
    });
    expect(out.warnings.join(" ")).toMatch(/µS\/cm/);
    expect(out.warnings.join(" ")).toMatch(/may be a unit mismatch/);
  });

  it("warns when air temp °F looks like a Celsius reading", () => {
    const out = validateManualSnapshot({ airTemp: 24, airTempUnit: "F" });
    expect(out.warnings.join(" ")).toMatch(/looks like a Celsius reading/);
  });

  it("warns when soil moisture is stuck at 0 or 100", () => {
    const zero = validateManualSnapshot({ soilMoisturePct: 0 });
    expect(zero.warnings.join(" ")).toMatch(/stuck/);
    const full = validateManualSnapshot({ soilMoisturePct: 100 });
    expect(full.warnings.join(" ")).toMatch(/stuck/);
  });

  it("does not classify suspicious telemetry as healthy (warnings stay warnings)", () => {
    const out = validateManualSnapshot({
      airTemp: 24,
      airTempUnit: "F",
      reservoirPh: 9.2,
    });
    // ok is allowed (no hard errors), but warnings must exist.
    expect(out.warnings.length).toBeGreaterThan(0);
    // Source never upgrades.
    expect(out.source).toBe("manual");
  });

  it("source is always manual on the save path", () => {
    const out = validateManualSnapshot({ airTemp: 75, humidityPct: 50 });
    expect(out.source).toBe("manual");
    // Sanity check the public surface does not leak a 'live' label anywhere.
    const blob = JSON.stringify(out);
    expect(blob.toLowerCase()).not.toMatch(/"live"/);
  });
});

describe("validateManualSnapshot — VPD plumbing", () => {
  it("uses entered VPD when provided", () => {
    const out = validateManualSnapshot({
      airTemp: 75,
      airTempUnit: "F",
      humidityPct: 55,
      vpdKpa: 1.05,
    });
    const vpd = out.metrics.find((m) => m.field === "vpd_kpa");
    expect(vpd?.value).toBe(1.05);
    expect(vpd?.derived).toBeUndefined();
  });

  it("derives VPD from temp+RH when not provided", () => {
    const out = validateManualSnapshot({
      airTemp: 75,
      airTempUnit: "F",
      humidityPct: 55,
    });
    const vpd = out.metrics.find((m) => m.field === "vpd_kpa");
    expect(vpd?.derived).toBe(true);
    expect(vpd && vpd.value > 0).toBe(true);
  });

  it("returns needs_inputs vpd state when temp or RH missing", () => {
    const out = validateManualSnapshot({ co2Ppm: 800 });
    expect(out.vpd?.state).toBe("needs_inputs");
  });
});
