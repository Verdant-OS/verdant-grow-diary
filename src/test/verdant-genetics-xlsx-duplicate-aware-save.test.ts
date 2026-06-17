/**
 * XLSX sensor history import — duplicate-aware save path.
 *
 * Drives the `runDuplicateAwareCsvHistoryImport` orchestration against
 * stubbed `fetchExistingKeys` / `insertBatch` adapters to verify:
 *
 *  - Duplicate-only XLSX import resolves as success/no-op (no "Save
 *    failed"), with inserted=0 and duplicate count = totalRows.
 *  - Mixed new + duplicate import inserts only new rows and reports both
 *    counts.
 *  - Real DB failure still fails with a safe diagnostic that never
 *    claims live telemetry was created.
 *  - Empty result is a safe no-op (never "Imported 0 new ...").
 *
 * Pure orchestration only. No supabase imports, no AI, no Action Queue,
 * no alerts, no device control.
 */
import { describe, it, expect, vi } from "vitest";

import {
  CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY,
  dedupeKeyOf,
  runDuplicateAwareCsvHistoryImport,
  type BatchInsertError,
  type DedupeKeyParts,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

interface Row extends DedupeKeyParts {
  value: number;
  raw_payload: { source_app: "verdant_genetics_xlsx" };
}

function buildRows(n: number): Row[] {
  const startMs = Date.parse("2026-06-04T03:00:00Z");
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      tent_id: "tent-a",
      source: "csv",
      metric: "temperature_c",
      captured_at: new Date(startMs + i * 60_000).toISOString(),
      value: 70 + (i % 5),
      raw_payload: { source_app: "verdant_genetics_xlsx" },
    });
  }
  return out;
}

describe("XLSX sensor history import — duplicate handling", () => {
  it("fully duplicate XLSX import is a successful no-op (not 'Save failed')", async () => {
    const rows = buildRows(2266);
    const existing = new Set(rows.map((r) => dedupeKeyOf(r)!).filter(Boolean));
    const insertBatch = vi.fn(async () => ({
      error: null as BatchInsertError | null,
    }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      fetchExistingKeys: async () => existing,
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.allDuplicates).toBe(true);
    expect(out.insertedRows).toBe(0);
    expect(out.duplicateRows).toBe(2266);
    expect(out.totalRows).toBe(2266);
    expect(insertBatch).not.toHaveBeenCalled();
    // Never the "Save failed" copy and never live-telemetry claims.
    expect(out.diagnostic).not.toMatch(/save failed/i);
    expect(out.diagnostic).toMatch(/already exist for this tent/i);
    expect(out.diagnostic).toMatch(/no live sensor data/i);
  });

  it("mixed import inserts new rows and skips duplicates", async () => {
    const rows = buildRows(10);
    // Mark first 6 rows as already present.
    const existing = new Set(
      rows.slice(0, 6).map((r) => dedupeKeyOf(r)!).filter(Boolean),
    );
    const insertedBatches: Row[][] = [];
    const insertBatch = vi.fn(async (batch: Row[]) => {
      insertedBatches.push(batch);
      return { error: null as BatchInsertError | null };
    });
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      fetchExistingKeys: async () => existing,
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(4);
    expect(out.duplicateRows).toBe(6);
    expect(out.totalRows).toBe(10);
    expect(insertedBatches.flat()).toHaveLength(4);
    expect(out.diagnostic).toMatch(/Imported 4 new/i);
    expect(out.diagnostic).toMatch(/Skipped 6 duplicate/i);
    expect(out.diagnostic).toMatch(/no live sensor data/i);
  });

  it("real DB failure surfaces a safe diagnostic and reports !ok", async () => {
    const rows = buildRows(3);
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      fetchExistingKeys: async () => new Set<string>(),
      insertBatch: async () => ({
        error: {
          code: "08006",
          message: "connection terminated",
        } as BatchInsertError,
      }),
    });
    expect(out.ok).toBe(false);
    expect(out.insertedRows).toBe(0);
    expect(out.error?.code).toBe("08006");
    expect(out.diagnostic).toMatch(/Import failed/i);
    expect(out.diagnostic).toMatch(/no live sensor data/i);
  });

  it("dedupe-conflict 23505 from a follow-on batch still does not fabricate live telemetry", async () => {
    const rows = buildRows(3);
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      fetchExistingKeys: async () => new Set<string>(),
      insertBatch: async () => ({
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
        } as BatchInsertError,
      }),
    });
    expect(out.ok).toBe(false);
    expect(out.diagnostic).toMatch(/already exist for this tent/i);
    expect(out.diagnostic).toMatch(/no live sensor data/i);
  });

  it("empty input never emits the misleading 'Imported 0 new' line", async () => {
    const out = await runDuplicateAwareCsvHistoryImport({
      rows: [] as Row[],
      vendorLabel: "Verdant Genetics XLSX",
      fetchExistingKeys: async () => new Set<string>(),
      insertBatch: async () => ({ error: null }),
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(0);
    expect(out.duplicateRows).toBe(0);
    expect(out.diagnostic).toBe(CSV_HISTORY_NO_ROWS_SAFE_FALLBACK_COPY);
  });
});
