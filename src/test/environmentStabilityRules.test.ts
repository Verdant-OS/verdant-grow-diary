import { describe, it, expect } from "vitest";
import {
  computeEnvironmentStability,
  STABILITY_STATUS_LABEL,
  type StabilityReadingInput,
} from "@/lib/environmentStabilityRules";

const NOW = new Date("2026-05-27T12:00:00Z");
const NOW_MS = NOW.getTime();
const HOUR = 60 * 60 * 1000;

function readingsEveryHour(
  vpdValues: number[],
  opts: { startHoursAgo: number; stepHours?: number } = { startHoursAgo: 0 },
): StabilityReadingInput[] {
  const step = (opts.stepHours ?? 1) * HOUR;
  return vpdValues.map((v, i) => ({
    ts: new Date(NOW_MS - opts.startHoursAgo * HOUR + i * step).toISOString(),
    vpd: v,
  }));
}

describe("environmentStabilityRules.computeEnvironmentStability", () => {
  it("returns stable when all in-target readings (veg)", () => {
    // Veg band 0.8-1.2; 24 readings of 1.0 over last 24h
    const readings = readingsEveryHour(Array(24).fill(1.0), {
      startHoursAgo: 23,
    });
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("stable");
    expect(r.last24h.outsideCount).toBe(0);
    expect(r.last24h.hoursOutside).toBe(0);
    expect(r.last24h.totalConsidered).toBeGreaterThan(0);
    expect(r.sparse).toBe(false);
  });

  it("flags above-target hours over last 24h as unstable", () => {
    // 24 hourly readings, all 1.8 (above veg max 1.2 + deadband)
    const readings = readingsEveryHour(Array(24).fill(1.8), {
      startHoursAgo: 23,
    });
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unstable");
    expect(r.last24h.outsideCount).toBe(24);
    expect(r.last24h.hoursOutside).toBeGreaterThanOrEqual(
      4, // unstable threshold
    );
  });

  it("flags below-target hours", () => {
    const readings = readingsEveryHour(Array(24).fill(0.2), {
      startHoursAgo: 23,
    });
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unstable");
    expect(r.last24h.outsideCount).toBe(24);
  });

  it("mixed readings produce a watch status when 1-4h outside", () => {
    // 24 readings: 2 outside, 22 in
    const vals = [
      ...Array(2).fill(1.8), // 2h above
      ...Array(22).fill(1.0), // in
    ];
    const readings = readingsEveryHour(vals, { startHoursAgo: 23 });
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("watch");
    expect(r.last24h.outsideCount).toBe(2);
    expect(r.last24h.hoursOutside).toBeGreaterThanOrEqual(1);
    expect(r.last24h.hoursOutside).toBeLessThan(4);
  });

  it("returns sparse warning when too few readings in 24h", () => {
    const readings = readingsEveryHour([1.0, 1.0], { startHoursAgo: 2 });
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.sparse).toBe(true);
    expect(r.message).toBe(
      "Limited data — stability estimate may be incomplete.",
    );
  });

  it("returns stage_unknown when stage is null", () => {
    const readings = readingsEveryHour(Array(10).fill(1.0), {
      startHoursAgo: 9,
    });
    const r = computeEnvironmentStability(readings, {
      stage: null,
      now: NOW,
    });
    expect(r.status).toBe("stage_unknown");
    expect(r.last24h.outsideCount).toBe(0);
    expect(r.last24h.hoursOutside).toBe(0);
  });

  it("returns context_only for harvest stage", () => {
    const readings = readingsEveryHour(Array(10).fill(1.8), {
      startHoursAgo: 9,
    });
    const r = computeEnvironmentStability(readings, {
      stage: "harvest",
      now: NOW,
    });
    expect(r.status).toBe("context_only");
    expect(r.last24h.outsideCount).toBe(0);
    expect(r.last24h.hoursOutside).toBe(0);
  });

  it("ignores readings with invalid VPD values", () => {
    const readings: StabilityReadingInput[] = [
      { ts: new Date(NOW_MS - HOUR).toISOString(), vpd: NaN },
      { ts: new Date(NOW_MS - 2 * HOUR).toISOString(), vpd: null },
      {
        ts: new Date(NOW_MS - 3 * HOUR).toISOString(),
        vpd: Infinity,
      },
    ];
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unavailable");
    expect(r.last24h.totalConsidered).toBe(0);
  });

  it("ignores readings marked stale", () => {
    const readings: StabilityReadingInput[] = readingsEveryHour(
      Array(24).fill(1.8),
      { startHoursAgo: 23 },
    ).map((r) => ({ ...r, stale: true }));
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unavailable");
  });

  it("ignores readings whose source is demo/mock", () => {
    const readings: StabilityReadingInput[] = readingsEveryHour(
      Array(24).fill(1.8),
      { startHoursAgo: 23 },
    ).map((r) => ({ ...r, source: "demo" }));
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unavailable");

    const live = readings.map((r) => ({ ...r, source: "live" }));
    const r2 = computeEnvironmentStability(live, {
      stage: "veg",
      now: NOW,
    });
    expect(r2.status).toBe("unstable");
  });

  it("is deterministic across repeated invocations", () => {
    const readings = readingsEveryHour(
      [1.0, 1.0, 1.8, 1.8, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      { startHoursAgo: 9 },
    );
    const a = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    const b = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returns unavailable when readings list is empty", () => {
    const r = computeEnvironmentStability([], {
      stage: "veg",
      now: NOW,
    });
    expect(r.status).toBe("unavailable");
    expect(STABILITY_STATUS_LABEL[r.status]).toBe("Unavailable");
  });

  it("caps the per-reading gap so a long silence does not inflate hours", () => {
    // Two outside readings 10h apart; cap is 2h, so first reading's gap = 2h
    const readings: StabilityReadingInput[] = [
      { ts: new Date(NOW_MS - 11 * HOUR).toISOString(), vpd: 1.8 },
      { ts: new Date(NOW_MS - 1 * HOUR).toISOString(), vpd: 1.8 },
    ];
    const r = computeEnvironmentStability(readings, {
      stage: "veg",
      now: NOW,
    });
    expect(r.last24h.outsideCount).toBe(2);
    // First gap capped to 2h, second gap to "now" = 1h → ~3h total
    expect(r.last24h.hoursOutside).toBeLessThanOrEqual(3);
    expect(r.last24h.hoursOutside).toBeGreaterThan(0);
  });
});
