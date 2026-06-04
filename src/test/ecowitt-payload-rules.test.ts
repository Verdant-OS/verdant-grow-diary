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
