/**
 * csv-history-insert-row-shape — regression test for the Spider Farmer /
 * THP CSV history import failure where batches were rejected with
 * PostgREST PGRST204 because the insert payload carried a top-level
 * `grow_id`, which `public.sensor_readings` does not define.
 *
 * Source of truth for allowed insert keys is the generated Supabase types
 * file. This test fails loudly the next time a CSV row builder strays
 * outside that allowlist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { buildRegistryCsvInsertRows } from "@/lib/registryCsvInsertRowsAdapter";
import {
  buildCsvInsertRows,
  parseCsv,
  normalizeAcInfinityRows,
  planColumns,
} from "@/lib/csvSensorImportRules";
import { insertSensorReadingsInBatches } from "@/lib/csv-import/sensorReadingsBatchInsert";

const ROOT = resolve(__dirname, "..", "..");
const SPIDER_FIXTURE = readFileSync(
  resolve(ROOT, "fixtures/sensor-csv/spider_farmer_primary_full_20260612214443.csv"),
  "utf8",
);


// Allow-list mirrors public.sensor_readings.Insert in
// src/integrations/supabase/types.ts.
const ALLOWED_INSERT_KEYS = new Set([
  "captured_at",
  "created_at",
  "device_id",
  "id",
  "metric",
  "quality",
  "raw_payload",
  "source",
  "tent_id",
  "ts",
  "user_id",
  "value",
]);

const FORBIDDEN_TOP_LEVEL_KEYS = ["grow_id", "plant_id"] as const;

function assertShape(row: Record<string, unknown>, label: string) {
  for (const k of Object.keys(row)) {
    expect(
      ALLOWED_INSERT_KEYS.has(k),
      `${label}: unknown sensor_readings column "${k}" (PGRST204 risk)`,
    ).toBe(true);
  }
  for (const k of FORBIDDEN_TOP_LEVEL_KEYS) {
    expect(row, `${label}: must not include top-level ${k}`).not.toHaveProperty(k);
  }
}

describe("CSV history insert rows — sensor_readings schema shape", () => {
  it("Spider Farmer registry rows stay within the allowed insert keys", () => {
    const result = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      growId: "grow-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-1",
      csvText: SPIDER_FIXTURE,
    });
    expect(result.blocked).toBe(false);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows.slice(0, 25)) {
      assertShape(row as unknown as Record<string, unknown>, "spider_farmer");
    }
  });

  it("Spider Farmer rows stay source = 'csv' (never live/manual/demo)", () => {
    const result = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-1",
      csvText: SPIDER_FIXTURE,
    });
    for (const row of result.rows) {
      expect(row.source).toBe("csv");
      expect(row.raw_payload.source_app).toBe("spider_farmer");
    }
  });

  it("AC Infinity legacy rows stay within the allowed insert keys", () => {
    const parsed = parseCsv(
      [
        "Timestamp,Temperature (°F),Humidity (%)",
        "2026-05-26 14:00:00,77,50",
      ].join("\n"),
    );
    const normalized = normalizeAcInfinityRows(parsed, planColumns(parsed.headers));
    const rows = buildCsvInsertRows({
      tentId: "t1",
      growId: "g1",
      sourceApp: "ac_infinity",
      importBatchId: "batch-1",
      rows: normalized.rows,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      assertShape(row as unknown as Record<string, unknown>, "ac_infinity");
    }
  });

  it("insertSensorReadingsInBatches sends rows without grow_id", async () => {
    const result = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      growId: "grow-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-1",
      csvText: SPIDER_FIXTURE,
    });
    const observed: Array<Record<string, unknown>> = [];
    await insertSensorReadingsInBatches({
      rows: result.rows,
      vendorLabel: "Spider Farmer",
      batchSize: 500,
      insertBatch: async (batch) => {
        for (const row of batch as unknown as Array<Record<string, unknown>>) {
          observed.push(row);
        }
        return { error: null };
      },
    });
    expect(observed.length).toBe(result.rows.length);
    for (const row of observed.slice(0, 25)) {
      expect(row).not.toHaveProperty("grow_id");
      expect(row).not.toHaveProperty("plant_id");
    }
  });

  it("surfaces PostgREST PGRST204 unknown-column failure in diagnostics", async () => {
    const result = buildRegistryCsvInsertRows({
      tentId: "tent-1",
      sourceApp: "spider_farmer",
      importBatchId: "batch-1",
      csvText: SPIDER_FIXTURE,
    });
    const batchResult = await insertSensorReadingsInBatches({
      rows: result.rows,
      vendorLabel: "Spider Farmer",
      batchSize: 500,
      insertBatch: async () => ({
        error: {
          message:
            "Could not find the 'grow_id' column of 'sensor_readings' in the schema cache",
          code: "PGRST204",
        },
      }),
    });
    expect(batchResult.ok).toBe(false);
    expect(batchResult.failedBatchIndex).toBe(1);
    expect(batchResult.partialWrite).toBe(false);
    expect(batchResult.diagnostic).toContain("PGRST204");
    expect(batchResult.diagnostic).toContain("grow_id");
    expect(batchResult.diagnostic).not.toMatch(
      /earlier batches may already have been written/,
    );
  });
});

describe("CSV history insert row builders — static safety surface", () => {
  const FILES = [
    "src/lib/registryCsvInsertRowsAdapter.ts",
    "src/lib/csvSensorImportRules.ts",
  ];
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of FILES) {
    const code = stripComments(readFileSync(resolve(ROOT, rel), "utf8"));
    describe(rel, () => {
      it("does not promote rows to source = 'live'", () => {
        expect(code).not.toMatch(/source:\s*["']live["']/);
      });
      it("does not contain device control / automation / write hooks", () => {
        for (const needle of [
          'from("action_queue")',
          'from("alerts")',
          "device control",
          "deviceControl",
          "automation",
          "service_role",
          "bridge_token",
          "functions.invoke",
        ]) {
          expect(code, `${rel} should not contain ${needle}`).not.toContain(needle);
        }
      });
    });
  }
});

