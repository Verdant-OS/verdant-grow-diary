import { describe, it, expect } from "vitest";
import {
  classifyQuickLogSnapshotSource,
  type QuickLogSensorRowLike,
} from "@/lib/quickLogSensorSnapshotRules";
import { snapshotFromDiary } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-06-02T12:00:00Z").getTime();
const FRESH_TS = new Date(NOW - 2 * 60 * 1000).toISOString(); // 2 min ago
const STALE_TS = new Date(NOW - 2 * 60 * 60 * 1000).toISOString(); // 2 h ago

describe("classifyQuickLogSnapshotSource", () => {
  it("fresh live reading → state=live", () => {
    const row: QuickLogSensorRowLike = {
      source: "live",
      ts: FRESH_TS,
      metric: "temperature_c",
      value: 24,
    };
    expect(classifyQuickLogSnapshotSource(row, NOW)).toEqual({
      source: "live",
      state: "live",
    });
  });

  it("pi_bridge fresh reading → state=live, source preserved", () => {
    const row: QuickLogSensorRowLike = {
      source: "pi_bridge",
      ts: FRESH_TS,
      metric: "humidity_pct",
      value: 55,
    };
    expect(classifyQuickLogSnapshotSource(row, NOW)).toEqual({
      source: "pi_bridge",
      state: "live",
    });
  });

  it("manual reading → state=manual (even when old)", () => {
    const row: QuickLogSensorRowLike = {
      source: "manual",
      ts: STALE_TS,
      metric: "temperature_c",
      value: 23,
    };
    expect(classifyQuickLogSnapshotSource(row, NOW)).toEqual({
      source: "manual",
      state: "manual",
    });
  });

  it("manual_snapshot synonym → state=manual", () => {
    const row: QuickLogSensorRowLike = {
      source: "Manual_Snapshot",
      ts: FRESH_TS,
      value: 1,
    };
    expect(classifyQuickLogSnapshotSource(row, NOW)).toEqual({
      source: "manual_snapshot",
      state: "manual",
    });
  });

  it("stale live reading → state=stale", () => {
    const row: QuickLogSensorRowLike = {
      source: "live",
      ts: STALE_TS,
      metric: "temperature_c",
      value: 24,
    };
    expect(classifyQuickLogSnapshotSource(row, NOW)).toEqual({
      source: "live",
      state: "stale",
    });
  });

  it("non-finite value → state=invalid", () => {
    expect(
      classifyQuickLogSnapshotSource(
        { source: "live", ts: FRESH_TS, metric: "temperature_c", value: Number.NaN },
        NOW,
      ),
    ).toEqual({ source: "live", state: "invalid" });
  });

  it("missing/unparseable ts → state=invalid", () => {
    expect(
      classifyQuickLogSnapshotSource(
        { source: "live", ts: "not-a-date", value: 1 },
        NOW,
      ).state,
    ).toBe("invalid");
    expect(
      classifyQuickLogSnapshotSource({ source: "live", ts: null, value: 1 }, NOW).state,
    ).toBe("invalid");
  });

  it("demo/sim/fixture sources → state=invalid (never silently live)", () => {
    for (const source of ["demo", "sim", "fixture", "demo_fixture", "mock"]) {
      expect(
        classifyQuickLogSnapshotSource({ source, ts: FRESH_TS, value: 1 }, NOW).state,
      ).toBe("invalid");
    }
  });

  it("null / undefined / empty row → state=invalid, source=null", () => {
    expect(classifyQuickLogSnapshotSource(null, NOW)).toEqual({
      source: null,
      state: "invalid",
    });
    expect(classifyQuickLogSnapshotSource(undefined, NOW)).toEqual({
      source: null,
      state: "invalid",
    });
    expect(classifyQuickLogSnapshotSource({}, NOW).state).toBe("invalid");
  });

  it("deterministic for same input + now", () => {
    const row: QuickLogSensorRowLike = { source: "live", ts: FRESH_TS, value: 22 };
    const a = classifyQuickLogSnapshotSource(row, NOW);
    const b = classifyQuickLogSnapshotSource(row, NOW);
    expect(a).toEqual(b);
  });

  it("missing value (undefined) is tolerated when ts + source are valid", () => {
    // QuickLog passes a representative row whose `value` may not be the
    // metric being embedded. Absent `value` must not force invalid.
    expect(
      classifyQuickLogSnapshotSource({ source: "live", ts: FRESH_TS }, NOW),
    ).toEqual({ source: "live", state: "live" });
  });
});

describe("snapshotFromDiary tolerance with new fields", () => {
  it("ignores extra source/state fields without breaking fallback", () => {
    const snap = snapshotFromDiary("2026-06-02T11:00:00Z", {
      ts: "2026-06-02T11:00:00Z",
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 30,
      source: "live",
      state: "live",
    });
    expect(snap).not.toBeNull();
    // snapshotFromDiary always brands as "diary" — extra fields don't promote it.
    expect(snap!.source).toBe("diary");
    expect(snap!.temp).toBe(24);
  });

  it("legacy snapshot without source/state still resolves", () => {
    const snap = snapshotFromDiary("2026-06-02T11:00:00Z", {
      ts: "2026-06-02T11:00:00Z",
      temp: 22,
      rh: 50,
    });
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("diary");
  });
});
