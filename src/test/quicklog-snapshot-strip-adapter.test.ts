/**
 * Pure adapter tests for the Quick Log pre-save sensor snapshot strip.
 * Classification is delegated to sensorSnapshotStatusContract; this
 * test pins the four supported states + presenter copy + safe action
 * shape (navigation only).
 */
import { describe, it, expect } from "vitest";
import { buildQuickLogSnapshotStrip } from "@/lib/quickLogSnapshotStripAdapter";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-06-02T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

function snap(partial: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: minutesAgo(5),
    temp: 24.3,
    rh: 55,
    vpd: 1.12,
    ...partial,
  };
}

describe("buildQuickLogSnapshotStrip", () => {
  it("no_data when there is no tent", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: false, now: NOW });
    expect(v.status).toBe("no_data");
    expect(v.title).toBe("No sensor snapshot attached");
    expect(v.description).toContain("Add a snapshot");
    expect(v.action).toEqual({ kind: "add", label: "Add snapshot", href: "/sensors" });
    expect(v.metrics).toHaveLength(0);
  });

  it("no_data when loader is still loading", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: null, loading: true, now: NOW });
    expect(v.status).toBe("no_data");
  });

  it("no_data when snapshot source is unavailable", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: EMPTY_SNAPSHOT, hasTent: true, now: NOW });
    expect(v.status).toBe("no_data");
  });

  it("usable when fresh live snapshot", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toContain("current sensor context");
    expect(v.action).toEqual({ kind: "none" });
    expect(v.ageLabel).toBe("5 min ago");
    expect(v.metrics.map((m) => m.label)).toEqual(["Temp", "RH", "VPD"]);
    expect(v.metrics.find((m) => m.label === "Temp")?.value).toBe("24.3°C");
  });

  it("stale when capturedAt is older than default 24h window", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: hoursAgo(48) }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("stale");
    expect(v.title).toBe("Sensor snapshot stale");
    expect(v.description).toContain("Refresh");
    expect(v.action).toEqual({ kind: "refresh", label: "Refresh snapshot", href: "/sensors" });
    expect(v.ageLabel).toBe("2 days ago");
  });

  it("invalid when source is sim (demo / untrusted)", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "sim" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("invalid");
    expect(v.title).toBe("Sensor snapshot not trusted");
    expect(v.description).toContain("not be treated as reliable");
    expect(v.action).toEqual({ kind: "review", label: "Review sensor intake", href: "/sensors" });
  });

  it("action hrefs are navigation-only — never automation endpoints", () => {
    for (const ts of [minutesAgo(5), hoursAgo(48)]) {
      const v = buildQuickLogSnapshotStrip({
        snapshot: snap({ ts }),
        hasTent: true,
        now: NOW,
      });
      if (v.action.kind !== "none") {
        expect(v.action.href).toBe("/sensors");
      }
    }
  });

  it("classification is delegated to the contract (status field present)", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.classification.status).toBe("usable");
    expect(v.classification.reason).toBe("fresh_accepted");
    expect(v.classification.isHealthyEvidence).toBe(true);
  });
});
