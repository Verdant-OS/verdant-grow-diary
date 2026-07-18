import { describe, it, expect } from "vitest";
import {
  classifySnapshotFreshness,
  type SensorSnapshot,
} from "@/lib/sensor/sensorSnapshotFreshnessRules";

const NOW = Date.parse("2026-06-26T12:00:00Z");

function snap(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    quality: "ok",
    captured_at: "2026-06-26T11:55:00Z",
    tent_id: "tent-1",
    metrics: {},
    ...overrides,
  };
}

describe("classifySnapshotFreshness", () => {
  it("classifies live within window as fresh, not degraded", () => {
    const r = classifySnapshotFreshness(snap(), { now: NOW });
    expect(r.freshness).toBe("fresh");
    expect(r.source).toBe("live");
    expect(r.isDegraded).toBe(false);
  });

  it("classifies live older than threshold as stale and degraded", () => {
    const r = classifySnapshotFreshness(snap({ captured_at: "2026-06-26T10:00:00Z" }), {
      now: NOW,
    });
    expect(r.freshness).toBe("stale");
    expect(r.isDegraded).toBe(true);
  });

  it("keeps source-only live telemetry degraded", () => {
    const r = classifySnapshotFreshness(snap({ quality: null }), { now: NOW });
    expect(r.freshness).toBe("fresh");
    expect(r.isCurrentLive).toBe(false);
    expect(r.isDegraded).toBe(true);
  });

  it("demo source is never promoted to live and stays degraded", () => {
    const r = classifySnapshotFreshness(snap({ source: "demo" }), { now: NOW });
    expect(r.source).toBe("demo");
    expect(r.isDegraded).toBe(true);
  });

  it("invalid source stays invalid and degraded", () => {
    const r = classifySnapshotFreshness(snap({ source: "garbage" as never }), { now: NOW });
    expect(r.source).toBe("invalid");
    expect(r.freshness).toBe("invalid");
    expect(r.isDegraded).toBe(true);
  });

  it("missing or malformed captured_at is invalid", () => {
    expect(classifySnapshotFreshness(snap({ captured_at: null }), { now: NOW }).freshness).toBe(
      "invalid",
    );
    expect(
      classifySnapshotFreshness(snap({ captured_at: "not-a-date" }), { now: NOW }).freshness,
    ).toBe("invalid");
  });

  it("far-future captured_at is invalid", () => {
    const r = classifySnapshotFreshness(snap({ captured_at: "2030-01-01T00:00:00Z" }), {
      now: NOW,
    });
    expect(r.freshness).toBe("invalid");
    expect(r.isDegraded).toBe(true);
  });

  it("stale source is never classified as healthy", () => {
    const r = classifySnapshotFreshness(snap({ source: "stale" }), { now: NOW });
    expect(r.isDegraded).toBe(true);
    expect(r.freshness).toBe("stale");
  });
});
