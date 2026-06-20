import { describe, it, expect } from "vitest";
import {
  resolveSensorSnapshotDisplay,
  formatAgeLabel,
  isHealthySensorDisplay,
  DEFAULT_ENVIRONMENT_STALE_WINDOW_MS,
  DEFAULT_SOIL_STALE_WINDOW_MS,
} from "@/lib/sensorSnapshotFreshnessRules";

const NOW = new Date("2026-06-19T12:00:00.000Z").getTime();
const opts = { now: NOW };

function isoMinusMs(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("sensorSnapshotFreshnessRules.resolveSensorSnapshotDisplay", () => {
  it("keeps fresh live readings as live/fresh/ok", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(60_000),
        metrics: [{ key: "temp", value: 24.31, unit: "°C" }],
      },
      opts,
    );
    expect(r.effectiveSource).toBe("live");
    expect(r.freshness).toBe("fresh");
    expect(r.tone).toBe("ok");
    expect(r.warning).toBeNull();
    expect(isHealthySensorDisplay(r)).toBe(true);
    expect(r.metrics[0].display).toBe("24.3");
  });

  it("keeps fresh manual readings as manual, info tone, not green", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "manual", capturedAt: isoMinusMs(60_000) },
      opts,
    );
    expect(r.effectiveSource).toBe("manual");
    expect(r.tone).toBe("info");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("keeps fresh csv readings labeled as csv", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "csv", capturedAt: isoMinusMs(60_000) },
      opts,
    );
    expect(r.effectiveSource).toBe("csv");
    expect(r.freshness).toBe("fresh");
  });

  it("demo stays demo regardless of age", () => {
    const old = resolveSensorSnapshotDisplay(
      { source: "demo", capturedAt: isoMinusMs(30 * 86_400_000) },
      opts,
    );
    expect(old.effectiveSource).toBe("demo");
    expect(old.freshness).toBe("demo");
    expect(isHealthySensorDisplay(old)).toBe(false);
    expect(old.warning).toMatch(/demo/i);
  });

  it("flips environment readings older than 15min to stale", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS + 60_000),
        metrics: [{ key: "temp", value: 22 }],
      },
      opts,
    );
    expect(r.effectiveSource).toBe("stale");
    expect(r.freshness).toBe("stale");
    expect(r.tone).toBe("warning");
    expect(r.warning).toMatch(/stale/i);
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("uses soil stale window for soil-only snapshots", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_ENVIRONMENT_STALE_WINDOW_MS + 60_000),
        metrics: [{ key: "soil", value: 33 }],
      },
      opts,
    );
    expect(r.effectiveSource).toBe("live");
    expect(r.freshness).toBe("fresh");

    const stale = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(DEFAULT_SOIL_STALE_WINDOW_MS + 60_000),
        metrics: [{ key: "soil", value: 33 }],
      },
      opts,
    );
    expect(stale.effectiveSource).toBe("stale");
  });

  it("missing captured_at is invalid, never healthy", () => {
    const r = resolveSensorSnapshotDisplay({ source: "live" }, opts);
    expect(r.effectiveSource).toBe("invalid");
    expect(r.freshness).toBe("invalid");
    expect(r.reasonCodes).toContain("missing_captured_at");
    expect(isHealthySensorDisplay(r)).toBe(false);
  });

  it("future captured_at is invalid, never healthy", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: new Date(NOW + 60_000).toISOString(),
      },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.reasonCodes).toContain("future_captured_at");
  });

  it("unknown source becomes invalid", () => {
    const r = resolveSensorSnapshotDisplay(
      { source: "totally_unknown", capturedAt: isoMinusMs(0) },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.reasonCodes).toContain("unknown_source");
  });

  it("invalid flag wins", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(0),
        invalid: true,
      },
      opts,
    );
    expect(r.effectiveSource).toBe("invalid");
    expect(r.tone).toBe("danger");
  });

  it("rejects unsafe sourceDetail strings (spaces, slashes, quotes)", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(0),
        sourceDetail: "evil token /etc/passwd",
      },
      opts,
    );
    expect(r.sourceDetail).toBeNull();
  });

  it("keeps safe vendor lineage labels", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(0),
        sourceDetail: "ggs_controller",
      },
      opts,
    );
    expect(r.sourceDetail).toBe("ggs_controller");
  });

  it("never returns raw_payload or unknown extra fields", () => {
    const r = resolveSensorSnapshotDisplay(
      {
        source: "live",
        capturedAt: isoMinusMs(0),
        // @ts-expect-error — defensive: ensure resolver ignores unknown keys
        raw_payload: { secret: "shhh", api_key: "abcd" },
      },
      opts,
    );
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/raw_payload/);
    expect(serialized).not.toMatch(/api_key/);
    expect(serialized).not.toMatch(/secret/);
  });

  it("formats age labels deterministically", () => {
    expect(formatAgeLabel(0)).toBe("0s ago");
    expect(formatAgeLabel(45 * 1000)).toBe("45s ago");
    expect(formatAgeLabel(5 * 60 * 1000)).toBe("5m ago");
    expect(formatAgeLabel(3 * 3600 * 1000)).toBe("3h ago");
    expect(formatAgeLabel(2 * 86400 * 1000)).toBe("2d ago");
    expect(formatAgeLabel(-1000)).toBe("in the future");
    expect(formatAgeLabel(null)).toBeNull();
  });

  it("null/undefined input resolves to invalid, not healthy", () => {
    expect(resolveSensorSnapshotDisplay(null).effectiveSource).toBe("invalid");
    expect(resolveSensorSnapshotDisplay(undefined).effectiveSource).toBe(
      "invalid",
    );
  });

  it("clamps confidence into [0,1]", () => {
    const a = resolveSensorSnapshotDisplay(
      { source: "live", capturedAt: isoMinusMs(0), confidence: 1.5 },
      opts,
    );
    expect(a.confidence).toBe(1);
    const b = resolveSensorSnapshotDisplay(
      { source: "live", capturedAt: isoMinusMs(0), confidence: -0.4 },
      opts,
    );
    expect(b.confidence).toBe(0);
  });
});
