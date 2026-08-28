/**
 * Quick Log strip — non-live pill / badge / advisory coherence.
 *
 * Pins buildQuickLogStripFromTentState so fresh_non_live and stale rows
 * agree across status pill, trust badge, and classification. Canonical
 * normalizeSensorSource is called (not edited); no alias table here.
 */
import { describe, it, expect } from "vitest";
import {
  DEMO_USABLE_DESCRIPTION,
  DEMO_USABLE_TITLE,
  buildQuickLogStripFromTentState,
} from "@/lib/quickLogSnapshotStripAdapter";
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
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live" as SensorSnapshotStatus,
    badge_label: "Live",
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

function fromReady(partial: Partial<StrictSensorSnapshot>) {
  return buildQuickLogStripFromTentState({
    status: "ready",
    snapshot: snap(partial),
    hasTent: true,
    now: NOW,
    temperatureUnit: "celsius",
  });
}

describe("buildQuickLogStripFromTentState — non-live coherence", () => {
  it("exports DEMO_USABLE copy constants", () => {
    expect(DEMO_USABLE_TITLE).toBe("Demo sensor context");
    expect(DEMO_USABLE_DESCRIPTION).toBe(
      "Sample data will be labeled demo — never treated as live sensor context.",
    );
  });

  it("stale + unknown transport (ecowitt / ecowitt_mqtt / mqtt / …) → Invalid trio", () => {
    for (const source of ["ecowitt", "ecowitt_mqtt", "mqtt", "webhook", "wat"]) {
      const v = fromReady({ source, status: "stale", freshness: "stale" });
      expect(v.status, `source=${source}`).toBe("invalid");
      expect(v.trustBadge.badge, `source=${source}`).toBe("invalid");
      expect(v.trustBadge.attachable, `source=${source}`).toBe(false);
      expect(v.classification.isHealthyEvidence, `source=${source}`).toBe(false);
      expect(v.classification.status, `source=${source}`).toBe("invalid");
    }
  });

  it("stale + trusted (live / manual / csv / stale / pi_bridge) → Stale trio", () => {
    for (const source of ["live", "manual", "csv", "stale", "pi_bridge"]) {
      const v = fromReady({ source, status: "stale", freshness: "stale" });
      expect(v.status, `source=${source}`).toBe("stale");
      expect(v.trustBadge.badge, `source=${source}`).toBe("stale");
      expect(v.trustBadge.attachable, `source=${source}`).toBe(false);
      expect(v.trustBadge.helper, `source=${source}`).toMatch(/too old/i);
    }
  });

  it("fresh_non_live + canonical stale source → Stale trio", () => {
    const v = fromReady({ source: "stale", status: "fresh_non_live" });
    expect(v.status).toBe("stale");
    expect(v.trustBadge.badge).toBe("stale");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("demo / sim / mock / sample / fixture → usable + Demo badge + honest copy + not healthy + not attachable", () => {
    for (const source of ["demo", "sim", "mock", "sample", "fixture"]) {
      const v = fromReady({ source, status: "fresh_non_live" });
      expect(v.status, `source=${source}`).toBe("usable");
      expect(v.trustBadge.badge, `source=${source}`).toBe("demo");
      expect(v.trustBadge.attachable, `source=${source}`).toBe(false);
      expect(v.classification.isHealthyEvidence, `source=${source}`).toBe(false);
      expect(v.title, `source=${source}`).toBe(DEMO_USABLE_TITLE);
      expect(v.description, `source=${source}`).toBe(DEMO_USABLE_DESCRIPTION);
    }
  });

  it("detached toggle still wins over demo usable copy", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "demo", status: "fresh_non_live" }),
      hasTent: true,
      attached: false,
      now: NOW,
      temperatureUnit: "celsius",
    });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor snapshot available");
    expect(v.description).toMatch(/Attach sensor snapshot/i);
    expect(v.classification.isHealthyEvidence).toBe(false);
    expect(v.trustBadge.badge).toBe("demo");
  });

  it("pi_bridge / sensor / realtime fresh_non_live → usable + Live badge, no too-old helper", () => {
    for (const source of ["pi_bridge", "sensor", "realtime"]) {
      const v = fromReady({ source, status: "fresh_non_live" });
      expect(v.status, `source=${source}`).toBe("usable");
      expect(v.trustBadge.badge, `source=${source}`).toBe("live");
      expect(v.trustBadge.attachable, `source=${source}`).toBe(true);
      expect(v.trustBadge.helper, `source=${source}`).not.toMatch(/too old/i);
      expect(v.title, `source=${source}`).toBe("Sensor context ready");
    }
  });

  it("transport labels fresh_non_live stay Invalid", () => {
    for (const source of ["ecowitt", "ecowitt_mqtt", "mqtt", "webhook"]) {
      const v = fromReady({ source, status: "fresh_non_live" });
      expect(v.status, `source=${source}`).toBe("invalid");
      expect(v.trustBadge.badge, `source=${source}`).toBe("invalid");
      expect(v.trustBadge.attachable, `source=${source}`).toBe(false);
    }
  });

  it("manual / csv aliases get Manual / CSV badges", () => {
    expect(fromReady({ source: "user", status: "fresh_non_live" }).trustBadge.badge).toBe("manual");
    expect(fromReady({ source: "diary", status: "fresh_non_live" }).trustBadge.badge).toBe(
      "manual",
    );
    expect(fromReady({ source: "import", status: "fresh_non_live" }).trustBadge.badge).toBe("csv");
    expect(fromReady({ source: "imported", status: "fresh_non_live" }).trustBadge.badge).toBe(
      "csv",
    );
  });

  it("fresh_live is untouched: current sensor context + attachable + healthy", () => {
    const v = fromReady({ source: "ecowitt", status: "fresh_live" });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toMatch(/current sensor context/i);
    expect(v.trustBadge.badge).toBe("live");
    expect(v.trustBadge.attachable).toBe(true);
    expect(v.classification.isHealthyEvidence).toBe(true);
  });

  it("blank / whitespace / missing source on non-live → Invalid", () => {
    for (const source of ["", "   ", null]) {
      const v = fromReady({
        source: source as string | null,
        status: "fresh_non_live",
      });
      expect(v.status, `source=${JSON.stringify(source)}`).toBe("invalid");
      expect(v.trustBadge.badge, `source=${JSON.stringify(source)}`).toBe("invalid");
    }
  });

  it("PI_BRIDGE whitespace/casing still Live badge; provider chip stays Pi Bridge from raw", () => {
    const raw = "  PI_BRIDGE  ";
    const v = fromReady({ source: raw, status: "fresh_non_live" });
    expect(v.status).toBe("usable");
    expect(v.trustBadge.badge).toBe("live");
    expect(v.trustBadge.attachable).toBe(true);
    // Strip provider chip reads raw snapshot.source; badge gets canonical
    // "live" (no chip) so Live is never duplicated as a provider label.
    expect(v.providerLabel).toBe("Pi Bridge");
  });
});
