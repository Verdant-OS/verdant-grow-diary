/**
 * Quick Log sensor snapshot state semantics.
 *
 * Enforces that ABSENCE of a snapshot ("no snapshot attached") is
 * rendered distinctly from INVALID telemetry, and that the six
 * observable states — none / invalid / stale / manual / demo / live —
 * each surface with the correct label and attachability posture.
 *
 * Pure adapter/rule tests only. No I/O, no React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  classifySnapshotTrustBadge,
} from "@/lib/sensorSnapshotTrustBadgeRules";
import { buildQuickLogStripFromTentState } from "@/lib/quickLogSnapshotStripAdapter";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-06-02T12:00:00Z");
const FRESH = "2026-06-02T11:55:00Z";

function snap(partial: Partial<StrictSensorSnapshot> = {}): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: FRESH,
    age_minutes: 5,
    source: "ecowitt",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live" as SensorSnapshotStatus,
    badge_label: "Live • ecowitt",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
    ...partial,
  };
}

describe("Quick Log sensor snapshot — state semantics", () => {
  it("no snapshot attached renders 'No snapshot' — never Invalid", () => {
    const v = buildQuickLogStripFromTentState({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("no_data");
    expect(v.title).toMatch(/no sensor snapshot attached/i);
    expect(v.trustBadge.badge).toBe("none");
    expect(v.trustBadge.label).toBe("No snapshot");
    expect(v.trustBadge.attachable).toBe(false);
    // Absence must never be classified as healthy telemetry.
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("no tent selected renders 'No snapshot' — never Invalid", () => {
    const v = buildQuickLogStripFromTentState({
      status: "idle",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      hasTent: false,
      now: NOW,
    });
    expect(v.status).toBe("no_data");
    expect(v.trustBadge.badge).toBe("none");
    expect(v.trustBadge.label).not.toBe("Invalid");
  });

  it("invalid resolver verdict renders INVALID", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ status: "invalid", freshness: "invalid" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("invalid");
    expect(v.trustBadge.badge).toBe("invalid");
    expect(v.trustBadge.attachable).toBe(false);
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("stale resolver verdict renders STALE (not Invalid, not None)", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ status: "stale", freshness: "stale" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("stale");
    expect(v.trustBadge.badge).toBe("stale");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("manual snapshot renders MANUAL", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "manual", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).toBe("manual");
    expect(v.trustBadge.attachable).toBe(true);
  });

  it("demo/sim snapshot renders DEMO and is not attachable", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "sim", status: "fresh_non_live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).toBe("demo");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("live fresh valid Ecowitt snapshot renders LIVE and attachable", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "ecowitt", status: "fresh_live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).toBe("live");
    expect(v.trustBadge.attachable).toBe(true);
    expect(v.classification.isHealthyEvidence).toBe(true);
  });

  it("missing snapshot is never classified as healthy", () => {
    const v = classifySnapshotTrustBadge({ empty: true });
    expect(v.badge).toBe("none");
    expect(v.attachable).toBe(false);
    // Absence must not carry an OK/healthy severity.
    expect(v.severity).not.toBe("ok");
  });

  it("missing optional metric (CO2/PPFD) does not mark the snapshot invalid", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({
        source: "ecowitt",
        status: "fresh_live",
        metrics: {
          temp_f: 75,
          humidity_pct: 55,
          vpd_kpa: 1.1,
          soil_moisture_pct: null,
          co2_ppm: null, // optional metric absent
        },
      }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("usable");
    expect(v.trustBadge.badge).toBe("live");
  });

  it("resolver-invalid snapshot is never rendered as healthy even if metrics exist", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({
        status: "invalid",
        freshness: "invalid",
        metrics: { temp_f: 9999, humidity_pct: 5, vpd_kpa: 20, soil_moisture_pct: null, co2_ppm: null },
      }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).toBe("invalid");
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("distinct labels across all six sensor states", () => {
    const labels = new Set([
      classifySnapshotTrustBadge({ empty: true }).label,
      classifySnapshotTrustBadge({ resolverStatus: "invalid" }).label,
      classifySnapshotTrustBadge({ resolverStatus: "stale" }).label,
      classifySnapshotTrustBadge({ resolverStatus: "fresh_non_live", source: "manual" }).label,
      classifySnapshotTrustBadge({ resolverStatus: "fresh_non_live", source: "sim" }).label,
      classifySnapshotTrustBadge({ resolverStatus: "fresh_live", source: "ecowitt" }).label,
    ]);
    expect(labels.size).toBe(6);
    expect(labels).toContain("No snapshot");
    expect(labels).toContain("Invalid");
    expect(labels).toContain("Stale");
    expect(labels).toContain("Manual");
    expect(labels).toContain("Demo");
    expect(labels).toContain("Live");
  });
});
