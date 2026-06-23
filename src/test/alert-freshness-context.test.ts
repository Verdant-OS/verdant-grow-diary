import { describe, it, expect } from "vitest";
import {
  STALE_THRESHOLD_MINUTES,
  FRESHNESS_WINDOW_LABEL,
  classifyLatestSnapshotFreshness,
  hasRecentManualSnapshot,
  describeLatestSnapshotForAlerts,
  buildAlertsHeaderContext,
} from "@/lib/alertFreshnessContext";
import { STALE_THRESHOLD_MS, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-06-23T12:00:00Z");

function snap(
  overrides: Partial<SensorSnapshot> & { source: SensorSnapshot["source"]; ts: string | null },
): SensorSnapshot {
  return {
    source: overrides.source,
    ts: overrides.ts,
    temp: null,
    rh: null,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
    csvVendor: null,
    ...overrides,
  };
}

describe("alertFreshnessContext — shared constants", () => {
  it("derives the minute label from STALE_THRESHOLD_MS", () => {
    expect(STALE_THRESHOLD_MINUTES).toBe(Math.round(STALE_THRESHOLD_MS / 60_000));
    expect(FRESHNESS_WINDOW_LABEL).toBe(`${STALE_THRESHOLD_MINUTES}-minute alert window`);
  });
});

describe("classifyLatestSnapshotFreshness", () => {
  it("returns unavailable when not loaded", () => {
    expect(
      classifyLatestSnapshotFreshness({ status: "loading", snapshot: null, now: NOW }),
    ).toBe("unavailable");
  });
  it("returns missing when no usable snapshot", () => {
    expect(
      classifyLatestSnapshotFreshness({ status: "ok", snapshot: null, now: NOW }),
    ).toBe("missing");
    expect(
      classifyLatestSnapshotFreshness({
        status: "ok",
        snapshot: snap({ source: "unavailable", ts: null }),
        now: NOW,
      }),
    ).toBe("missing");
  });
  it("returns fresh for recent manual / live", () => {
    const recent = new Date(NOW - 5 * 60_000).toISOString();
    expect(
      classifyLatestSnapshotFreshness({
        status: "ok",
        snapshot: snap({ source: "manual", ts: recent }),
        now: NOW,
      }),
    ).toBe("fresh");
    expect(
      classifyLatestSnapshotFreshness({
        status: "ok",
        snapshot: snap({ source: "live", ts: recent }),
        now: NOW,
      }),
    ).toBe("fresh");
  });
  it("returns stale for old readings", () => {
    const old = new Date(NOW - 90 * 60_000).toISOString();
    expect(
      classifyLatestSnapshotFreshness({
        status: "ok",
        snapshot: snap({ source: "manual", ts: old }),
        now: NOW,
      }),
    ).toBe("stale");
  });
  it("never classifies csv/diary/sim as fresh", () => {
    const recent = new Date(NOW - 5 * 60_000).toISOString();
    for (const source of ["csv", "diary", "sim"] as const) {
      expect(
        classifyLatestSnapshotFreshness({
          status: "ok",
          snapshot: snap({ source, ts: recent }),
          now: NOW,
        }),
      ).toBe("stale");
    }
  });
});

describe("hasRecentManualSnapshot", () => {
  it("only true for fresh manual snapshots", () => {
    const recent = new Date(NOW - 5 * 60_000).toISOString();
    const old = new Date(NOW - 90 * 60_000).toISOString();
    expect(
      hasRecentManualSnapshot({
        status: "ok",
        snapshot: snap({ source: "manual", ts: recent }),
        now: NOW,
      }),
    ).toBe(true);
    expect(
      hasRecentManualSnapshot({
        status: "ok",
        snapshot: snap({ source: "manual", ts: old }),
        now: NOW,
      }),
    ).toBe(false);
    expect(
      hasRecentManualSnapshot({
        status: "ok",
        snapshot: snap({ source: "live", ts: recent }),
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("describeLatestSnapshotForAlerts", () => {
  it("renders fresh copy", () => {
    expect(
      describeLatestSnapshotForAlerts({
        status: "ok",
        snapshot: snap({ source: "manual", ts: new Date(NOW - 60_000).toISOString() }),
        now: NOW,
      }),
    ).toBe("Latest snapshot is fresh enough for alert evaluation.");
  });
  it("renders stale-with-no-recent-manual copy", () => {
    expect(
      describeLatestSnapshotForAlerts({
        status: "ok",
        snapshot: snap({ source: "live", ts: new Date(NOW - 120 * 60_000).toISOString() }),
        now: NOW,
      }),
    ).toMatch(/No recent manual snapshot is saved inside the 30-minute alert window/);
  });
  it("renders missing copy", () => {
    expect(
      describeLatestSnapshotForAlerts({ status: "ok", snapshot: null, now: NOW }),
    ).toMatch(/No recent manual or live snapshot/);
  });
  it("returns null while loading/unavailable", () => {
    expect(
      describeLatestSnapshotForAlerts({ status: "loading", snapshot: null, now: NOW }),
    ).toBeNull();
  });
});

describe("buildAlertsHeaderContext", () => {
  it("includes stage label, ranges, and persist note for a fresh manual snapshot", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const vm = buildAlertsHeaderContext({
      growName: "Sour Diesel Auto",
      stage: "veg",
      targets: {
        rh: { min: 55, max: 70 },
        temp: { min: 20, max: 28 },
        vpd: { min: 0.8, max: 1.2 },
      },
      snapshot: snap({ source: "manual", ts: recent }),
      status: "ok",
      now: NOW,
    });
    expect(vm.stageLabel).toBe("Veg");
    expect(vm.ranges.rh).toEqual({ metricLabel: "Humidity", min: 55, max: 70, unit: "%" });
    expect(vm.ranges.temp?.unit).toBe("°C");
    expect(vm.ranges.vpd?.unit).toBe("kPa");
    expect(vm.latestFreshness).toBe("fresh");
    expect(vm.latestSource).toBe("manual");
    expect(vm.alertsCanPersist).toBe(true);
    expect(vm.freshnessWindowLabel).toBe(FRESHNESS_WINDOW_LABEL);
  });
  it("never claims persistence for stale or csv snapshots", () => {
    const old = new Date(NOW - 120 * 60_000).toISOString();
    const stale = buildAlertsHeaderContext({
      growName: null,
      stage: null,
      targets: null,
      snapshot: snap({ source: "manual", ts: old }),
      status: "ok",
      now: NOW,
    });
    expect(stale.alertsCanPersist).toBe(false);
    const csv = buildAlertsHeaderContext({
      growName: null,
      stage: null,
      targets: null,
      snapshot: snap({ source: "csv", ts: new Date(NOW - 60_000).toISOString() }),
      status: "ok",
      now: NOW,
    });
    expect(csv.alertsCanPersist).toBe(false);
  });
});
