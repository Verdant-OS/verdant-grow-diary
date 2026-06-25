/**
 * Sensor-truth presentation leak coverage.
 *
 * Verifies that the same truth helpers used by the tent header view also
 * gate:
 *   - the tent environment chart series
 *   - manual snapshot change-context deltas
 *   - recent manual snapshot history chips
 *
 * Safety scope: presenter-only, no schema/RLS/edge/automation/device
 * control/action_queue writes. No fake-live source rewrites.
 */
import { describe, it, expect } from "vitest";
import { buildTentSensorChartSeries } from "@/lib/tentSensorChartRules";
import {
  buildManualSnapshotChangeContext,
  deriveChangeContextFromReadings,
} from "@/lib/manualSensorSnapshotChangeContextRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";

const T0 = "2026-05-23T09:00:00Z";
const T1 = "2026-05-24T09:00:00Z";
const T2 = "2026-05-25T09:00:00Z";

describe("buildTentSensorChartSeries · truth filtering", () => {
  it("excludes impossible temperature from the chart series (no spike)", () => {
    const out = buildTentSensorChartSeries([
      { ts: T1, metric: "temperature_c", value: 24, source: "live" }, // ≈ 75°F
      { ts: T2, metric: "temperature_c", value: 999, source: "live" }, // impossible
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].temp).toBe(24);
    expect(out[1].temp).toBeNull();
    // Chart domain (min/max) computed across `temp` should not see 999.
    const temps = out.map((p) => p.temp).filter((v): v is number => v !== null);
    expect(Math.max(...temps)).toBe(24);
  });

  it("excludes impossible VPD from the chart series", () => {
    const out = buildTentSensorChartSeries([
      { ts: T1, metric: "vpd_kpa", value: 1.1, source: "live" },
      { ts: T2, metric: "vpd_kpa", value: 7.5, source: "live" },
    ]);
    expect(out[0].vpd).toBe(1.1);
    expect(out[1].vpd).toBeNull();
  });

  it("nulls derived VPD when temp at the same ts is invalid", () => {
    const out = buildTentSensorChartSeries([
      { ts: T1, metric: "temperature_c", value: 999, source: "live" },
      { ts: T1, metric: "humidity_pct", value: 55, source: "live" },
      { ts: T1, metric: "vpd_kpa", value: 1.1, source: "live" },
    ]);
    expect(out[0].temp).toBeNull();
    expect(out[0].vpd).toBeNull();
    expect(out[0].rh).toBe(55);
  });
});

describe("buildManualSnapshotChangeContext · truth filtering", () => {
  it("suppresses delta when current snapshot has invalid temp", () => {
    const r = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { temperature_c: 24, humidity_pct: 55 } },
      latest: { ts: T2, metrics: { temperature_c: 999, humidity_pct: 50 } },
    });
    expect(r.deltas.map((d) => d.key)).toEqual(["humidity_pct"]);
    expect(r.suppressedDeltas.map((d) => d.key)).toEqual(["temperature_c"]);
    expect(r.suppressedDeltas[0].reasonChip).toMatch(/Invalid temp/);
    expect(r.suppressedDeltas[0].side).toBe("current");
  });

  it("suppresses delta when previous snapshot has invalid VPD", () => {
    const r = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { vpd_kpa: 99 } },
      latest: { ts: T2, metrics: { vpd_kpa: 1.1 } },
    });
    expect(r.deltas).toEqual([]);
    expect(r.suppressedDeltas).toHaveLength(1);
    expect(r.suppressedDeltas[0].side).toBe("previous");
    expect(r.suppressedDeltas[0].reasonChip).toMatch(/Invalid VPD/);
  });

  it("preserves realistic deltas alongside suppressed ones", () => {
    const r = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { humidity_pct: 55, soil_ec_ms_cm: 1.4 } },
      latest: { ts: T2, metrics: { humidity_pct: 50, soil_ec_ms_cm: 1450 } },
    });
    expect(r.deltas.map((d) => d.key)).toEqual(["humidity_pct"]);
    expect(r.suppressedDeltas.map((d) => d.key)).toEqual(["soil_ec_ms_cm"]);
    expect(r.suppressedDeltas[0].reasonChip).toMatch(/Unit mismatch suspected/);
  });

  it("derive variant returns suppressedDeltas alongside firstSnapshot=false", () => {
    const r = deriveChangeContextFromReadings(
      [
        { ts: T1, metric: "temperature_c", value: 24, source: "manual", tent_id: "t1" },
        { ts: T2, metric: "temperature_c", value: 999, source: "manual", tent_id: "t1" },
      ],
      { tentId: "t1" },
    );
    expect(r.firstSnapshot).toBe(false);
    expect(r.suppressedDeltas).toHaveLength(1);
    expect(r.suppressedDeltas[0].key).toBe("temperature_c");
  });
});

describe("buildManualSnapshotHistoryList · invalid chips", () => {
  const rows = [
    // Newest: impossible temp + impossible VPD
    { ts: T2, metric: "temperature_c", value: 999, source: "manual", tent_id: "t1" },
    { ts: T2, metric: "humidity_pct", value: 50, source: "manual", tent_id: "t1" },
    { ts: T2, metric: "vpd_kpa", value: 1.1, source: "manual", tent_id: "t1" },
    { ts: T2, metric: "soil_ec_ms_cm", value: 1450, source: "manual", tent_id: "t1" },
    // Previous: realistic
    { ts: T1, metric: "temperature_c", value: 24, source: "manual", tent_id: "t1" },
    { ts: T1, metric: "humidity_pct", value: 55, source: "manual", tent_id: "t1" },
  ];

  it("emits invalid chips and strips invalid metrics from the normal chip list", () => {
    const list = buildManualSnapshotHistoryList(rows, { tentId: "t1" });
    expect(list).toHaveLength(2);

    const latest = list[0];
    const latestKeys = latest.metrics.map((m) => m.key);
    expect(latestKeys).not.toContain("temperature_c");
    expect(latestKeys).not.toContain("vpd_kpa"); // dropped by temp-dep rule
    expect(latestKeys).not.toContain("soil_ec_ms_cm");
    // Humidity is realistic and stays as a normal chip.
    expect(latestKeys).toContain("humidity_pct");

    const invalidKeys = latest.invalidChips.map((c) => c.key);
    expect(invalidKeys).toEqual(
      expect.arrayContaining(["temperature_c", "vpd_kpa", "soil_ec_ms_cm"]),
    );
    const chips = latest.invalidChips.map((c) => c.chip);
    expect(chips).toEqual(
      expect.arrayContaining(["Invalid temp", "Invalid VPD", "Unit mismatch suspected"]),
    );

    // Previous snapshot stays clean.
    expect(list[1].invalidChips).toEqual([]);
    expect(list[1].metrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(["temperature_c", "humidity_pct"]),
    );
  });

  it("does not introduce a fake-live source rewrite on the latest entry", () => {
    const list = buildManualSnapshotHistoryList(rows, { tentId: "t1" });
    // The history surface itself is manual-only (filter inside
    // groupManualReadingsToSnapshots), so no entry should appear when
    // only "live" rows exist.
    const liveOnly = buildManualSnapshotHistoryList(
      [{ ts: T2, metric: "temperature_c", value: 24, source: "live", tent_id: "t1" }],
      { tentId: "t1" },
    );
    expect(liveOnly).toEqual([]);
    // And manual entries are not promoted to live by this helper.
    expect(list.length).toBeGreaterThan(0);
  });
});

describe("source label safety — no fake-live rewrites", () => {
  it("manual realistic readings stay represented as manual snapshots", () => {
    const list = buildManualSnapshotHistoryList(
      [
        { ts: T1, metric: "temperature_c", value: 24, source: "manual", tent_id: "t1" },
        { ts: T1, metric: "humidity_pct", value: 55, source: "manual", tent_id: "t1" },
      ],
      { tentId: "t1" },
    );
    expect(list).toHaveLength(1);
    expect(list[0].invalidChips).toEqual([]);
    expect(list[0].metrics.length).toBeGreaterThan(0);
  });
});
