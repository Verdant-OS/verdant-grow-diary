import { describe, it, expect } from "vitest";
import {
  STALE_THRESHOLD_MINUTES,
  FRESHNESS_WINDOW_LABEL,
  classifyLatestSnapshotFreshness,
  hasRecentManualSnapshot,
  describeLatestSnapshotForAlerts,
  buildAlertsHeaderContext,
  buildLatestSnapshotDetail,
  formatCapturedAgo,
  snapshotAlertsCanPersist,
  pickAlertsGrowContext,
} from "@/lib/alertFreshnessContext";
import { STALE_THRESHOLD_MS, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-06-23T12:00:00Z");

function snap(
  overrides: Partial<SensorSnapshot> & { source: SensorSnapshot["source"]; ts: string | null },
): SensorSnapshot {
  return {
    source: overrides.source,
    quality: overrides.source === "live" ? "ok" : null,
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
    expect(classifyLatestSnapshotFreshness({ status: "loading", snapshot: null, now: NOW })).toBe(
      "unavailable",
    );
  });
  it("returns missing when no usable snapshot", () => {
    expect(classifyLatestSnapshotFreshness({ status: "ok", snapshot: null, now: NOW })).toBe(
      "missing",
    );
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
  it("never classifies a source-only live snapshot as fresh", () => {
    const recent = new Date(NOW - 5 * 60_000).toISOString();
    expect(
      classifyLatestSnapshotFreshness({
        status: "ok",
        snapshot: snap({ source: "live", quality: null, ts: recent }),
        now: NOW,
      }),
    ).toBe("stale");
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

describe("snapshotAlertsCanPersist", () => {
  it("mirrors the alert pipeline gate (fresh manual/live only)", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const old = new Date(NOW - 120 * 60_000).toISOString();
    expect(
      snapshotAlertsCanPersist({
        status: "ok",
        snapshot: snap({ source: "manual", ts: recent }),
        now: NOW,
      }),
    ).toBe(true);
    expect(
      snapshotAlertsCanPersist({
        status: "ok",
        snapshot: snap({ source: "live", ts: recent }),
        now: NOW,
      }),
    ).toBe(true);
    expect(
      snapshotAlertsCanPersist({
        status: "ok",
        snapshot: snap({ source: "manual", ts: old }),
        now: NOW,
      }),
    ).toBe(false);
    for (const source of ["csv", "diary", "sim", "unavailable"] as const) {
      expect(
        snapshotAlertsCanPersist({
          status: "ok",
          snapshot: snap({ source, ts: recent }),
          now: NOW,
        }),
      ).toBe(false);
    }
    expect(snapshotAlertsCanPersist({ status: "loading", snapshot: null, now: NOW })).toBe(false);
  });

  it("blocks persistence for fresh source-only live telemetry", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    expect(
      snapshotAlertsCanPersist({
        status: "ok",
        snapshot: snap({ source: "live", quality: null, ts: recent }),
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("describeLatestSnapshotForAlerts — driven by alertsCanPersist", () => {
  const recent = new Date(NOW - 60_000).toISOString();
  const old = new Date(NOW - 120 * 60_000).toISOString();

  it("fresh manual reading reports it can be checked", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "manual", ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/manual snapshot is fresh/i);
    expect(msg).toMatch(/can be checked against targets/i);
  });

  it("fresh live reading reports it can be checked", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "live", ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/live snapshot is fresh/i);
  });

  it("describes source-only live telemetry as context-only", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "live", quality: null, ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/context only/i);
    expect(msg).not.toMatch(/live snapshot is fresh/i);
  });

  it("recent csv snapshot is context-only, never implies persistence", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "csv", ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/context only/i);
    expect(msg).toMatch(/manual or live/i);
    expect(msg).not.toMatch(/will persist|can be checked/i);
  });

  it("recent sim snapshot is context-only", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "sim", ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/context only/i);
  });

  it("recent diary snapshot is context-only", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "diary", ts: recent }),
      now: NOW,
    });
    expect(msg).toMatch(/context only/i);
  });

  it("stale manual snapshot prompts a fresh manual entry", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: snap({ source: "manual", ts: old }),
      now: NOW,
    });
    expect(msg).toMatch(/stale/i);
    expect(msg).toMatch(/Enter a new manual snapshot/i);
    expect(msg).toContain(FRESHNESS_WINDOW_LABEL);
  });

  it("missing snapshot prompts a manual entry", () => {
    const msg = describeLatestSnapshotForAlerts({
      status: "ok",
      snapshot: null,
      now: NOW,
    });
    expect(msg).toMatch(/No snapshot available/i);
    expect(msg).toMatch(/Enter a manual snapshot/i);
  });

  it("returns the unavailable copy while loading", () => {
    expect(
      describeLatestSnapshotForAlerts({ status: "loading", snapshot: null, now: NOW }),
    ).toMatch(/unavailable/i);
  });
});

describe("buildAlertsHeaderContext", () => {
  const recent = new Date(NOW - 60_000).toISOString();

  it("includes stage label, ranges, and persist gate for a fresh manual snapshot", () => {
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
    expect(vm.alertsCanPersist).toBe(true);
  });

  it("converts stored Celsius range to °F when tempUnit=fahrenheit", () => {
    const vm = buildAlertsHeaderContext({
      growName: null,
      stage: null,
      targets: { rh: null, temp: { min: 20, max: 28 }, vpd: null },
      snapshot: null,
      status: "ok",
      now: NOW,
      tempUnit: "fahrenheit",
    });
    expect(vm.ranges.temp).toEqual({
      metricLabel: "Temperature",
      min: 68,
      max: 82,
      unit: "°F",
    });
    // RH stays %, VPD untouched (null here).
    expect(vm.ranges.rh).toBeNull();
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
      snapshot: snap({ source: "csv", ts: recent }),
      status: "ok",
      now: NOW,
    });
    expect(csv.alertsCanPersist).toBe(false);
  });
});

describe("pickAlertsGrowContext", () => {
  const grows = [
    { id: "g1", name: "G One", stage: "veg", updated_at: "2026-06-20T00:00:00Z" },
    { id: "g2", name: "G Two", stage: "flower", updated_at: "2026-06-22T00:00:00Z" },
    { id: "g3", name: "G Three", stage: null, updated_at: "2026-06-21T00:00:00Z" },
  ];

  it("returns null when no grows exist", () => {
    expect(pickAlertsGrowContext({ grows: [] })).toBeNull();
  });

  it("prefers the scoped grow when it matches", () => {
    const sel = pickAlertsGrowContext({
      scopedGrowId: "g3",
      activeGrowId: "g1",
      grows,
    });
    expect(sel?.growId).toBe("g3");
    expect(sel?.isFallback).toBe(false);
    expect(sel?.reason).toBe("scoped");
  });

  it("falls back to the active grow when no scoped grow is set", () => {
    const sel = pickAlertsGrowContext({ activeGrowId: "g1", grows });
    expect(sel?.growId).toBe("g1");
    expect(sel?.isFallback).toBe(false);
    expect(sel?.reason).toBe("active");
  });

  it("falls back to a grow with open alerts when no active grow matches", () => {
    const sel = pickAlertsGrowContext({
      activeGrowId: "missing-id",
      grows,
      growIdsWithOpenAlerts: ["g3"],
    });
    expect(sel?.growId).toBe("g3");
    expect(sel?.isFallback).toBe(true);
    expect(sel?.reason).toBe("open-alerts");
  });

  it("falls back to the most recently updated grow", () => {
    const sel = pickAlertsGrowContext({ grows });
    expect(sel?.growId).toBe("g2");
    expect(sel?.isFallback).toBe(true);
    expect(sel?.reason).toBe("most-recent");
  });

  it("falls back to the first grow when no updated_at is available", () => {
    const bare = [
      { id: "b2", name: "B Two" },
      { id: "b1", name: "B One" },
    ];
    const sel = pickAlertsGrowContext({ grows: bare });
    expect(sel?.growId).toBe("b1");
    expect(sel?.reason).toBe("first");
    expect(sel?.isFallback).toBe(true);
  });
});

describe("formatCapturedAgo", () => {
  it("formats minute/hour/day buckets deterministically", () => {
    expect(formatCapturedAgo(NOW - 8 * 60_000, NOW)).toBe("8 minutes ago");
    expect(formatCapturedAgo(NOW - 1 * 60_000, NOW)).toBe("1 minute ago");
    expect(formatCapturedAgo(NOW - 4 * 60 * 60_000, NOW)).toBe("4 hours ago");
    expect(formatCapturedAgo(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe("3 days ago");
    expect(formatCapturedAgo(null, NOW)).toBeNull();
  });
});

describe("buildLatestSnapshotDetail", () => {
  const recent = new Date(NOW - 8 * 60_000).toISOString();
  const old = new Date(NOW - 3 * 24 * 60 * 60_000).toISOString();

  it("manual + fresh → eligible for persistence", () => {
    const d = buildLatestSnapshotDetail({
      status: "ok",
      snapshot: snap({ source: "manual", ts: recent }),
      now: NOW,
    });
    expect(d).not.toBeNull();
    expect(d?.sourceLabel).toBe("Manual");
    expect(d?.insideWindow).toBe(true);
    expect(d?.canPersist).toBe(true);
    expect(d?.detailLine).toContain("Latest snapshot: Manual");
    expect(d?.detailLine).toContain("captured 8 minutes ago");
    expect(d?.detailLine).toContain(FRESHNESS_WINDOW_LABEL);
    expect(d?.detailLine).toContain("eligible for alert persistence");
  });

  it("live + fresh → eligible for persistence", () => {
    const d = buildLatestSnapshotDetail({
      status: "ok",
      snapshot: snap({ source: "live", ts: recent }),
      now: NOW,
    });
    expect(d?.sourceLabel).toBe("Live");
    expect(d?.canPersist).toBe(true);
    expect(d?.detailLine).toContain("Latest snapshot: Live");
  });

  it("manual + stale → outside window, prompts fresh manual", () => {
    const d = buildLatestSnapshotDetail({
      status: "ok",
      snapshot: snap({ source: "manual", ts: old }),
      now: NOW,
    });
    expect(d?.insideWindow).toBe(false);
    expect(d?.canPersist).toBe(false);
    expect(d?.detailLine).toContain("outside");
    expect(d?.detailLine).toContain("Enter a fresh manual snapshot");
  });

  it.each(["csv", "diary", "sim"] as const)(
    "%s source is context-only even when recent — never claims persistence",
    (source) => {
      const d = buildLatestSnapshotDetail({
        status: "ok",
        snapshot: snap({ source, ts: recent }),
        now: NOW,
      });
      expect(d?.canPersist).toBe(false);
      expect(d?.detailLine).toContain("context only");
      expect(d?.detailLine).toContain("manual or live readings");
      expect(d?.detailLine).not.toMatch(/eligible for alert persistence/);
    },
  );

  it("returns null while loading/unavailable or when no snapshot", () => {
    expect(buildLatestSnapshotDetail({ status: "loading", snapshot: null, now: NOW })).toBeNull();
    expect(buildLatestSnapshotDetail({ status: "ok", snapshot: null, now: NOW })).toBeNull();
  });

  it("buildAlertsHeaderContext attaches latestDetail mirroring alertsCanPersist", () => {
    const vm = buildAlertsHeaderContext({
      growName: null,
      stage: null,
      targets: null,
      snapshot: snap({ source: "manual", ts: recent }),
      status: "ok",
      now: NOW,
    });
    expect(vm.latestDetail?.canPersist).toBe(vm.alertsCanPersist);
    expect(vm.latestDetail?.detailLine).toContain("Manual");
  });
});

describe("pickAlertsGrowContext — open-alerts tiebreaker is deterministic", () => {
  const grows = [
    { id: "ga", name: "A", updated_at: "2026-06-22T00:00:00Z" },
    { id: "gb", name: "B", updated_at: "2026-06-23T00:00:00Z" },
    { id: "gc", name: "C", updated_at: "2026-06-21T00:00:00Z" },
  ];
  it("prefers most-recently-updated among open-alerts grows", () => {
    const sel = pickAlertsGrowContext({
      grows,
      growIdsWithOpenAlerts: ["ga", "gb", "gc"],
    });
    expect(sel?.growId).toBe("gb");
    expect(sel?.reason).toBe("open-alerts");
  });
  it("falls back to id sort when updated_at is missing", () => {
    const bare = [
      { id: "g2", name: null },
      { id: "g1", name: null },
    ];
    const sel = pickAlertsGrowContext({
      grows: bare,
      growIdsWithOpenAlerts: ["g2", "g1"],
    });
    expect(sel?.growId).toBe("g1");
  });
});
