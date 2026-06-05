import { describe, it, expect } from "vitest";
import { normalizeEcowittPayload } from "@/lib/ecowittPayloadRules";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z"; // 10 min ago
const STALE_AT = "2026-06-04T11:00:00Z"; // 90 min ago

describe("ecowittPayloadRules.normalizeEcowittPayload", () => {
  it("maps temp1f, humidity1, soilmoisture1, co2 to canonical metrics", () => {
    const snap = normalizeEcowittPayload(
      {
        dateutc: FRESH_AT.replace("T", " ").replace("Z", ""),
        temp1f: "77",
        humidity1: "55",
        soilmoisture1: "42",
        co2: "850",
        passkey: "should-be-suppressed",
      },
      { now: NOW },
    );

    expect(snap.ok).toBe(true);
    expect(snap.vendor).toBe("ecowitt");
    const byMetric = Object.fromEntries(
      snap.readings.map((r) => [r.metric, r.value] as const),
    );
    // 77F -> 25C
    expect(byMetric.temperature_c).toBeCloseTo(25, 1);
    expect(byMetric.humidity_pct).toBe(55);
    expect(byMetric.soil_moisture_pct).toBe(42);
    expect(byMetric.co2_ppm).toBe(850);
  });

  it("preserves the raw payload on the result", () => {
    const payload = { temp1f: 70, humidity1: 50, dateutc: FRESH_AT };
    const snap = normalizeEcowittPayload(payload, { now: NOW });
    expect(snap.rawPayload).toBe(payload);
  });

  it("computes derived VPD from temp + RH and never marks it live", () => {
    const snap = normalizeEcowittPayload(
      { temp1f: 77, humidity1: 55, dateutc: FRESH_AT },
      { now: NOW },
    );
    expect(snap.derivedVpdKpa).not.toBeNull();
    expect(snap.derivedVpdKpa!).toBeGreaterThan(1.0);
    expect(snap.derivedVpdKpa!).toBeLessThan(1.6);
    // Derived VPD is not a reading; never injected into readings as "live".
    expect(snap.readings.find((r) => (r as { metric: string }).metric === "vpd_kpa"))
      .toBeUndefined();
  });

  it("returns null derived VPD when humidity is impossible", () => {
    const snap = normalizeEcowittPayload(
      { temp1f: 77, humidity1: 150, dateutc: FRESH_AT },
      { now: NOW },
    );
    // RH 150 still passes through adapter as a raw reading; derived VPD must refuse it.
    expect(snap.derivedVpdKpa).toBeNull();
  });

  it("flags freshness=stale when captured_at is older than the stale window", () => {
    const snap = normalizeEcowittPayload(
      { temp1f: 70, humidity1: 50, dateutc: STALE_AT },
      { now: NOW },
    );
    expect(snap.freshness).toBe("stale");
    expect(snap.ageMinutes).toBeGreaterThan(30);
  });

  it("returns freshness=missing when captured_at cannot be parsed", () => {
    const snap = normalizeEcowittPayload(
      { temp1f: 70, humidity1: 50 },
      { now: NOW },
    );
    expect(snap.freshness).toBe("missing");
    expect(snap.capturedAt).toBeNull();
  });

  it("returns ok=false when payload is not an object", () => {
    const snap = normalizeEcowittPayload(null, { now: NOW });
    expect(snap.ok).toBe(false);
    expect(snap.readings).toEqual([]);
  });

  it("drops implausible CO2 instead of presenting it as healthy", () => {
    const snap = normalizeEcowittPayload(
      { temp1f: 70, humidity1: 50, co2: 99999, dateutc: FRESH_AT },
      { now: NOW },
    );
    expect(snap.readings.find((r) => r.metric === "co2_ppm")).toBeUndefined();
    expect(snap.warnings).toContain("co2_value_implausible");
  });
});

import { normalizeEcowittCloudReadings } from "@/lib/ecowittPayloadRules";

const CLOUD_NOW = new Date("2026-06-04T12:30:00Z");
const CLOUD_FRESH = "2026-06-04 12:20:00"; // 10 min ago, naive UTC
const CLOUD_STALE = "2026-06-04 11:00:00"; // 90 min ago
const MAC_A = "AA:BB:CC:DD:EE:01";
const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";

const baseMapping = {
  byMac: {
    [MAC_A]: {
      air: { 1: TENT_A, 2: TENT_B },
      soil: { 1: TENT_A },
    },
  },
};

const UI_FORBIDDEN = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
];

function assertUiCopySafe(strs: string[]) {
  for (const s of strs) {
    for (const word of UI_FORBIDDEN) {
      expect(s.toLowerCase()).not.toContain(word);
    }
  }
}

describe("normalizeEcowittCloudReadings", () => {
  it("routes valid multi-channel payload to mapped tents as source=live", () => {
    const res = normalizeEcowittCloudReadings(
      {
        MAC: MAC_A,
        dateutc: CLOUD_FRESH,
        temp1f: 77,
        humidity1: 55,
        temp2f: 72,
        humidity2: 60,
        soilmoisture1: 40,
      },
      baseMapping,
      { now: CLOUD_NOW },
    );
    const byTent: Record<string, string[]> = {};
    for (const r of res.rows) {
      byTent[r.tent_id] ??= [];
      byTent[r.tent_id].push(`${r.reading.source}:${r.channel}`);
    }
    expect(res.rows.every((r) => r.reading.source === "live")).toBe(true);
    expect(res.rows.find((r) => r.tent_id === TENT_A)).toBeDefined();
    expect(res.rows.find((r) => r.tent_id === TENT_B)).toBeDefined();
    expect(res.unmapped).toEqual([]);
    // plant_id is always null for environment readings.
    expect(res.rows.every((r) => r.plant_id === null)).toBe(true);
    // No EC metric invented.
    expect(res.rows.find((r) => "soil_ec" in (r.reading as object))).toBeUndefined();
  });

  it("flags unmapped channels — never drops and never assigns a default tent", () => {
    const res = normalizeEcowittCloudReadings(
      {
        MAC: MAC_A,
        dateutc: CLOUD_FRESH,
        temp7f: 70, // channel 7 has no mapping
        humidity7: 50,
      },
      baseMapping,
      { now: CLOUD_NOW },
    );
    expect(res.rows).toEqual([]);
    expect(res.unmapped.length).toBeGreaterThanOrEqual(2);
    expect(res.unmapped.every((u) => u.reason === "no_tent_mapping_for_channel")).toBe(true);
    assertUiCopySafe(res.unmapped.map((u) => u.note));
  });

  it("marks stale captured_at as source=stale", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC: MAC_A, dateutc: CLOUD_STALE, temp1f: 77, humidity1: 55 },
      baseMapping,
      { now: CLOUD_NOW },
    );
    expect(res.rows.length).toBe(2);
    expect(res.rows.every((r) => r.reading.source === "stale")).toBe(true);
  });

  it("marks humidity stuck at 0 or 100 as invalid", () => {
    for (const stuck of [0, 100]) {
      const res = normalizeEcowittCloudReadings(
        { MAC: MAC_A, dateutc: CLOUD_FRESH, humidity1: stuck },
        baseMapping,
        {
          now: CLOUD_NOW,
          recentHumidityPctByChannel: { 1: [stuck, stuck, stuck, stuck] },
        },
      );
      const rh = res.rows.find((r) => r.reading.humidity_pct === stuck);
      expect(rh, `stuck=${stuck}`).toBeDefined();
      expect(rh!.reading.source).toBe("invalid");
      expect(rh!.confidence).toBe(0);
    }
  });

  it("marks soil moisture stuck at 0 or 100 as invalid", () => {
    for (const stuck of [0, 100]) {
      const res = normalizeEcowittCloudReadings(
        { MAC: MAC_A, dateutc: CLOUD_FRESH, soilmoisture1: stuck },
        baseMapping,
        {
          now: CLOUD_NOW,
          recentSoilMoisturePctByChannel: { 1: [stuck, stuck, stuck, stuck] },
        },
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].reading.source).toBe("invalid");
    }
  });

  it("flags suspicious Celsius/Fahrenheit mismatch", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC: MAC_A, dateutc: CLOUD_FRESH, temp1f: 25 /* looks like °C */, humidity1: 55 },
      baseMapping,
      { now: CLOUD_NOW },
    );
    const tempRow = res.rows.find((r) => r.reading.temperature_c !== null);
    expect(tempRow!.suspicion_codes).toContain("celsius_looking_fahrenheit");
    expect(tempRow!.confidence).toBeLessThan(0.5);
  });

  it("flags missing metric (no temp/RH/soil channels) — never returns healthy", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC: MAC_A, dateutc: CLOUD_FRESH },
      baseMapping,
      { now: CLOUD_NOW },
    );
    expect(res.rows).toEqual([]);
  });

  it("never invents an EC metric for EcoWitt", () => {
    const res = normalizeEcowittCloudReadings(
      { MAC: MAC_A, dateutc: CLOUD_FRESH, temp1f: 77, humidity1: 55, soilmoisture1: 40 },
      baseMapping,
      { now: CLOUD_NOW },
    );
    for (const row of res.rows) {
      const r = row.reading as Record<string, unknown>;
      expect(r).not.toHaveProperty("soil_ec");
      expect(r).not.toHaveProperty("reservoir_ec");
      expect(r).not.toHaveProperty("ec_mscm");

    }
  });

  it("flags pressure as unsupported instead of inventing a metric", () => {
    const res = normalizeEcowittCloudReadings(
      {
        MAC: MAC_A,
        dateutc: CLOUD_FRESH,
        temp1f: 77,
        humidity1: 55,
        baromrelin: 29.92,
      },
      baseMapping,
      { now: CLOUD_NOW },
    );
    const pressure = res.unmapped.find((u) => u.metric === "pressure_hpa");
    expect(pressure).toBeDefined();
    expect(pressure!.reason).toBe("unsupported_metric_for_ecowitt");
    assertUiCopySafe([pressure!.note]);
  });
});
