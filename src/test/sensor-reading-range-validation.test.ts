import { describe, expect, it } from "vitest";
import { validateSensorReadingRange } from "@/lib/sensorReadingRangeValidation";

describe("validateSensorReadingRange", () => {
  it("accepts a plausible temperature reading", () => {
    const r = validateSensorReadingRange({ metric: "temperature_c", value: 24.1 });
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("blocks NaN/non-finite values", () => {
    const r = validateSensorReadingRange({ metric: "humidity_pct", value: Number.NaN });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("value_not_finite");
  });

  it("blocks humidity above 100%", () => {
    const r = validateSensorReadingRange({ metric: "humidity_pct", value: 120 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("value_out_of_range");
  });

  it("blocks VPD outside realistic grow range", () => {
    const r = validateSensorReadingRange({ metric: "vpd_kpa", value: 9 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("value_out_of_range");
  });

  it("blocks reservoir pH outside 0-14", () => {
    const r = validateSensorReadingRange({ metric: "reservoir_ph", value: -1 });
    expect(r.ok).toBe(false);
  });

  it("blocks unknown metric", () => {
    const r = validateSensorReadingRange({ metric: "cosmic_rays", value: 1 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.code).toBe("unknown_metric");
  });

  it("blocks invalid timestamp", () => {
    const r = validateSensorReadingRange({
      metric: "temperature_c",
      value: 24,
      ts: "not-a-date",
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "captured_at_invalid")).toBe(true);
  });

  it("blocks future timestamps beyond the skew window", () => {
    const now = Date.UTC(2026, 6, 29, 12, 0, 0);
    const r = validateSensorReadingRange(
      { metric: "temperature_c", value: 24, ts: new Date(now + 3600_000) },
      { nowMs: now, futureSkewSeconds: 300 },
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "captured_at_in_future")).toBe(true);
  });

  it("accepts recent past and near-now timestamps", () => {
    const now = Date.UTC(2026, 6, 29, 12, 0, 0);
    const r = validateSensorReadingRange(
      { metric: "temperature_c", value: 24, ts: new Date(now - 60_000) },
      { nowMs: now },
    );
    expect(r.ok).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const a = validateSensorReadingRange({ metric: "co2_ppm", value: 800 });
    const b = validateSensorReadingRange({ metric: "co2_ppm", value: 800 });
    expect(a).toEqual(b);
  });
});
