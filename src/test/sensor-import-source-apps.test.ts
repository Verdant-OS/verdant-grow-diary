/**
 * sensor-import-source-apps — pure registry tests using REAL uploaded
 * fixtures. No network, no DB, no UI. Verifies detection, mapping, preview
 * counts, warnings, and the static safety surface of the new module.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SENSOR_IMPORT_CANONICAL_SOURCE,
  cleanHeaders,
  detectSourceApp,
  mapColumnsForApp,
  mapColumnsForSpiderFarmer,
  mapColumnsForVivosun,
  parseMetricCell,
  stripBomAndTrim,
  summarizeImportPreview,
} from "@/lib/sensorImportSourceApps";
import { parseCsv } from "@/lib/csvSensorImportRules";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) =>
  readFileSync(resolve(ROOT, "fixtures/sensor-csv", rel), "utf8");

const SPIDER_FULL = read("spider_farmer_primary_full_20260612214443.csv");
const SPIDER_SPARSE = read("spider_farmer_primary_sparse_20260612214427.csv");
const SPIDER_SENSOR_ONLY = read("spider_farmer_sensor_only_20260612214453.csv");
const VIVOSUN = read("vivosun_growhub_veg_tent_202606121323.csv");

// Synthetic AC Infinity CSV — preserves the existing AC Infinity contract
// without depending on a binary fixture.
const AC_INFINITY_CSV = [
  "Timestamp,Temperature (°F),Humidity (%),VPD (kPa)",
  "2026-05-26 14:00:00,77,50,1.2",
  "2026-05-26 15:00:00,78,52,1.25",
].join("\n");

describe("BOM + header hygiene", () => {
  it("strips UTF-8 BOM from headers before detection", () => {
    const headers = parseCsv(SPIDER_FULL).headers;
    expect(headers[0].charCodeAt(0)).toBe(0xfeff); // raw still has BOM
    const cleaned = cleanHeaders(headers);
    expect(cleaned[0]).toBe("deviceSerialnum");
    expect(stripBomAndTrim("\uFEFFTimestamp")).toBe("Timestamp");
  });
});

describe("detectSourceApp — real fixtures", () => {
  it("Spider Farmer primary (full) → spider_farmer", () => {
    const d = detectSourceApp(parseCsv(SPIDER_FULL).headers);
    expect(d.id).toBe("spider_farmer");
    expect(d.confidence).toBe("high");
  });
  it("Spider Farmer primary (sparse co2/ppfd) → spider_farmer", () => {
    const d = detectSourceApp(parseCsv(SPIDER_SPARSE).headers);
    expect(d.id).toBe("spider_farmer");
  });
  it("Spider Farmer sensor-only export → spider_farmer", () => {
    const d = detectSourceApp(parseCsv(SPIDER_SENSOR_ONLY).headers);
    expect(d.id).toBe("spider_farmer");
  });
  it("Vivosun GrowHub export → vivosun", () => {
    const d = detectSourceApp(parseCsv(VIVOSUN).headers);
    expect(d.id).toBe("vivosun");
    expect(d.confidence).not.toBe("none");
  });
  it("AC Infinity-style synthetic export → ac_infinity", () => {
    const d = detectSourceApp(parseCsv(AC_INFINITY_CSV).headers);
    expect(d.id).toBe("ac_infinity");
  });
  it("Unknown CSV → unknown_source_app, NOT ac_infinity", () => {
    const headers = ["foo", "bar", "baz"];
    const d = detectSourceApp(headers);
    expect(d.id).toBe("unknown_source_app");
  });
});

describe("Spider Farmer mapping", () => {
  it("maps temp_f, humidity_pct, vpd_kpa, co2_ppm, ppfd_umol_m2_s on the full export", () => {
    const m = mapColumnsForSpiderFarmer(parseCsv(SPIDER_FULL).headers);
    expect(m.mapped.temp_f).toBe("temperature(°F)");
    expect(m.mapped.humidity_pct).toBe("humidity");
    expect(m.mapped.vpd_kpa).toBe("vpd");
    expect(m.mapped.co2_ppm).toBe("co2");
    expect(m.mapped.ppfd_umol_m2_s).toBe("ppfd");
    expect(m.timestamp).toBe("Timestamp");
  });
  it("does NOT double-emit °C and °F — °C is rawProvenance only", () => {
    const m = mapColumnsForSpiderFarmer(parseCsv(SPIDER_FULL).headers);
    expect(m.mapped.temp_f).toBe("temperature(°F)");
    expect(m.rawProvenance).toContain("temperature(°C)");
    // °C is never reused as a canonical metric.
    expect(Object.values(m.mapped)).not.toContain("temperature(°C)");
  });
  it("stores deviceSerialnum / roomId / sensorId as raw provenance", () => {
    const m = mapColumnsForSpiderFarmer(parseCsv(SPIDER_SENSOR_ONLY).headers);
    expect(m.rawProvenance).toEqual(
      expect.arrayContaining(["deviceSerialnum", "roomId", "sensorId"]),
    );
  });
});

describe("Vivosun mapping", () => {
  it("maps Probe* as canonical metrics and timestamp", () => {
    const m = mapColumnsForVivosun(parseCsv(VIVOSUN).headers);
    expect(m.timestamp).toBe("Timestamp(1 min)");
    expect(m.mapped.temp_f).toBe("Probe Temperature(℉)");
    expect(m.mapped.humidity_pct).toBe("Probe Humidity(%)");
    expect(m.mapped.vpd_kpa).toBe("Probe VPD(kPa)");
    expect(m.mapped.co2_ppm).toBe("Probe CO2(PPM)");
  });
  it("preserves Built-in columns as raw provenance (never overrides Probe)", () => {
    const m = mapColumnsForVivosun(parseCsv(VIVOSUN).headers);
    expect(m.rawProvenance).toEqual(
      expect.arrayContaining([
        "Built-in Temperature(℉)",
        "Built-in Humidity(%)",
        "Built-in VPD(kPa)",
      ]),
    );
    for (const h of m.rawProvenance) {
      expect(Object.values(m.mapped)).not.toContain(h);
    }
  });
});

describe("parseMetricCell", () => {
  it("treats '-' as null, not zero", () => {
    expect(parseMetricCell("-")).toBeNull();
    expect(parseMetricCell("-")).not.toBe(0);
  });
  it("treats blank / n/a as null", () => {
    expect(parseMetricCell("")).toBeNull();
    expect(parseMetricCell("  ")).toBeNull();
    expect(parseMetricCell("n/a")).toBeNull();
  });
  it("parses real numerics", () => {
    expect(parseMetricCell("24.6")).toBeCloseTo(24.6);
    expect(parseMetricCell("1,200")).toBe(1200);
  });
});

describe("summarizeImportPreview — Spider Farmer full (214443)", () => {
  const p = summarizeImportPreview(SPIDER_FULL);
  it("classifies correctly with canonical csv source", () => {
    expect(p.sourceApp).toBe("spider_farmer");
    expect(p.canonicalSource).toBe(SENSOR_IMPORT_CANONICAL_SOURCE);
    expect(p.canonicalSource).toBe("csv");
  });
  it("accepts thousands of rows; zero rejected with full metrics", () => {
    expect(p.acceptedRowCount).toBeGreaterThan(3000);
    expect(p.rejectedRowCount).toBe(0);
  });
  it("reports all 5 canonical metrics as mapped", () => {
    expect(new Set(p.mappedMetrics)).toEqual(
      new Set(["temp_f", "humidity_pct", "vpd_kpa", "co2_ppm", "ppfd_umol_m2_s"]),
    );
  });
  it("no co2_column_empty warning when co2 has numeric values", () => {
    expect(p.warnings.map((w) => w.code)).not.toContain("co2_column_empty");
  });
});

describe("summarizeImportPreview — Spider Farmer sparse (214427)", () => {
  const p = summarizeImportPreview(SPIDER_SPARSE);
  it("accepts rows with temp/RH/VPD even when co2/ppfd are blank", () => {
    // Fixture has 5673 data rows, mostly without co2/ppfd. Accept ≥ 5000.
    expect(p.acceptedRowCount).toBeGreaterThan(5000);
    expect(p.rejectedRowCount).toBe(0);
  });
});

describe("summarizeImportPreview — Spider Farmer sensor-only (214453)", () => {
  const p = summarizeImportPreview(SPIDER_SENSOR_ONLY);
  it("detects as spider_farmer but rejects every row as empty_metrics", () => {
    expect(p.sourceApp).toBe("spider_farmer");
    expect(p.acceptedRowCount).toBe(0);
    expect(p.rejectedRowCount).toBeGreaterThan(1000);
    expect(p.rejectionReasons.empty_metrics).toBe(p.rejectedRowCount);
  });
  it("emits no_rows_accepted warning", () => {
    expect(p.warnings.map((w) => w.code)).toContain("no_rows_accepted");
  });
});

describe("summarizeImportPreview — Vivosun GrowHub", () => {
  const p = summarizeImportPreview(VIVOSUN);
  it("detects as vivosun and accepts probe-driven rows", () => {
    expect(p.sourceApp).toBe("vivosun");
    expect(p.acceptedRowCount).toBeGreaterThan(30_000);
  });
  it("emits co2_column_empty warning (Probe CO2(PPM) is `-` everywhere)", () => {
    expect(p.warnings.map((w) => w.code)).toContain("co2_column_empty");
  });
  it("does NOT classify the CSV as live or as ac_infinity", () => {
    expect(p.sourceApp).not.toBe("ac_infinity");
    expect(p.canonicalSource).toBe("csv");
  });
  it("treats Probe CO2(PPM) = '-' as null, never 0", () => {
    // Spot-check raw cell parsing
    expect(parseMetricCell("-")).toBeNull();
  });
});

describe("validation flags", () => {
  it("flags humidity stuck at 100", () => {
    const csv = [
      "Timestamp,Temperature (°F),Humidity (%)",
      ...Array.from({ length: 10 }, (_, i) =>
        `2026-05-26 14:${String(i).padStart(2, "0")}:00,77,100`,
      ),
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("humidity_stuck");
  });
  it("flags humidity stuck at 0", () => {
    const csv = [
      "Timestamp,Temperature (°F),Humidity (%)",
      ...Array.from({ length: 10 }, (_, i) =>
        `2026-05-26 14:${String(i).padStart(2, "0")}:00,77,0`,
      ),
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("humidity_stuck");
  });
  it("flags Celsius shown as Fahrenheit when °F column values look like °C", () => {
    const csv = [
      "Timestamp,Temperature (°F),Humidity (%)",
      ...Array.from({ length: 10 }, (_, i) =>
        `2026-05-26 14:${String(i).padStart(2, "0")}:00,24,50`,
      ),
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("celsius_shown_as_fahrenheit");
  });
  it("flags µS/cm-as-mS/cm when EC > 50", () => {
    const csv = [
      "Timestamp,EC (mS/cm)",
      "2026-05-26 14:00:00,1800",
      "2026-05-26 14:01:00,1750",
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("ec_unit_suspicion_us_per_cm");
  });
  it("flags soil moisture stuck at 100", () => {
    const csv = [
      "Timestamp,Soil Moisture (%)",
      ...Array.from({ length: 10 }, (_, i) =>
        `2026-05-26 14:${String(i).padStart(2, "0")}:00,100`,
      ),
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("soil_moisture_stuck");
  });
  it("flags pH outside realistic 4.5–8.5", () => {
    const csv = [
      "Timestamp,pH",
      "2026-05-26 14:00:00,2.1",
      "2026-05-26 14:01:00,2.2",
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.warnings.map((w) => w.code)).toContain("ph_out_of_range");
  });
  it("rejects timestamp-only and empty-metric rows", () => {
    const csv = [
      "Timestamp,Temperature (°F),Humidity (%)",
      "2026-05-26 14:00:00,,",
      "2026-05-26 14:01:00,77,50",
    ].join("\n");
    const p = summarizeImportPreview(csv);
    expect(p.acceptedRowCount).toBe(1);
    expect(p.rejectionReasons.empty_metrics).toBe(1);
  });
});

describe("preview shape contract", () => {
  it("exposes the seven preview fields the UI needs", () => {
    const p = summarizeImportPreview(SPIDER_FULL);
    expect(p).toMatchObject({
      sourceApp: expect.any(String),
      confidence: expect.any(String),
      acceptedRowCount: expect.any(Number),
      rejectedRowCount: expect.any(Number),
      mappedMetrics: expect.any(Array),
      unmappedColumns: expect.any(Array),
      warnings: expect.any(Array),
    });
    expect(p.canonicalSource).toBe("csv");
  });
  it("unknown source still returns a preview with unknown_source_app", () => {
    const p = summarizeImportPreview("foo,bar,baz\n1,2,3");
    expect(p.sourceApp).toBe("unknown_source_app");
  });
});

describe("mapColumnsForApp dispatcher", () => {
  it("returns empty mapping for unknown_source_app", () => {
    const m = mapColumnsForApp("unknown_source_app", ["foo", "bar"]);
    expect(m.mapped).toEqual({});
    expect(m.timestamp).toBeNull();
    expect(m.unmapped).toEqual(["foo", "bar"]);
  });
});

// ---------- Static safety contract for the new module ----------
const MODULE_RAW = readFileSync(
  resolve(ROOT, "src/lib/sensorImportSourceApps.ts"),
  "utf8",
);

describe("source-app registry safety contract", () => {
  it("no live API calls / device-control / alerts / Action Queue writes", () => {
    expect(MODULE_RAW).not.toMatch(/fetch\(\s*["']https?:/i);
    expect(MODULE_RAW).not.toMatch(/\.from\(["'](alerts|alert_events|action_queue|action_queue_events|plants|tents)["']\)/);
    expect(MODULE_RAW).not.toMatch(/openai|anthropic|ai[-_]?doctor/i);
    expect(MODULE_RAW).not.toMatch(/\bmqtt\b|home[\s_-]?assistant|webhook/i);
    expect(MODULE_RAW).not.toMatch(/\brelay\b|\bactuator\b|autopilot/i);
    expect(MODULE_RAW).not.toMatch(/service_role/);
  });
  it("never labels imported rows as 'live'", () => {
    expect(MODULE_RAW).not.toMatch(/source\s*:\s*["']live["']/);
  });
});
