/**
 * #2689 review fixes: the tent Environment chips merge Quick Log manual
 * climate per metric, aged manual readings are labelled stale on both
 * surfaces, and both pages stay wired to the shared helpers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sensorSourceLabel } from "@/lib/sensor/sensorSourceRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import { sensorReadingFromQuickLogEnvironmentRow } from "@/lib/sensorsQuickLogManualSeriesRules";
import {
  latestQuickLogManualClimateByMetric,
  resolveDisplayedTentClimateSnapshot,
  tonightRowsFromQuickLogManualReadings,
} from "@/lib/tentManualEnvironmentSnapshotRules";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";

const TENT = "tent-a";
const NOW = new Date("2026-11-01T13:16:00.000Z");
const NOW_MS = NOW.getTime();
const SENSOR_AT = "2026-11-01T13:00:00.000Z";
const AFTER = "2026-11-01T13:10:00.000Z";
const BEFORE = "2026-11-01T12:00:00.000Z";
const DAYS_AGO = "2026-10-29T13:00:00.000Z";

function manual(
  at: string,
  env: { temperature_c?: number | null; humidity_pct?: number | null },
  tentId = TENT,
) {
  const r = sensorReadingFromQuickLogEnvironmentRow(
    {
      id: `env-${at}-${tentId}`,
      plant_id: null,
      tent_id: tentId,
      occurred_at: at,
      event_type: "environment",
      source: "manual",
      environment: {
        temperature_c: env.temperature_c ?? null,
        humidity_pct: env.humidity_pct ?? null,
        vpd_kpa: null,
      },
    },
    NOW,
  );
  if (!r) throw new Error("fixture did not project");
  return r;
}

function live(over: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: SENSOR_AT,
    temp: 22,
    rh: 55,
    vpd: 1.2,
    co2: 900,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    tent_id: TENT,
    ...over,
  };
}

function resolve(
  sensor: SensorSnapshot | null,
  manuals: ReturnType<typeof manual>[],
  tentId = TENT,
) {
  return resolveDisplayedTentClimateSnapshot({
    sensorSnapshot: sensor,
    manuals,
    tentId,
    nowMs: NOW_MS,
  });
}

describe("resolveDisplayedTentClimateSnapshot: per-metric merge", () => {
  it("a newer temp+RH manual keeps the live CO₂ and VPD", () => {
    const shown = resolve(live(), [manual(AFTER, { temperature_c: 25, humidity_pct: 60 })]);
    expect(shown.manualMetrics).toEqual({ temp: true, rh: true });
    expect(shown.snapshot).toMatchObject({ temp: 25, rh: 60, co2: 900, vpd: 1.2 });
  });

  it("a newer temp-only manual keeps live RH and CO₂", () => {
    const shown = resolve(live(), [manual(AFTER, { temperature_c: 25 })]);
    expect(shown.manualMetrics).toEqual({ temp: true, rh: false });
    expect(shown.snapshot).toMatchObject({ temp: 25, rh: 55, co2: 900, source: "live" });
  });

  it("a newer RH-only manual keeps live temperature", () => {
    const shown = resolve(live(), [manual(AFTER, { humidity_pct: 62 })]);
    expect(shown.manualMetrics).toEqual({ temp: false, rh: true });
    expect(shown.snapshot).toMatchObject({ temp: 22, rh: 62, co2: 900 });
  });

  it("a tie goes to the sensor", () => {
    const shown = resolve(live(), [manual(SENSOR_AT, { temperature_c: 25, humidity_pct: 60 })]);
    expect(shown.fromManual).toBe(false);
    expect(shown.snapshot).toMatchObject({ temp: 22, rh: 55 });
  });

  it("an older manual never replaces the sensor", () => {
    const shown = resolve(live(), [manual(BEFORE, { temperature_c: 25, humidity_pct: 60 })]);
    expect(shown.fromManual).toBe(false);
  });

  it("picks the newest manual per metric across readings", () => {
    const manuals = [
      manual(AFTER, { temperature_c: 25 }),
      manual("2026-11-01T13:05:00.000Z", { temperature_c: 30, humidity_pct: 61 }),
    ];
    const shown = resolve(live(), manuals);
    expect(shown.snapshot).toMatchObject({ temp: 25, rh: 61, co2: 900 });
    expect(latestQuickLogManualClimateByMetric(manuals, TENT).temp?.value).toBe(25);
  });

  it("ignores NaN manual values and keeps the live chip", () => {
    const shown = resolve(live(), [manual(AFTER, { temperature_c: Number.NaN, humidity_pct: 60 })]);
    expect(shown.snapshot?.temp).toBe(22);
    expect(Number.isNaN(shown.snapshot?.temp)).toBe(false);
    expect(shown.snapshot?.rh).toBe(60);
  });

  it("never leaks another tent's manual, and a blank tent id returns the sensor", () => {
    const foreign = [manual(AFTER, { temperature_c: 25, humidity_pct: 60 }, "tent-b")];
    expect(resolve(live(), foreign).fromManual).toBe(false);
    const own = [manual(AFTER, { temperature_c: 25, humidity_pct: 60 })];
    expect(resolve(live(), own, "  ").fromManual).toBe(false);
    expect(resolve(null, own, "").snapshot).toBeNull();
  });

  it("matches the tent id after trimming", () => {
    const own = [manual(AFTER, { temperature_c: 25 })];
    expect(resolve(live(), own, `  ${TENT} `).snapshot?.temp).toBe(25);
  });

  it("labels an old manual stale (no max age: it still shows)", () => {
    const shown = resolve(null, [manual(DAYS_AGO, { temperature_c: 25, humidity_pct: 60 })]);
    expect(shown.fromManual).toBe(true);
    expect(shown.snapshot).toMatchObject({ temp: 25, rh: 60, source: "manual" });
    expect(shown.metricStale).toEqual({ temp: true, rh: true });
    expect(shown.stale).toBe(true);
    const fresh = resolve(null, [manual(AFTER, { temperature_c: 25, humidity_pct: 60 })]);
    expect(fresh.metricStale).toEqual({ temp: false, rh: false });
    expect(fresh.stale).toBe(false);
  });

  it("stamps a full manual win with the log time, not the aged sensor time", () => {
    const sensorAt = new Date(NOW_MS - 30 * 60 * 60_000).toISOString();
    const loggedAt = new Date(NOW_MS - 20 * 60_000).toISOString();
    const shown = resolve(live({ ts: sensorAt }), [
      manual(loggedAt, { temperature_c: 25, humidity_pct: 60 }),
    ]);
    expect(shown.manualMetrics).toEqual({ temp: true, rh: true });
    expect(shown.snapshot?.ts).toBe(loggedAt);
    expect(shown.snapshot?.source).toBe("manual");
    expect(shown.snapshot?.co2).toBe(900);
    expect(shown.metricStale).toEqual({ temp: false, rh: false });
    expect(shown.stale).toBe(false);
    const model = buildSensorSnapshotReadModel({ snapshot: shown.snapshot, now: NOW_MS });
    expect(model.isStale).toBe(false);
    expect(model.capturedAt).toBe(loggedAt);
    expect(model.emptyState).toBeNull();
  });

  it("keeps staleness on the manual chip when the other chip stays on the sensor", () => {
    const sensorAt = new Date(NOW_MS - 20 * 60_000).toISOString();
    const freshLogAt = new Date(NOW_MS - 60_000).toISOString();
    const freshTemp = resolve(live({ ts: sensorAt }), [manual(freshLogAt, { temperature_c: 25 })]);
    expect(freshTemp.manualMetrics).toEqual({ temp: true, rh: false });
    expect(freshTemp.metricStale).toEqual({ temp: false, rh: false });
    expect(freshTemp.snapshot?.source).toBe("live");
    expect(freshTemp.snapshot?.ts).toBe(sensorAt);
    expect(freshTemp.snapshot?.temp).toBe(25);
    expect(freshTemp.snapshot?.rh).toBe(55);

    const agedSensorAt = new Date(NOW_MS - 48 * 60 * 60_000).toISOString();
    const agedLogAt = new Date(NOW_MS - 30 * 60 * 60_000).toISOString();
    const agedRh = resolve(live({ ts: agedSensorAt }), [manual(agedLogAt, { humidity_pct: 62 })]);
    expect(agedRh.manualMetrics).toEqual({ temp: false, rh: true });
    expect(agedRh.metricStale).toEqual({ temp: false, rh: true });
    expect(agedRh.snapshot?.temp).toBe(22);
    expect(agedRh.snapshot?.rh).toBe(62);
    expect(agedRh.snapshot?.ts).toBe(agedSensorAt);
    expect(agedRh.snapshot?.source).toBe("live");
  });
});

describe("tonightRowsFromQuickLogManualReadings: stale labelling", () => {
  it("admits aged rows as manual so Tonight can label them stale instead of dropping them", () => {
    const old = tonightRowsFromQuickLogManualReadings(
      [manual(DAYS_AGO, { temperature_c: 25, humidity_pct: 60 })],
      TENT,
      NOW_MS,
    );
    expect(old.length).toBe(2);
    expect(old.every((row) => row.source === "manual")).toBe(true);
    const shown = buildTonightTentMetrics({
      rows: old,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    for (const key of ["temp", "rh", "vpd"] as const) {
      expect(shown.find((metric) => metric.key === key)).toMatchObject({
        state: "value",
        source: "stale",
        sourceLabel: sensorSourceLabel("stale"),
      });
    }
    const fresh = tonightRowsFromQuickLogManualReadings(
      [manual(AFTER, { temperature_c: 25, humidity_pct: 60 })],
      TENT,
      NOW_MS,
    );
    expect(fresh.every((row) => row.source === "manual")).toBe(true);
    const freshShown = buildTonightTentMetrics({
      rows: fresh,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    expect(freshShown.find((metric) => metric.key === "temp")).toMatchObject({
      state: "value",
      source: "manual",
      sourceLabel: sensorSourceLabel("manual"),
    });
  });
});

describe("page wiring stays on the shared helpers", () => {
  const DETAIL = readFileSync("src/pages/TentDetail.tsx", "utf8");
  const DASHBOARD = readFileSync("src/pages/Dashboard.tsx", "utf8");

  it("TentDetail chips read the merged snapshot and its staleness", () => {
    expect(DETAIL).toMatch(/const displayedClimate = resolveDisplayedTentClimateSnapshot\(/);
    expect(DETAIL).toMatch(/const snap = displayedClimate\.snapshot;/);
    expect(DETAIL).toMatch(
      /displayedClimate\.manualMetrics\[metric\]\s*\?\s*displayedClimate\.metricStale\[metric\]\s*:\s*sensorHeader\.stale/,
    );
    expect(DETAIL).toMatch(/climateChipStale\("temp"\)/);
    expect(DETAIL).toMatch(/climateChipStale\("rh"\)/);
    expect(DETAIL).not.toMatch(/stale:\s*false/);
  });

  it("TentDetail Tonight rows include the manual rows with the clock", () => {
    expect(DETAIL).toMatch(
      /\.\.\.tonightRowsFromQuickLogManualReadings\(quickLogManuals\.data, tent\?\.id \?\? null, nowMs\)/,
    );
  });

  it("Dashboard Tonight rows include the home tent's manual rows", () => {
    expect(DASHBOARD).toMatch(/rows: \[\.\.\.homeSensorRows, \.\.\.homeManualRows\]/);
    expect(DASHBOARD).toMatch(/tonightRowsFromQuickLogManualReadings\([\s\S]*?nowTick,\s*\)/);
  });
});
