/**
 * Pure adapter tests for the Quick Log pre-save sensor snapshot strip.
 * Classification is delegated to sensorSnapshotStatusContract; this
 * test pins the four supported states + exact presenter copy + safe action
 * shape (navigation only) + exact labels and navigation actions.
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
  it("no_data — exact copy, labels, and navigation when there is no tent", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: false, now: NOW });
    expect(v.status).toBe("no_data");
    expect(v.title).toBe("No sensor snapshot attached");
    expect(v.description).toBe("Add a snapshot so this log has room context.");
    expect(v.action).toEqual({ kind: "add", label: "Add snapshot", href: "/sensors" });
    expect(v.metrics).toHaveLength(0);
    expect(v.ageLabel).toBeNull();
    expect(v.capturedAt).toBeNull();
    expect(v.classification.status).toBe("no_data");
    expect(v.classification.reason).toBe("none_inserted");
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("no_data — exact copy when loader is still loading", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: null, loading: true, now: NOW });
    expect(v.status).toBe("no_data");
    expect(v.title).toBe("No sensor snapshot attached");
    expect(v.description).toBe("Add a snapshot so this log has room context.");
    expect(v.action).toEqual({ kind: "add", label: "Add snapshot", href: "/sensors" });
  });

  it("no_data — exact copy when snapshot source is unavailable", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: EMPTY_SNAPSHOT, hasTent: true, now: NOW });
    expect(v.status).toBe("no_data");
    expect(v.title).toBe("No sensor snapshot attached");
    expect(v.description).toBe("Add a snapshot so this log has room context.");
    expect(v.action).toEqual({ kind: "add", label: "Add snapshot", href: "/sensors" });
  });

  it("usable — exact copy, labels, metrics, and navigation for a fresh live snapshot", () => {
    const v = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(v.status).toBe("usable");
    expect(v.title).toBe("Sensor context ready");
    expect(v.description).toBe("This log will include current sensor context.");
    expect(v.action).toEqual({ kind: "none" });
    expect(v.ageLabel).toBe("5 min ago");
    expect(v.capturedAt).toBe(minutesAgo(5));
    expect(v.metrics).toEqual([
      { label: "Temp", value: "24.3°C" },
      { label: "RH", value: "55%" },
      { label: "VPD", value: "1.12 kPa" },
    ]);
    expect(v.classification.status).toBe("usable");
    expect(v.classification.reason).toBe("fresh_accepted");
    expect(v.classification.isHealthyEvidence).toBe(true);
  });

  it("usable — exact copy when some metrics are null", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ temp: null, vpd: null }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("usable");
    expect(v.metrics).toEqual([{ label: "RH", value: "55%" }]);
  });

  it("stale — exact copy, labels, metrics, age, and navigation when older than 24h", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: hoursAgo(48) }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("stale");
    expect(v.title).toBe("Sensor snapshot stale");
    expect(v.description).toBe("Refresh before saving for better AI Doctor context.");
    expect(v.action).toEqual({ kind: "refresh", label: "Refresh snapshot", href: "/sensors" });
    expect(v.ageLabel).toBe("2 days ago");
    expect(v.capturedAt).toBe(hoursAgo(48));
    expect(v.metrics).toEqual([
      { label: "Temp", value: "24.3°C" },
      { label: "RH", value: "55%" },
      { label: "VPD", value: "1.12 kPa" },
    ]);
    expect(v.classification.status).toBe("stale");
    expect(v.classification.reason).toBe("outside_stale_window");
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("stale — exact age formatting at hour and day boundaries", () => {
    const v1 = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: hoursAgo(3) }),
      hasTent: true,
      now: NOW,
    });
    expect(v1.ageLabel).toBe("3 hr ago");

    const v2 = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: hoursAgo(25) }),
      hasTent: true,
      now: NOW,
    });
    expect(v2.ageLabel).toBe("1 day ago");
  });

  it("invalid — exact copy, labels, and navigation when source is sim (demo / untrusted)", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "sim" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("invalid");
    expect(v.title).toBe("Sensor snapshot not trusted");
    expect(v.description).toBe("This reading will not be treated as reliable context.");
    expect(v.action).toEqual({ kind: "review", label: "Review sensor intake", href: "/sensors" });
    expect(v.ageLabel).toBe("5 min ago");
    expect(v.capturedAt).toBe(minutesAgo(5));
    expect(v.classification.status).toBe("invalid");
    expect(v.classification.reason).toBe("malformed_reading");
    expect(v.classification.isHealthyEvidence).toBe(false);
  });

  it("invalid — exact copy when all metrics are null", () => {
    const v = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "sim", temp: null, rh: null, vpd: null }),
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("invalid");
    expect(v.metrics).toHaveLength(0);
    expect(v.description).toBe("This reading will not be treated as reliable context.");
  });

  it("action hrefs are navigation-only — never automation endpoints", () => {
    const scenarios = [
      { ts: minutesAgo(5), expectedHref: undefined }, // usable → kind:none
      { ts: hoursAgo(48), expectedHref: "/sensors" }, // stale → refresh
    ];
    for (const { ts, expectedHref } of scenarios) {
      const v = buildQuickLogSnapshotStrip({
        snapshot: snap({ ts }),
        hasTent: true,
        now: NOW,
      });
      if (expectedHref) {
        expect(v.action.kind).not.toBe("none");
        expect((v.action as { href: string }).href).toBe(expectedHref);
      } else {
        expect(v.action.kind).toBe("none");
      }
    }
  });

  it("all non-none actions point to /sensors", () => {
    const allStatuses: Array<{
      snapshot: SensorSnapshot | null;
      hasTent: boolean;
      loading?: boolean;
    }> = [
      { snapshot: snap({ ts: hoursAgo(48) }), hasTent: true }, // stale
      { snapshot: snap({ source: "sim" }), hasTent: true }, // invalid
      { snapshot: null, hasTent: true, loading: true }, // no_data
    ];
    for (const args of allStatuses) {
      const v = buildQuickLogSnapshotStrip({ ...args, now: NOW });
      if (v.action.kind !== "none") {
        expect(v.action.href).toBe("/sensors");
      }
    }
  });

  it("classification is delegated to the contract for every state", () => {
    const usable = buildQuickLogSnapshotStrip({ snapshot: snap({}), hasTent: true, now: NOW });
    expect(usable.classification.status).toBe("usable");
    expect(usable.classification.isHealthyEvidence).toBe(true);

    const stale = buildQuickLogSnapshotStrip({
      snapshot: snap({ ts: hoursAgo(48) }),
      hasTent: true,
      now: NOW,
    });
    expect(stale.classification.status).toBe("stale");
    expect(stale.classification.isHealthyEvidence).toBe(false);

    const invalid = buildQuickLogSnapshotStrip({
      snapshot: snap({ source: "sim" }),
      hasTent: true,
      now: NOW,
    });
    expect(invalid.classification.status).toBe("invalid");
    expect(invalid.classification.isHealthyEvidence).toBe(false);

    const noData = buildQuickLogSnapshotStrip({ snapshot: null, hasTent: true, now: NOW });
    expect(noData.classification.status).toBe("no_data");
    expect(noData.classification.isHealthyEvidence).toBe(false);
  });
});
