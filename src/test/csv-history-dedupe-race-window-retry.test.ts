/**
 * csv-history-dedupe-race-window-retry
 *
 * Exercises the short race-window 23505 recovery added to
 * insertSensorReadingsInBatches + runDuplicateAwareCsvHistoryImport.
 *
 * Hard rules under test:
 *  - A 23505 unique-violation on sensor_readings_dedupe_uidx where every
 *    failed-batch row is now present in a re-query is reclassified as
 *    skipped duplicates (NOT a hard failure).
 *  - A 23505 with rows still missing from the re-query triggers ONE
 *    retry of only the remaining-new rows.
 *  - Any conflict that cannot be proven safe preserves the original
 *    failure semantics + diagnostic copy ("Import failed... No live
 *    sensor data was created.").
 *  - Unknown DB errors (non-23505, or 23505 without the dedupe index
 *    name) never trigger recovery.
 *  - No source mutation: rows passed to insertBatch keep source = "csv".
 */
import { describe, it, expect, vi } from "vitest";
import {
  runDuplicateAwareCsvHistoryImport,
  isSensorReadingsDedupeUniqueViolation,
  type BatchInsertError,
  type DedupeKeyParts,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

interface Row extends DedupeKeyParts {
  source: "csv";
  metric: string;
  tent_id: string;
  captured_at: string;
  value: number;
}

function row(
  tent_id: string,
  metric: string,
  captured_at: string,
  value = 1,
): Row {
  return { source: "csv", tent_id, metric, captured_at, value };
}

const DEDUPE_ERROR: BatchInsertError = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
  details: "Key (user_id, tent_id, source, metric, captured_at)=(...) exists.",
  hint: null,
};

const UNRELATED_UNIQUE_ERROR: BatchInsertError = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "some_other_idx"',
  details: null,
  hint: null,
};

const UNKNOWN_ERROR: BatchInsertError = {
  code: "08006",
  message: "connection reset by peer",
  details: null,
  hint: null,
};

describe("isSensorReadingsDedupeUniqueViolation", () => {
  it("matches the deployed dedupe index", () => {
    expect(isSensorReadingsDedupeUniqueViolation(DEDUPE_ERROR)).toBe(true);
  });
  it("rejects other unique violations", () => {
    expect(isSensorReadingsDedupeUniqueViolation(UNRELATED_UNIQUE_ERROR)).toBe(
      false,
    );
  });
  it("rejects non-23505 codes", () => {
    expect(isSensorReadingsDedupeUniqueViolation(UNKNOWN_ERROR)).toBe(false);
  });
  it("rejects null/undefined", () => {
    expect(isSensorReadingsDedupeUniqueViolation(null)).toBe(false);
    expect(isSensorReadingsDedupeUniqueViolation(undefined)).toBe(false);
  });
});

describe("runDuplicateAwareCsvHistoryImport — 23505 race-window recovery", () => {
  it("reclassifies a fully-duplicate race-window conflict as skipped duplicates (no-op success)", async () => {
    const rows = [
      row("tent-a", "tempF", "2026-06-01T00:00:00.000Z"),
      row("tent-a", "tempF", "2026-06-01T01:00:00.000Z"),
    ];
    // Preflight sees no existing keys (race window).
    let fetchCall = 0;
    const fetchExistingKeys = vi.fn(async () => {
      fetchCall += 1;
      if (fetchCall === 1) return new Set<string>();
      // Re-query after the 23505 returns ALL rows present.
      return new Set(
        rows.map(
          (r) => `${r.tent_id}|${r.source}|${r.metric}|${r.captured_at}`,
        ),
      );
    });
    const insertBatch = vi.fn(async () => ({ error: DEDUPE_ERROR }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(0);
    expect(out.duplicateRows).toBe(2);
    expect(out.allDuplicates).toBe(true);
    expect(out.diagnostic).toMatch(/No new CSV history readings were imported/);
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
    // Insert was attempted once; recovery proved all-dup so no retry insert.
    expect(insertBatch).toHaveBeenCalledTimes(1);
    expect(fetchExistingKeys).toHaveBeenCalledTimes(2);
  });

  it("retries only the still-new rows on a partially-confirmed race-window conflict and reports both counts", async () => {
    const rows = [
      row("tent-a", "tempF", "2026-06-01T00:00:00.000Z"),
      row("tent-a", "tempF", "2026-06-01T01:00:00.000Z"),
      row("tent-a", "tempF", "2026-06-01T02:00:00.000Z"),
    ];
    let fetchCall = 0;
    const fetchExistingKeys = vi.fn(async () => {
      fetchCall += 1;
      if (fetchCall === 1) return new Set<string>();
      // Race window: rows[0] and rows[1] now exist; rows[2] is still new.
      return new Set([
        `tent-a|csv|tempF|2026-06-01T00:00:00.000Z`,
        `tent-a|csv|tempF|2026-06-01T01:00:00.000Z`,
      ]);
    });
    let insertCall = 0;
    const insertBatch = vi.fn(async (batch: Row[]) => {
      insertCall += 1;
      if (insertCall === 1) {
        expect(batch).toHaveLength(3);
        return { error: DEDUPE_ERROR };
      }
      // Retry only the remaining-new row.
      expect(batch).toHaveLength(1);
      expect(batch[0].captured_at).toBe("2026-06-01T02:00:00.000Z");
      expect(batch[0].source).toBe("csv");
      return { error: null };
    });
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(true);
    expect(out.insertedRows).toBe(1);
    expect(out.duplicateRows).toBe(2);
    expect(out.diagnostic).toMatch(
      /Imported 1 new .* Skipped 2 duplicate readings already present for this tent/,
    );
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
    expect(insertBatch).toHaveBeenCalledTimes(2);
  });

  it("preserves failure semantics when retry-after-recovery still fails", async () => {
    const rows = [
      row("tent-a", "tempF", "2026-06-01T00:00:00.000Z"),
      row("tent-a", "tempF", "2026-06-01T01:00:00.000Z"),
    ];
    const fetchExistingKeys = vi.fn(async () => new Set<string>());
    let insertCall = 0;
    const insertBatch = vi.fn(async () => {
      insertCall += 1;
      // Both first attempt and retry fail with the dedupe error.
      return { error: DEDUPE_ERROR };
    });
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    // Recovery cannot prove rows are present (re-query empty), so it
    // returns all rows for retry; retry fails → preserve failure.
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("23505");
    expect(out.diagnostic).toMatch(/Import stopped|Import failed/);
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
    expect(insertCall).toBe(2);
  });

  it("preserves failure semantics when refetch throws", async () => {
    const rows = [row("tent-a", "tempF", "2026-06-01T00:00:00.000Z")];
    let fetchCall = 0;
    const fetchExistingKeys = vi.fn(async () => {
      fetchCall += 1;
      if (fetchCall === 1) return new Set<string>();
      throw new Error("network blip");
    });
    const insertBatch = vi.fn(async () => ({ error: DEDUPE_ERROR }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("23505");
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
    // No retry insert because recovery returned null.
    expect(insertBatch).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger recovery for unrelated unique-violations", async () => {
    const rows = [row("tent-a", "tempF", "2026-06-01T00:00:00.000Z")];
    const fetchExistingKeys = vi.fn(async () => new Set<string>());
    const insertBatch = vi.fn(async () => ({
      error: UNRELATED_UNIQUE_ERROR,
    }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Spider Farmer",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(false);
    expect(insertBatch).toHaveBeenCalledTimes(1);
    expect(fetchExistingKeys).toHaveBeenCalledTimes(1); // only the preflight
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
  });

  it("does NOT trigger recovery for unknown DB errors (e.g. connection reset)", async () => {
    const rows = [row("tent-a", "tempF", "2026-06-01T00:00:00.000Z")];
    const fetchExistingKeys = vi.fn(async () => new Set<string>());
    const insertBatch = vi.fn(async () => ({ error: UNKNOWN_ERROR }));
    const out = await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Vivosun",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("08006");
    expect(insertBatch).toHaveBeenCalledTimes(1);
    expect(out.diagnostic).toMatch(/No live sensor data was created/);
  });

  it("never mutates source label on rows passed to insertBatch (no live/manual/demo)", async () => {
    const rows = [
      row("tent-a", "tempF", "2026-06-01T00:00:00.000Z"),
      row("tent-a", "tempF", "2026-06-01T01:00:00.000Z"),
    ];
    let fetchCall = 0;
    const fetchExistingKeys = vi.fn(async () => {
      fetchCall += 1;
      if (fetchCall === 1) return new Set<string>();
      return new Set([`tent-a|csv|tempF|2026-06-01T00:00:00.000Z`]);
    });
    const seenSources: string[] = [];
    let insertCall = 0;
    const insertBatch = vi.fn(async (batch: Row[]) => {
      insertCall += 1;
      for (const r of batch) seenSources.push(r.source);
      if (insertCall === 1) return { error: DEDUPE_ERROR };
      return { error: null };
    });
    await runDuplicateAwareCsvHistoryImport({
      rows,
      vendorLabel: "Verdant Genetics XLSX",
      batchSize: 500,
      fetchExistingKeys,
      insertBatch,
    });
    for (const s of seenSources) {
      expect(s).toBe("csv");
      expect(s).not.toBe("live");
      expect(s).not.toBe("manual");
      expect(s).not.toBe("demo");
    }
  });
});
