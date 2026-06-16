/**
 * registry-csv-insert-rows-adapter — pure adapter tests using REAL fixtures.
 *
 * Verifies the registry → sensor_readings insert-row shape. Confirms the
 * adapter is import-pure (no React, no Supabase, no network, no insert/rpc).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ADAPTER_CANONICAL_SOURCE,
  buildRegistryCsvInsertRows,
} from "@/lib/registryCsvInsertRowsAdapter";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) =>
  readFileSync(resolve(ROOT, "fixtures/sensor-csv", rel), "utf8");

const SPIDER_FULL = read("spider_farmer_primary_full_20260612214443.csv");
const SPIDER_SPARSE = read("spider_farmer_primary_sparse_20260612214427.csv");
const SPIDER_SENSOR_ONLY = read(
  "spider_farmer_sensor_only_20260612214453.csv",
);
const VIVOSUN = read("vivosun_growhub_veg_tent_202606121323.csv");

const SOURCE_FILE_PATH = resolve(
  ROOT,
  "src/lib/registryCsvInsertRowsAdapter.ts",
);
const SOURCE = readFileSync(SOURCE_FILE_PATH, "utf8");

const baseArgs = (sourceApp: any, csvText: string) => ({
  tentId: "tent-1",
  growId: "grow-1",
  sourceApp,
  importBatchId: "batch-1",
  csvText,
});

// ----------------- static safety surface -----------------

describe("static safety surface", () => {
  it("does not import React", () => {
    expect(SOURCE).not.toMatch(/from\s+["']react["']/);
  });
  it("does not import Supabase", () => {
    expect(SOURCE).not.toMatch(/supabase/i);
  });
  it("does not use fetch/rpc/insert/update/delete/upsert/functions", () => {
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SOURCE).not.toMatch(/\.rpc\s*\(/);
    expect(SOURCE).not.toMatch(/\.insert\s*\(/);
    expect(SOURCE).not.toMatch(/\.update\s*\(/);
    expect(SOURCE).not.toMatch(/\.delete\s*\(/);
    expect(SOURCE).not.toMatch(/\.upsert\s*\(/);
    expect(SOURCE).not.toMatch(/\.functions\b/);
  });
  it("does not import TentCsvImportCard or PREVIEW_PERSISTENCE_ENABLED", () => {
    expect(SOURCE).not.toMatch(/TentCsvImportCard/);
    expect(SOURCE).not.toMatch(/PREVIEW_PERSISTENCE_ENABLED/);
  });
});

// ----------------- Spider Farmer full -----------------

describe("Spider Farmer — primary full fixture", () => {
  const r = buildRegistryCsvInsertRows(baseArgs("spider_farmer", SPIDER_FULL));

  it("is not blocked and produces rows", () => {
    expect(r.blocked).toBe(false);
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("emits four canonical metrics when numeric (PPFD detected but NOT imported)", () => {
    const metrics = new Set(r.rows.map((x) => x.metric));
    for (const m of [
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
    ] as const) {
      expect(metrics.has(m)).toBe(true);
    }
    // PPFD is detected by the Spider Farmer mapping but must NOT be
    // emitted as a sensor_readings row in this release.
    expect(metrics.has("ppfd" as never)).toBe(false);
    for (const row of r.rows) {
      expect(row.metric).not.toBe("ppfd");
    }
  });

  it("imported row count excludes PPFD (4 metrics × accepted rows ceiling)", () => {
    const accepted = r.acceptedRowCount;
    // Every accepted row contributes at most 4 metric rows in this release.
    expect(r.rows.length).toBeLessThanOrEqual(accepted * 4);
  });

  it("prefers raw °C over °F conversion when both are present", () => {
    const tempRow = r.rows.find((x) => x.metric === "temperature_c");
    // First fixture row: temperature(°C)=24.6, temperature(°F)=76.3.
    expect(tempRow?.value).toBeCloseTo(24.6, 5);
    // Both should be preserved in raw_payload.
    expect(tempRow?.raw_payload.temperature_c_original).toBeCloseTo(24.6, 5);
    expect(tempRow?.raw_payload.temperature_f_original).toBeCloseTo(76.3, 5);
  });

  it("does not double-emit temperature (one temperature_c per accepted row)", () => {
    const byTs = new Map<string, number>();
    for (const row of r.rows) {
      if (row.metric !== "temperature_c") continue;
      byTs.set(row.captured_at, (byTs.get(row.captured_at) ?? 0) + 1);
    }
    for (const c of byTs.values()) expect(c).toBe(1);
  });

  it("preserves source_app, csv_import, batch id, row index, and provenance", () => {
    const first = r.rows[0];
    expect(first.raw_payload.source_app).toBe("spider_farmer");
    expect(first.raw_payload.csv_import).toBe(true);
    expect(first.raw_payload.import_batch_id).toBe("batch-1");
    expect(typeof first.raw_payload.row_index).toBe("number");
    expect(first.raw_payload.device_serial).toBe("80F1B2B8091C");
    expect(first.raw_payload.raw_row).toBeDefined();
  });

  it("uses canonical source = 'csv' and quality = 'ok' on every row", () => {
    for (const row of r.rows) {
      expect(row.source).toBe(ADAPTER_CANONICAL_SOURCE);
      expect(row.source).toBe("csv");
      expect(row.quality).toBe("ok");
    }
  });

  it("preserves historical timestamps (ISO-8601 UTC)", () => {
    const ts = r.rows[0].captured_at;
    expect(ts).toMatch(/^2026-/);
    expect(() => new Date(ts).toISOString()).not.toThrow();
  });
});

// ----------------- Spider Farmer sparse -----------------

describe("Spider Farmer — sparse fixture (mostly blank co2/ppfd)", () => {
  const r = buildRegistryCsvInsertRows(
    baseArgs("spider_farmer", SPIDER_SPARSE),
  );

  it("emits temperature_c, humidity_pct, vpd_kpa rows", () => {
    const metrics = new Set(r.rows.map((x) => x.metric));
    expect(metrics.has("temperature_c")).toBe(true);
    expect(metrics.has("humidity_pct")).toBe(true);
    expect(metrics.has("vpd_kpa")).toBe(true);
  });

  it("co2_ppm and ppfd row counts are much smaller than core metrics (sparse)", () => {
    const counts: Record<string, number> = {};
    for (const row of r.rows) counts[row.metric] = (counts[row.metric] ?? 0) + 1;
    expect(counts.temperature_c).toBeGreaterThan(1000);
    // Real fixture has ~189 numeric co2/ppfd cells across 5673 rows.
    expect(counts.co2_ppm ?? 0).toBeLessThan(counts.temperature_c / 5);
    expect(counts.ppfd ?? 0).toBeLessThan(counts.temperature_c / 5);
  });
});

// ----------------- Spider Farmer °F→°C fallback -----------------

describe("Spider Farmer — °F→°C conversion when °C missing", () => {
  // Synthetic fixture mirroring Spider Farmer headers but with no °C cell.
  const onlyF = [
    "deviceSerialnum,temperature(°C),humidity,vpd,temperature(°F),co2,Timestamp,ppfd",
    "AAA,,55,1.0,77,800,2026-05-31 19:00:00,400",
  ].join("\n");
  const r = buildRegistryCsvInsertRows(baseArgs("spider_farmer", onlyF));

  it("converts °F to °C correctly", () => {
    const t = r.rows.find((x) => x.metric === "temperature_c");
    expect(t?.value).toBeCloseTo((77 - 32) * 5 / 9, 5);
    expect(t?.raw_payload.temperature_f_original).toBeCloseTo(77, 5);
    expect(t?.raw_payload.temperature_c_original).toBeUndefined();
  });
});

// ----------------- Spider Farmer sensor-only -----------------

describe("Spider Farmer — sensor-only fixture", () => {
  const r = buildRegistryCsvInsertRows(
    baseArgs("spider_farmer", SPIDER_SENSOR_ONLY),
  );

  it("emits zero insert rows (metric cells are empty)", () => {
    expect(r.rows).toHaveLength(0);
    expect(r.acceptedRowCount).toBe(0);
    expect(r.rejectedRowCount).toBeGreaterThan(0);
    expect(r.rejectionReasons.empty_metrics ?? 0).toBeGreaterThan(0);
  });
});

// ----------------- Vivosun -----------------

describe("Vivosun fixture", () => {
  const r = buildRegistryCsvInsertRows(baseArgs("vivosun", VIVOSUN));

  it("emits Probe temperature/humidity/vpd as canonical rows", () => {
    const first = r.rows.find((x) => x.captured_at.startsWith("2026-05-18T"));
    expect(first).toBeDefined();
    const sameTs = r.rows.filter((x) => x.captured_at === first!.captured_at);
    const metrics = new Set(sameTs.map((x) => x.metric));
    expect(metrics.has("temperature_c")).toBe(true);
    expect(metrics.has("humidity_pct")).toBe(true);
    expect(metrics.has("vpd_kpa")).toBe(true);
    // Probe Temperature(°F) = 82.2 → °C ≈ 27.888…
    const t = sameTs.find((x) => x.metric === "temperature_c")!;
    expect(t.value).toBeCloseTo((82.2 - 32) * 5 / 9, 3);
    // Probe Humidity = 61 (NOT Built-in 58).
    const h = sameTs.find((x) => x.metric === "humidity_pct")!;
    expect(h.value).toBe(61);
  });

  it("does NOT emit co2_ppm when Probe CO2(PPM) is '-'", () => {
    const co2Rows = r.rows.filter((x) => x.metric === "co2_ppm");
    expect(co2Rows).toHaveLength(0);
  });

  it("preserves Built-in metrics in raw_payload.built_in (not as canonical rows)", () => {
    const first = r.rows[0];
    expect(first.raw_payload.built_in).toBeDefined();
    expect(first.raw_payload.built_in?.temperature_f).toBeCloseTo(87.1, 3);
    expect(first.raw_payload.built_in?.humidity_pct).toBe(58);
  });

  it("emits source_app = 'vivosun' in raw_payload", () => {
    expect(r.rows[0].raw_payload.source_app).toBe("vivosun");
  });

  it("every row has source = 'csv' and quality = 'ok'", () => {
    for (const row of r.rows) {
      expect(row.source).toBe("csv");
      expect(row.quality).toBe("ok");
    }
  });

  it("preserves historical timestamps", () => {
    expect(r.rows[0].captured_at).toMatch(/^2026-05-18T/);
  });
});

// ----------------- Unknown source -----------------

describe("Unknown source app", () => {
  const r = buildRegistryCsvInsertRows(
    baseArgs("unknown_source_app", "foo,bar\n1,2\n"),
  );

  it("returns blocked with zero rows", () => {
    expect(r.blocked).toBe(true);
    expect(r.blockedReason).toBe("unknown_source_app");
    expect(r.rows).toHaveLength(0);
  });
});

// ----------------- Guards -----------------

describe("guards", () => {
  it("throws when tentId is missing", () => {
    expect(() =>
      buildRegistryCsvInsertRows({
        tentId: "",
        sourceApp: "spider_farmer",
        importBatchId: "b",
        csvText: SPIDER_FULL,
      }),
    ).toThrow();
  });

  it("never adds top-level grow_id (sensor_readings has no such column)", () => {
    const r = buildRegistryCsvInsertRows(baseArgs("spider_farmer", SPIDER_FULL));
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows.slice(0, 5)) {
      expect(row).not.toHaveProperty("grow_id");
      expect(row).not.toHaveProperty("plant_id");
    }
  });

  it("preserves growId as provenance inside raw_payload only", () => {
    const withGrow = buildRegistryCsvInsertRows(
      baseArgs("spider_farmer", SPIDER_FULL),
    );
    expect(withGrow.rows[0].raw_payload.grow_id).toBe("grow-1");

    const withoutGrow = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "b",
      csvText: SPIDER_FULL,
    });
    expect(withoutGrow.rows[0].raw_payload.grow_id).toBeUndefined();
  });
});

