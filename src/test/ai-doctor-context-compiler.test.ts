/**
 * AI Doctor Phase 1 context compiler tests.
 *
 * Pure, deterministic. No I/O. No Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  compilePlantContextFromRows,
  type SensorReadingRowLike,
} from "../lib/aiDoctorContextCompiler";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() - offsetMs).toISOString();

const basePlant = {
  id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  name: "Plant 1",
  strain: "NL Auto",
  stage: "veg",
};

describe("compilePlantContextFromRows — source separation", () => {
  it("keeps live, manual, csv, demo, stale, invalid in distinct groups", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.0,
          captured_at: iso(60_000),
          source: "ecowitt",
        },
        {
          metric: "vpd_kpa",
          value: 1.4,
          captured_at: iso(120_000),
          source: "ecowitt",
        },
        {
          metric: "vpd_kpa",
          value: 0.8,
          captured_at: iso(60_000),
          source: "manual",
        },
        {
          metric: "vpd_kpa",
          value: 0.9,
          captured_at: iso(60_000),
          source: "csv",
        },
        {
          metric: "vpd_kpa",
          value: 1.1,
          captured_at: iso(60_000),
          source: "demo",
        },
        {
          metric: "vpd_kpa",
          value: 5.0,
          captured_at: iso(60_000),
          source: "ecowitt",
          state: "stale",
        },
        {
          metric: "vpd_kpa",
          value: 99,
          captured_at: iso(60_000),
          source: "ecowitt",
          state: "invalid",
        },
      ],
      now: NOW,
    });
    expect(ctx.source_tags).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
    const live = ctx.sensor_groups.find((g) => g.source === "live")!;
    const csv = ctx.sensor_groups.find((g) => g.source === "csv")!;
    const demo = ctx.sensor_groups.find((g) => g.source === "demo")!;
    expect(live.sample_count).toBe(2);
    expect(csv.sample_count).toBe(1);
    expect(demo.sample_count).toBe(1);
    // CSV/manual/demo never fold into live.
    expect(live.averages.vpd_kpa).toBe(1.2);
    expect(csv.averages.vpd_kpa).toBe(0.9);
  });

  it("never treats stale or invalid readings as part of the 7-day healthy averages", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: iso(60_000),
          source: "ecowitt",
        },
        // wildly bad stale reading must not corrupt the 7d average
        {
          metric: "temperature_c",
          value: 99,
          captured_at: iso(60_000),
          source: "ecowitt",
          state: "stale",
        },
        // invalid must also be excluded from averages_7d
        {
          metric: "temperature_c",
          value: -50,
          captured_at: iso(60_000),
          source: "ecowitt",
          state: "invalid",
        },
      ],
      now: NOW,
    });
    expect(ctx.averages_7d.temperature_c).toBe(24);
    // Buckets still expose the bad readings honestly.
    const stale = ctx.sensor_groups.find((g) => g.source === "stale");
    const invalid = ctx.sensor_groups.find((g) => g.source === "invalid");
    expect(stale?.sample_count).toBe(1);
    expect(invalid?.sample_count).toBe(1);
  });

  it("excludes demo readings from healthy averages_7d", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 99,
          captured_at: iso(60_000),
          source: "demo",
        },
      ],
      now: NOW,
    });
    expect(ctx.averages_7d.temperature_c).toBeNull();
    expect(ctx.sensor_groups.find((g) => g.source === "demo")?.sample_count).toBe(1);
  });
});

describe("compilePlantContextFromRows — windows + determinism", () => {
  it("excludes sensor readings older than 7 days", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [
        {
          metric: "vpd_kpa",
          value: 1.0,
          captured_at: iso(10 * 24 * 60 * 60 * 1000),
          source: "ecowitt",
        },
      ],
      now: NOW,
    });
    expect(ctx.sensor_groups).toEqual([]);
    expect(ctx.recent_sensor_readings).toEqual([]);
  });

  it("excludes grow events older than 14 days", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      sensorReadings: [],
      growEvents: [
        {
          occurred_at: iso(60_000),
          event_type: "watering",
          source: "manual",
        },
        {
          occurred_at: iso(20 * 24 * 60 * 60 * 1000),
          event_type: "feeding",
          source: "manual",
        },
      ],
      now: NOW,
    });
    expect(ctx.recent_grow_events.map((e) => e.event_type)).toEqual([
      "watering",
    ]);
  });

  it("computes 7-day averages deterministically regardless of row order", () => {
    const rowsA: SensorReadingRowLike[] = [
      {
        metric: "temperature_c",
        value: 22,
        captured_at: iso(1000),
        source: "ecowitt",
      },
      {
        metric: "temperature_c",
        value: 24,
        captured_at: iso(2000),
        source: "ecowitt",
      },
    ];
    const rowsB: SensorReadingRowLike[] = [...rowsA].reverse();
    const a = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: rowsA,
      now: NOW,
    });
    const b = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: rowsB,
      now: NOW,
    });
    expect(a.averages_7d).toEqual(b.averages_7d);
    expect(a.averages_7d.temperature_c).toBe(23);
    expect(a).toEqual(b);
  });

  it("ignores invalid numeric values, future timestamps, and unparseable dates", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [
        { metric: "vpd_kpa", value: "not-a-number", captured_at: iso(60_000) },
        { metric: "vpd_kpa", value: 1.2, captured_at: "not-a-date" },
        {
          metric: "vpd_kpa",
          value: 1.2,
          captured_at: new Date(NOW.getTime() + 60_000).toISOString(),
        },
        { metric: "vpd_kpa", value: 1.2, captured_at: iso(60_000) },
      ],
      now: NOW,
    });
    expect(ctx.recent_sensor_readings.length).toBe(1);
    expect(ctx.averages_7d.vpd_kpa).toBe(1.2);
  });
});

describe("compilePlantContextFromRows — plant identity passthrough", () => {
  it("propagates plant id, grow_id, tent_id, name, strain, stage", () => {
    const ctx = compilePlantContextFromRows({
      plant: basePlant,
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    expect(ctx.plant_id).toBe("p1");
    expect(ctx.grow_id).toBe("g1");
    expect(ctx.tent_id).toBe("t1");
    expect(ctx.plant_name).toBe("Plant 1");
    expect(ctx.strain).toBe("NL Auto");
    expect(ctx.stage).toBe("veg");
  });

  it("returns nulls when plant is null", () => {
    const ctx = compilePlantContextFromRows({
      plant: null,
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    expect(ctx.plant_id).toBeNull();
    expect(ctx.plant_name).toBeNull();
    expect(ctx.strain).toBeNull();
    expect(ctx.stage).toBeNull();
  });
});
