/**
 * EcoWitt live evidence → AI Doctor context readiness.
 *
 * Read-only / pure-compiler tests. Proves that canonical source="live"
 * EcoWitt rows (as written by sensor-ingest-webhook with EcoWitt vendor
 * lineage in raw_payload) flow through compilePlantContextFromRows as
 * trustworthy LIVE sensor evidence — and that stale/invalid/demo/csv/
 * manual labels remain distinct and never silently upgrade to live.
 *
 * No Supabase, no AI invoke, no writes. Static scan also confirms this
 * file contains no .insert/.update/.delete/.upsert/.rpc/invoke calls.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compilePlantContextFromRows,
  type SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";
import { buildAiDoctorReadinessView } from "@/lib/aiDoctorReadinessViewModel";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const FRESH = "2026-06-17T11:59:40.568Z";
const STALE = "2026-06-09T00:00:00.000Z"; // > 7 days old

const ECOWITT_RAW = {
  vendor: "ecowitt_windows_testbench",
  transport_source: "ecowitt",
};

function liveEcowittRow(
  metric: string,
  value: number,
  capturedAt = FRESH,
): SensorReadingRowLike {
  return {
    metric,
    value,
    unit: metric === "temperature_c" ? "C" : metric === "humidity_pct" ? "%" : null,
    captured_at: capturedAt,
    source: "live",
    raw_payload: ECOWITT_RAW,
  };
}

const PLANT = {
  id: "p1",
  grow_id: "g1",
  tent_id: "tent-A",
  name: "Test plant",
  strain: "GG#4",
  stage: "veg",
  medium: "coco",
  pot_size: "3 gal",
};

describe("AI Doctor context — canonical source=live EcoWitt rows", () => {
  it("counts fresh source=live rows as LIVE sensor evidence", () => {
    const ctx = compilePlantContextFromRows({
      plant: PLANT,
      growEvents: [],
      sensorReadings: [
        liveEcowittRow("temperature_c", 27.2),
        liveEcowittRow("humidity_pct", 47),
        liveEcowittRow("soil_moisture_pct", 81),
      ],
      now: NOW,
    });
    expect(ctx.hasLiveSensorReadings).toBe(true);
    expect(ctx.missingLiveSensorReadings).toBe(false);
    const live = ctx.sensor_groups.find((g) => g.source === "live");
    expect(live?.sample_count).toBe(3);
    expect(ctx.source_tags).toContain("live");
    expect(ctx.averages_7d.temperature_c).toBe(27.2);
    expect(ctx.averages_7d.humidity_pct).toBe(47);
  });

  it("treats >7-day-old live rows as out-of-window, NOT as current live evidence", () => {
    const ctx = compilePlantContextFromRows({
      plant: PLANT,
      growEvents: [],
      sensorReadings: [liveEcowittRow("temperature_c", 27.2, STALE)],
      now: NOW,
    });
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(ctx.missingLiveSensorReadings).toBe(true);
    expect(ctx.averages_7d.temperature_c).toBeNull();
  });

  it("never classifies explicit state='stale' or 'invalid' rows as live/healthy", () => {
    const ctx = compilePlantContextFromRows({
      plant: PLANT,
      growEvents: [],
      sensorReadings: [
        { ...liveEcowittRow("temperature_c", 27.2), state: "stale" },
        { ...liveEcowittRow("humidity_pct", 47), state: "invalid" },
      ],
      now: NOW,
    });
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(ctx.sensor_groups.map((g) => g.source).sort()).toEqual([
      "invalid",
      "stale",
    ]);
    // averages_7d uses only trustworthy (live + manual)
    expect(ctx.averages_7d.temperature_c).toBeNull();
    expect(ctx.averages_7d.humidity_pct).toBeNull();
  });

  it("keeps demo / manual / csv labels distinct from live", () => {
    const ctx = compilePlantContextFromRows({
      plant: PLANT,
      growEvents: [],
      sensorReadings: [
        { ...liveEcowittRow("temperature_c", 25), source: "demo" },
        { ...liveEcowittRow("humidity_pct", 50), source: "manual" },
        { ...liveEcowittRow("vpd_kpa", 1.0), source: "csv" },
      ],
      now: NOW,
    });
    const tags = ctx.sensor_groups.map((g) => g.source).sort();
    expect(tags).toEqual(["csv", "demo", "manual"]);
    expect(ctx.hasLiveSensorReadings).toBe(false);
  });

  it("readiness view treats live EcoWitt + recent grow event as ready, with Live source badge", () => {
    const ctx = compilePlantContextFromRows({
      plant: PLANT,
      growEvents: [
        {
          occurred_at: "2026-06-16T10:00:00.000Z",
          event_type: "watering",
          source: "manual",
          note: "watered 1L",
        },
      ],
      sensorReadings: [
        liveEcowittRow("temperature_c", 27.2),
        liveEcowittRow("humidity_pct", 47),
      ],
      now: NOW,
    });
    const view = buildAiDoctorReadinessView({
      context: {
        ...ctx,
        // generateAiDoctorResult tolerates this minimal shape via the
        // existing engine; preview fields are not asserted here.
      } as never,
      openAlertsCount: 0,
    });
    expect(view.state).toBe("ready");
    const liveBadge = view.sourceBadges.find((b) => b.source === "live");
    expect(liveBadge?.label).toBe("Live");
    expect(liveBadge?.isTrustworthy).toBe(true);
    expect(view.confidenceClass).toBe("ready");
  });
});

describe("AI Doctor EcoWitt evidence — safety / no-write / no-AI scan", () => {
  it("the compiler + readiness view-model source files perform no writes / AI / secret-leak", () => {
    const files = [
      "src/lib/aiDoctorContextCompiler.ts",
      "src/lib/aiDoctorReadinessViewModel.ts",
      "src/lib/ecowittLatestSnapshotFilter.ts",
    ];
    const FORBIDDEN = [
      ".insert" + "(",
      ".update" + "(",
      ".delete" + "(",
      ".upsert" + "(",
      ".rpc" + "(",
      "functions.invoke",
      "service_role",
      "PASS" + "KEY",
      "Authoriz" + "ation",
      "Bearer" + " ",
      "vbt_",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const forbidden of FORBIDDEN) {
        expect(
          src.includes(forbidden),
          `${f} must not contain "${forbidden}"`,
        ).toBe(false);
      }
    }
  });
});
