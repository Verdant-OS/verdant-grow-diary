/**
 * greenhouseClimateRules — VPD null-safety, classification, and
 * REVIEW-only sunset condensation detection.
 */
import { describe, it, expect } from "vitest";
import {
  calculateVpdKpa,
  assessVpd,
  detectSunsetCondensationRisk,
  type ClimateSample,
} from "@/lib/greenhouseClimateRules";

const FORBIDDEN_KEYS = /^(command|device_id|action_queue|control|relay|execute)$/i;
function assertNoForbiddenKeys(obj: unknown, path = "$"): void {
  if (obj === null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    expect(FORBIDDEN_KEYS.test(k), `${path}.${k} is forbidden`).toBe(false);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

describe("calculateVpdKpa", () => {
  it("computes ~1.27 kPa for 25°C / 60% RH", () => {
    expect(calculateVpdKpa({ tempC: 25, rhPercent: 60 })).toBeCloseTo(1.27, 1);
  });
  it("returns null for null/NaN/Infinity/out-of-range inputs", () => {
    expect(calculateVpdKpa({ tempC: null, rhPercent: 50 })).toBeNull();
    expect(calculateVpdKpa({ tempC: 25, rhPercent: null })).toBeNull();
    expect(calculateVpdKpa({ tempC: Number.NaN, rhPercent: 50 })).toBeNull();
    expect(calculateVpdKpa({ tempC: 25, rhPercent: Number.POSITIVE_INFINITY })).toBeNull();
    expect(calculateVpdKpa({ tempC: 25, rhPercent: 120 })).toBeNull();
    expect(calculateVpdKpa({ tempC: 25, rhPercent: -1 })).toBeNull();
    expect(calculateVpdKpa({ tempC: -999, rhPercent: 50 })).toBeNull();
  });
});

describe("assessVpd", () => {
  it("returns unknown for stale/invalid/noncanonical sources", () => {
    for (const source of ["stale", "invalid", "ecowitt", null, undefined]) {
      const r = assessVpd({ vpdKpa: 1.1, source });
      expect(r.status).toBe("unknown");
      expect(r.severity).toBeNull();
    }
  });
  it("returns unknown when vpd is null/NaN", () => {
    expect(assessVpd({ vpdKpa: null, source: "live" }).status).toBe("unknown");
    expect(assessVpd({ vpdKpa: Number.NaN, source: "live" }).status).toBe("unknown");
  });
  it("classifies in_band / low / high with risk/review severity (never certainty)", () => {
    const band = { minKpa: 1.0, maxKpa: 1.3 };
    expect(assessVpd({ vpdKpa: 1.1, source: "live", band }).status).toBe("in_band");
    const low = assessVpd({ vpdKpa: 0.9, source: "live", band });
    expect(low.status).toBe("low");
    expect(low.severity).toBe("review");
    const high = assessVpd({ vpdKpa: 1.8, source: "live", band });
    expect(high.status).toBe("high");
    expect(high.severity).toBe("risk");
  });
  it("never promotes manual/csv/demo to live in the resolved source field", () => {
    for (const s of ["manual", "csv", "demo"] as const) {
      expect(assessVpd({ vpdKpa: 1.1, source: s }).source).toBe(s);
    }
  });
  it("emits no forbidden device-command keys", () => {
    assertNoForbiddenKeys(assessVpd({ vpdKpa: 1.1, source: "live" }));
  });
});

describe("detectSunsetCondensationRisk", () => {
  it("invalid when no healthy samples", () => {
    const r = detectSunsetCondensationRisk([
      { ts: "2026-06-11T18:00:00Z", tempC: 25, rhPercent: 90, source: "stale" },
      { ts: "2026-06-11T20:00:00Z", tempC: 20, rhPercent: 95, source: "invalid" },
    ] as ClimateSample[]);
    expect(r.status).toBe("invalid");
  });
  it("insufficient_samples when only one healthy sample", () => {
    const r = detectSunsetCondensationRisk([
      { ts: "2026-06-11T18:00:00Z", tempC: 25, rhPercent: 90, source: "live" },
    ]);
    expect(r.status).toBe("insufficient_samples");
  });
  it("review on falling temp + high RH (never certainty)", () => {
    const r = detectSunsetCondensationRisk([
      { ts: "2026-06-11T18:00:00Z", tempC: 26, rhPercent: 70, source: "live" },
      { ts: "2026-06-11T20:00:00Z", tempC: 22, rhPercent: 88, source: "live" },
    ]);
    expect(r.status).toBe("review");
    expect(r.reason).toMatch(/review/);
    expect(r.tempDropC).toBeCloseTo(4, 1);
  });
  it("ok when temp is stable or RH is moderate", () => {
    const r = detectSunsetCondensationRisk([
      { ts: "2026-06-11T18:00:00Z", tempC: 25, rhPercent: 60, source: "live" },
      { ts: "2026-06-11T20:00:00Z", tempC: 24.5, rhPercent: 62, source: "live" },
    ]);
    expect(r.status).toBe("ok");
  });
  it("ignores stale/invalid/noncanonical samples", () => {
    const r = detectSunsetCondensationRisk([
      { ts: "2026-06-11T18:00:00Z", tempC: 26, rhPercent: 70, source: "live" },
      { ts: "2026-06-11T19:00:00Z", tempC: 999, rhPercent: 999, source: "invalid" },
      { ts: "2026-06-11T20:00:00Z", tempC: 22, rhPercent: 88, source: "manual" },
    ] as ClimateSample[]);
    expect(r.status).toBe("review");
    expect(r.usedCount).toBe(2);
  });
  it("emits no forbidden device-command keys", () => {
    assertNoForbiddenKeys(
      detectSunsetCondensationRisk([
        { ts: "2026-06-11T18:00:00Z", tempC: 26, rhPercent: 70, source: "live" },
        { ts: "2026-06-11T20:00:00Z", tempC: 22, rhPercent: 88, source: "live" },
      ]),
    );
  });
});
