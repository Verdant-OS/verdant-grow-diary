import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
  compilePlantContextFromRows,
  type SensorReadingRowLike,
} from "@/lib/aiDoctorContextCompiler";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (offsetMs: number) =>
  new Date(NOW.getTime() - offsetMs).toISOString();

const plant = {
  id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  name: "Plant",
  strain: "NL",
  stage: "veg",
};

function csvRow(
  metric: string,
  value: number,
  source_app: string,
  offsetMs = 60_000,
  extra: Record<string, unknown> = {},
): SensorReadingRowLike {
  return {
    metric,
    value,
    unit: metric === "temperature_c" ? "C" : null,
    captured_at: iso(offsetMs),
    source: "csv",
    raw_payload: {
      source_app,
      csv_import: true,
      device_serial: "SF-XYZ-001",
      bridge_token: "tok_secret",
      source_file: "/Users/me/export.csv",
      raw_row: { hidden: 1 },
      internal_id: "row-42",
      ...extra,
    },
  };
}

describe("compilePlantContextFromRows — imported CSV/XLSX history", () => {
  it("populates imported_sensor_history when CSV rows exist", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    expect(ctx.imported_sensor_history).not.toBeNull();
    expect(ctx.imported_sensor_history?.sectionLabel).toBe(
      "Imported sensor history",
    );
    expect(AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL).toBe(
      "Imported sensor history",
    );
    expect(ctx.imported_sensor_history?.historicalLabel).toBe("CSV history");
    expect(ctx.imported_sensor_history?.notForLiveDiagnosis).toContain(
      "This is imported CSV history, not live telemetry",
    );
    expect(ctx.imported_sensor_history?.guidance.join(" ")).toContain(
      "not proof of current conditions",
    );
  });

  it("returns null imported_sensor_history when no CSV rows present", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 23,
          captured_at: iso(60_000),
          source: "ecowitt",
        },
      ],
      now: NOW,
    });
    expect(ctx.imported_sensor_history).toBeNull();
    expect(ctx.hasLiveSensorReadings).toBe(true);
    expect(ctx.missingLiveSensorReadings).toBe(false);
  });

  it("surfaces Spider Farmer, Vivosun, AC Infinity, and Verdant Genetics XLSX vendor labels", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [
        csvRow("temperature_c", 24, "spider_farmer"),
        csvRow("humidity_pct", 55, "vivosun"),
        csvRow("vpd_kpa", 1.1, "ac_infinity"),
        csvRow("co2_ppm", 800, "verdant_genetics_xlsx"),
      ],
      now: NOW,
    });
    const labels = ctx.imported_sensor_history!.vendors.map(
      (v) => v.vendorLabel,
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Spider Farmer",
        "Vivosun",
        "AC Infinity",
        "Verdant Genetics XLSX",
      ]),
    );
  });

  it("includes date range, metric summaries, and suspicious flag count", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [
        csvRow("temperature_c", 20, "spider_farmer", 120_000),
        csvRow("temperature_c", 30, "spider_farmer", 60_000, {
          suspicious_flags: ["stuck_humidity"],
        }),
      ],
      now: NOW,
    });
    const hist = ctx.imported_sensor_history!;
    expect(hist.dateRange).not.toBeNull();
    expect(hist.metrics[0]).toMatchObject({
      metric: "temperature_c",
      min: 20,
      max: 30,
      avg: 25,
      count: 2,
    });
    expect(hist.suspiciousFlagCount).toBe(1);
  });

  it("CSV history never satisfies live sensor availability", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [
        csvRow("temperature_c", 24, "spider_farmer"),
        csvRow("humidity_pct", 50, "vivosun"),
      ],
      now: NOW,
    });
    expect(ctx.hasLiveSensorReadings).toBe(false);
    expect(ctx.missingLiveSensorReadings).toBe(true);
    expect(ctx.imported_sensor_history).not.toBeNull();
  });

  it("missing-live-readings remains true when only CSV history exists", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "verdant_genetics_xlsx")],
      now: NOW,
    });
    expect(ctx.missingLiveSensorReadings).toBe(true);
  });

  it("never leaks raw_payload, device serials, bridge tokens, raw rows, or internal IDs", () => {
    const ctx = compilePlantContextFromRows({
      plant,
      growEvents: [],
      sensorReadings: [csvRow("temperature_c", 24, "spider_farmer")],
      now: NOW,
    });
    const json = JSON.stringify(ctx.imported_sensor_history);
    expect(json).not.toContain("SF-XYZ-001");
    expect(json).not.toContain("tok_secret");
    expect(json).not.toContain("export.csv");
    expect(json).not.toContain("raw_row");
    expect(json).not.toContain("row-42");
    expect(json).not.toContain("device_serial");
    expect(json).not.toContain("bridge_token");
    expect(json).not.toContain("raw_payload");
  });

  it("static safety: compiler does not write, alert, queue, or change device state", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/aiDoctorContextCompiler.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
    expect(src).not.toMatch(/\bfrom\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/fetch\s*\(/);
  });
});
