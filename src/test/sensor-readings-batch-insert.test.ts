import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CSV_HISTORY_INSERT_BATCH_SIZE,
  SENSOR_READINGS_INSERT_ALLOWED_KEYS,
  chunkRows,
  insertSensorReadingsInBatches,
  buildBatchFailureMessage,
  buildBatchSuccessMessage,
  validateSensorReadingInsertRows,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

describe("sensorReadingsBatchInsert", () => {
  it("default batch size is 500", () => {
    expect(CSV_HISTORY_INSERT_BATCH_SIZE).toBe(500);
  });

  it("chunkRows splits arrays into N-sized batches", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 100)).toEqual([]);
    expect(chunkRows([1], 100)).toEqual([[1]]);
  });

  it("splits a large Spider Farmer-sized payload (17133 rows) into batches and inserts each", async () => {
    const rows = Array.from({ length: 17133 }, (_, i) => ({ i }));
    const calls: number[] = [];
    const insertBatch = vi.fn(async (batch: unknown[], idx: number) => {
      calls.push(batch.length);
      expect(batch.length).toBeLessThanOrEqual(CSV_HISTORY_INSERT_BATCH_SIZE);
      expect(idx).toBe(calls.length);
      return { error: null };
    });
    const result = await insertSensorReadingsInBatches({
      rows,
      vendorLabel: "Spider Farmer / THP Data",
      insertBatch,
    });
    expect(result.ok).toBe(true);
    expect(result.totalRows).toBe(17133);
    expect(result.totalBatches).toBe(Math.ceil(17133 / 500));
    expect(result.insertedRows).toBe(17133);
    expect(insertBatch).toHaveBeenCalledTimes(result.totalBatches);
    expect(calls.reduce((a, b) => a + b, 0)).toBe(17133);
    expect(result.diagnostic).toMatch(/Spider Farmer/);
  });

  it("reports failed batch number and Supabase error message/code/hint", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ i }));
    const insertBatch = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: {
          message: "duplicate key value violates unique constraint",
          code: "23505",
          hint: "Check captured_at",
          details: null,
        },
      });
    const result = await insertSensorReadingsInBatches({
      rows,
      vendorLabel: "Spider Farmer",
      insertBatch,
    });
    expect(result.ok).toBe(false);
    expect(result.failedBatchIndex).toBe(2);
    expect(result.partialWrite).toBe(true);
    expect(result.insertedRows).toBe(500);
    expect(result.diagnostic).toContain("batch 2 of 3");
    expect(result.diagnostic).toContain("Spider Farmer");
    expect(result.diagnostic).toContain("duplicate key value violates unique constraint");
    expect(result.diagnostic).toContain("[code: 23505]");
    expect(result.diagnostic).toContain("Hint: Check captured_at");
    expect(result.diagnostic).toContain("No live sensor data was created");
    expect(result.diagnostic).toContain("500 readings from earlier batches");
    // The 3rd batch never runs after a failure.
    expect(insertBatch).toHaveBeenCalledTimes(2);
  });

  it("does not mention partial writes when the very first batch fails", async () => {
    const rows = Array.from({ length: 800 }, (_, i) => ({ i }));
    const insertBatch = vi.fn().mockResolvedValueOnce({
      error: { message: "permission denied", code: "42501" },
    });
    const result = await insertSensorReadingsInBatches({
      rows,
      vendorLabel: "Spider Farmer",
      insertBatch,
    });
    expect(result.ok).toBe(false);
    expect(result.partialWrite).toBe(false);
    expect(result.insertedRows).toBe(0);
    expect(result.diagnostic).not.toContain("earlier batches");
  });

  it("success diagnostic stays simple for a single-batch import", () => {
    expect(
      buildBatchSuccessMessage({
        totalRows: 42,
        totalBatches: 1,
        vendorLabel: "Spider Farmer / THP Data",
      }),
    ).toBe("Imported 42 Spider Farmer / THP Data CSV history readings.");
  });

  it("failure diagnostic copy never names AC Infinity when vendor is Spider Farmer", () => {
    const msg = buildBatchFailureMessage({
      batchIndex: 5,
      totalBatches: 18,
      failedBatchSize: 500,
      insertedRows: 2000,
      error: { message: "boom" },
      vendorLabel: "Spider Farmer / THP Data",
    });
    expect(msg).toContain("Spider Farmer");
    expect(msg).not.toMatch(/AC Infinity/i);
  });
});

describe("sensorReadingsBatchInsert static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/csv-import/sensorReadingsBatchInsert.ts"),
    "utf8",
  );
  for (const needle of [
    "device control",
    "automation",
    "action_queue",
    "alerts",
    "service_role",
    "bridge token",
    'source: "live"',
    "supabase.from",
    ".upload(",
    "functions.invoke",
  ]) {
    it(`source does not contain forbidden token: ${needle}`, () => {
      expect(src).not.toContain(needle);
    });
  }
});

describe("validateSensorReadingInsertRows — preflight payload shape", () => {
  const validRow = {
    captured_at: "2026-06-01T00:00:00Z",
    metric: "temperature",
    value: 24.5,
    source: "csv",
    tent_id: "t-1",
    quality: "ok",
    raw_payload: { source_app: "spider_farmer", grow_id: "g-1" },
  };

  it("empty rows return ok no-op", () => {
    const r = validateSensorReadingInsertRows([]);
    expect(r.ok).toBe(true);
    expect(r.unknownKeys).toEqual([]);
    expect(r.rowIndexes).toEqual([]);
    expect(r.message).toBeNull();
  });

  it("Spider-Farmer-shaped row with nested raw_payload.grow_id passes", () => {
    const r = validateSensorReadingInsertRows([validRow]);
    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });

  it("AC-Infinity-shaped row passes", () => {
    const r = validateSensorReadingInsertRows([
      {
        captured_at: "2026-06-01T00:00:00Z",
        metric: "humidity",
        value: 50,
        source: "csv",
        tent_id: "t-1",
        raw_payload: { source_app: "ac_infinity" },
      },
    ]);
    expect(r.ok).toBe(true);
  });

  it("top-level grow_id fails with operator-facing message", () => {
    const r = validateSensorReadingInsertRows([
      { ...validRow, grow_id: "g-1" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.unknownKeys).toEqual(["grow_id"]);
    expect(r.rowIndexes).toEqual([0]);
    expect(r.message).toContain("grow_id");
    expect(r.message).toContain("No rows were written.");
    expect(r.message).toContain("No live sensor data was created.");
  });

  it("top-level plant_id fails", () => {
    const r = validateSensorReadingInsertRows([
      { ...validRow, plant_id: "p-1" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.unknownKeys).toEqual(["plant_id"]);
  });

  it("multiple unknown keys are sorted and deduped", () => {
    const r = validateSensorReadingInsertRows([
      { ...validRow, plant_id: "p", grow_id: "g" },
      { ...validRow, grow_id: "g", source_app: "x" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.unknownKeys).toEqual(["grow_id", "plant_id", "source_app"]);
    expect(r.rowIndexes).toEqual([0, 1]);
  });

  it("limits row indexes to first 3 + overflow hint", () => {
    const rows = Array.from({ length: 6 }, () => ({ ...validRow, grow_id: "g" }));
    const r = validateSensorReadingInsertRows(rows);
    expect(r.ok).toBe(false);
    expect(r.rowIndexes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.message).toMatch(/0, 1, 2 \(\+3 more\)/);
  });

  it("allowed key list matches the documented sensor_readings.Insert shape", () => {
    expect([...SENSOR_READINGS_INSERT_ALLOWED_KEYS].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("indexHint uses 'Affected rows:' phrasing", () => {
    const r = validateSensorReadingInsertRows([
      { metric: "t", value: 1, captured_at: "x", source: "csv", tent_id: "t", grow_id: "g" },
    ]);
    expect(r.message).toContain("Affected rows: 0");
  });
});

describe("preflightCsvHistoryImport — composite import gate", () => {
  const validRow = {
    captured_at: "2026-06-01T00:00:00Z",
    metric: "temperature",
    value: 24.5,
    source: "csv",
    tent_id: "t-1",
    raw_payload: { source_app: "spider_farmer", grow_id: "g-1" },
  };

  it("empty rows → blocked with exact operator copy", () => {
    const r = preflightCsvHistoryImport([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty");
    expect(r.message).toBe(CSV_HISTORY_EMPTY_ROWS_COPY);
    expect(r.message).toContain("No importable sensor readings were found.");
    expect(r.message).toContain("No rows were written.");
    expect(r.message).toContain("No live sensor data was created.");
  });

  it("valid rows pass through", () => {
    const r = preflightCsvHistoryImport([validRow]);
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.message).toBeNull();
  });

  it("unsupported grow_id → blocked with key + no-write reassurance", () => {
    const r = preflightCsvHistoryImport([{ ...validRow, grow_id: "g" }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unsupported_fields");
    expect(r.message).toContain("Import blocked before writing rows.");
    expect(r.message).toContain("Unsupported sensor_readings field(s): grow_id");
    expect(r.message).toContain("No rows were written. No live sensor data was created.");
  });

  it("unsupported plant_id → blocked", () => {
    const r = preflightCsvHistoryImport([{ ...validRow, plant_id: "p" }]);
    expect(r.ok).toBe(false);
    expect(r.unknownKeys).toEqual(["plant_id"]);
  });

  it("mixed valid + invalid rows aborts the whole import (no partial pass)", () => {
    const r = preflightCsvHistoryImport([
      validRow,
      { ...validRow, grow_id: "g" },
      validRow,
    ]);
    expect(r.ok).toBe(false);
    expect(r.rowIndexes).toEqual([1]);
    expect(r.unknownKeys).toEqual(["grow_id"]);
  });
});

describe("CSV history import orchestration — no-write proof", () => {
  /**
   * Mirrors TentCsvImportCard's submit composition:
   *   preflightCsvHistoryImport(rows) -> insertSensorReadingsInBatches(rows)
   * If the preflight blocks, insertSensorReadingsInBatches MUST NOT run.
   */
  async function runImport(rows: Array<Record<string, unknown>>) {
    const insertBatch = vi.fn(async () => ({ error: null }));
    const preflight = preflightCsvHistoryImport(rows);
    if (!preflight.ok) {
      return { blocked: true, message: preflight.message, insertBatch };
    }
    await insertSensorReadingsInBatches({
      rows,
      vendorLabel: "Spider Farmer",
      insertBatch,
    });
    return { blocked: false, message: null, insertBatch };
  }

  it("empty rows abort before any Supabase insert", async () => {
    const r = await runImport([]);
    expect(r.blocked).toBe(true);
    expect(r.message).toBe(CSV_HISTORY_EMPTY_ROWS_COPY);
    expect(r.insertBatch).not.toHaveBeenCalled();
  });

  it("unsupported grow_id aborts before any Supabase insert", async () => {
    const r = await runImport([
      { captured_at: "t", metric: "temperature", value: 1, source: "csv", tent_id: "t", grow_id: "g" },
    ]);
    expect(r.blocked).toBe(true);
    expect(r.message).toContain("grow_id");
    expect(r.message).toContain("No rows were written. No live sensor data was created.");
    expect(r.insertBatch).not.toHaveBeenCalled();
  });

  it("unsupported plant_id aborts before any Supabase insert", async () => {
    const r = await runImport([
      { captured_at: "t", metric: "temperature", value: 1, source: "csv", tent_id: "t", plant_id: "p" },
    ]);
    expect(r.blocked).toBe(true);
    expect(r.insertBatch).not.toHaveBeenCalled();
  });

  it("mixed rows abort entirely — even valid rows do not reach insert", async () => {
    const valid = { captured_at: "t", metric: "temperature", value: 1, source: "csv", tent_id: "t" };
    const r = await runImport([valid, { ...valid, grow_id: "g" }, valid]);
    expect(r.blocked).toBe(true);
    expect(r.insertBatch).not.toHaveBeenCalled();
  });

  it("valid rows still reach batch insert", async () => {
    const valid = { captured_at: "t", metric: "temperature", value: 1, source: "csv", tent_id: "t" };
    const r = await runImport([valid, valid]);
    expect(r.blocked).toBe(false);
    expect(r.insertBatch).toHaveBeenCalledTimes(1);
  });
});
