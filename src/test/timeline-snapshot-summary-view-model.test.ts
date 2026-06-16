/**
 * Pure-helper tests for timelineSnapshotSummaryViewModel.
 *
 * Asserts:
 *  - source labels for live/manual/csv/demo/stale/invalid (+ unknown)
 *  - demo/manual/csv never re-labeled as live
 *  - stale/invalid never trustworthy
 *  - severity tone matches source + quality
 *  - all 10 metric keys forwarded only when present and finite
 *  - missing/invalid inputs degrade safely
 *  - suspicious values surface from existing quality rules
 *  - sanitization: raw_payload / ids / vendor metadata are never read
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelineSnapshotSummary,
  timelineSnapshotHasAnyMetric,
} from "@/lib/timelineSnapshotSummaryViewModel";

const ALL_METRICS = {
  air_temp_c: 24,
  humidity_pct: 55,
  vpd_kpa: 1.1,
  co2_ppm: 800,
  soil_moisture_pct: 45,
  soil_temp_c: 22,
  soil_ec_mscm: 1.8,
  reservoir_ph: 6.1,
  reservoir_ec_mscm: 1.5,
  ppfd: 700,
} as const;

describe("timelineSnapshotSummaryViewModel — source labels", () => {
  it("manual snapshot → Manual label", () => {
    const s = buildTimelineSnapshotSummary({
      source: "manual",
      capturedAt: "2026-03-01T10:00:00.000Z",
      metrics: { air_temp_c: 24 },
    });
    expect(s.source).toBe("manual");
    expect(s.sourceLabel).toBe("Manual");
    expect(s.sourceLabel.toLowerCase()).not.toContain("live");
  });

  it("live snapshot → Live label only when actually live", () => {
    const s = buildTimelineSnapshotSummary({
      source: "live",
      capturedAt: new Date().toISOString(),
      metrics: { air_temp_c: 24 },
    });
    expect(s.source).toBe("live");
    expect(s.sourceLabel).toBe("Live");
  });

  it("live + ecowitt vendor → vendor-promoted label (still live source)", () => {
    const s = buildTimelineSnapshotSummary({
      source: "live",
      vendor: "ecowitt",
      capturedAt: new Date().toISOString(),
      metrics: { air_temp_c: 24 },
    });
    expect(s.source).toBe("live");
    expect(s.sourceLabel).toBe("Ecowitt");
    expect(s.sourceResolved.vendorPromoted).toBe(true);
  });

  it("csv snapshot → CSV label, never live", () => {
    const s = buildTimelineSnapshotSummary({
      source: "csv",
      capturedAt: "2025-01-01T00:00:00.000Z",
      metrics: { air_temp_c: 24 },
    });
    expect(s.sourceLabel).toBe("CSV");
    expect(s.sourceLabel.toLowerCase()).not.toContain("live");
  });

  it("demo snapshot → Demo label, never live, never trustworthy", () => {
    const s = buildTimelineSnapshotSummary({
      source: "demo",
      capturedAt: new Date().toISOString(),
      metrics: { air_temp_c: 24 },
    });
    expect(s.sourceLabel).toBe("Demo");
    expect(s.trustworthy).toBe(false);
    expect(s.severity).toBe("warning");
  });

  it("stale snapshot → Stale label, not trustworthy", () => {
    const s = buildTimelineSnapshotSummary({
      source: "stale",
      capturedAt: "2024-01-01T00:00:00.000Z",
      metrics: { air_temp_c: 24 },
    });
    expect(s.sourceLabel).toBe("Stale");
    expect(s.trustworthy).toBe(false);
    expect(["warning", "invalid"]).toContain(s.severity);
  });

  it("invalid snapshot → Invalid label, severity invalid, not trustworthy", () => {
    const s = buildTimelineSnapshotSummary({
      source: "invalid",
      capturedAt: new Date().toISOString(),
      metrics: { air_temp_c: 24 },
    });
    expect(s.sourceLabel).toBe("Invalid");
    expect(s.trustworthy).toBe(false);
    expect(s.severity).toBe("invalid");
  });

  it("unknown/missing source → Unknown label, never live, not trustworthy", () => {
    const s = buildTimelineSnapshotSummary({
      source: null,
      capturedAt: null,
      metrics: { air_temp_c: 24 },
    });
    expect(s.sourceLabel).toBe("Unknown");
    expect(s.trustworthy).toBe(false);
  });
});

describe("timelineSnapshotSummaryViewModel — metrics", () => {
  it("forwards all 10 known metric keys with units in stable order", () => {
    const s = buildTimelineSnapshotSummary({
      source: "manual",
      capturedAt: new Date().toISOString(),
      metrics: ALL_METRICS,
    });
    expect(s.metrics.map((m) => m.key)).toEqual([
      "air_temp_c",
      "humidity_pct",
      "vpd_kpa",
      "soil_moisture_pct",
      "soil_temp_c",
      "soil_ec_mscm",
      "co2_ppm",
      "ppfd",
      "reservoir_ec_mscm",
      "reservoir_ph",
    ]);
    const co2 = s.metrics.find((m) => m.key === "co2_ppm")!;
    expect(co2.unit).toBe("ppm");
    const ppfd = s.metrics.find((m) => m.key === "ppfd")!;
    expect(ppfd.unit.toLowerCase()).toContain("mol");
  });

  it("never invents metrics that are missing or non-finite", () => {
    const s = buildTimelineSnapshotSummary({
      source: "manual",
      capturedAt: new Date().toISOString(),
      metrics: {
        air_temp_c: 24,
        humidity_pct: NaN,
        vpd_kpa: null,
        co2_ppm: undefined,
      },
    });
    expect(s.metrics.map((m) => m.key)).toEqual(["air_temp_c"]);
    expect(timelineSnapshotHasAnyMetric(s)).toBe(true);
  });

  it("flags suspicious values from existing quality rules", () => {
    const s = buildTimelineSnapshotSummary({
      source: "manual",
      capturedAt: new Date().toISOString(),
      metrics: {
        humidity_pct: 100, // stuck-at boundary
        reservoir_ph: 14.5, // out of realistic range
      },
    });
    const humidity = s.metrics.find((m) => m.key === "humidity_pct")!;
    const ph = s.metrics.find((m) => m.key === "reservoir_ph")!;
    expect(humidity.suspicious).toBe(true);
    expect(ph.suspicious).toBe(true);
    expect(s.severity).toBe("invalid");
    expect(s.warnings.join(" ").toLowerCase()).toMatch(/stuck/);
  });
});

describe("timelineSnapshotSummaryViewModel — sanitization", () => {
  it("ignores extra fields on the input (no raw_payload, no IDs, no vendor metadata leak)", () => {
    const tainted = {
      source: "manual" as const,
      capturedAt: new Date().toISOString(),
      metrics: { air_temp_c: 24 },
      // Extra junk that must never surface.
      raw_payload: { secret: "nope", token: "abc" },
      private_id: "user-123",
      vendor_metadata: { ip: "10.0.0.1" },
    } as unknown as Parameters<typeof buildTimelineSnapshotSummary>[0];
    const s = buildTimelineSnapshotSummary(tainted);
    const serialized = JSON.stringify(s);
    expect(serialized).not.toMatch(/raw_payload/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/private_id/i);
    expect(serialized).not.toMatch(/user-123/);
    expect(serialized).not.toMatch(/10\.0\.0\.1/);
  });

  it("null input degrades safely", () => {
    const s = buildTimelineSnapshotSummary(null);
    expect(s.metrics).toHaveLength(0);
    expect(s.trustworthy).toBe(false);
    expect(s.sourceLabel).toBe("Unknown");
  });
});
