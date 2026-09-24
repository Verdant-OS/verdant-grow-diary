import { describe, expect, it, vi } from "vitest";
import { collectCsvSensorPresenceKeys } from "@/lib/csvSensorPresenceService";
import {
  dedupeKeyOf,
  runDuplicateAwareCsvHistoryImport,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

const history = Array.from({ length: 10000 }, (_, index) => ({
  tent_id: "tent-a",
  source: "csv",
  metric: "temperature_c",
  captured_at: new Date(Date.parse("2026-01-01T00:00:00Z") + index * 60000).toISOString(),
}));

describe("CSV presence pagination", () => {
  it("reconciles sparse duplicates beyond the first server page without writes", async () => {
    const insertBatch = vi.fn(async () => ({ error: null }));
    const result = await runDuplicateAwareCsvHistoryImport({
      rows: [history[1000], history[5000], history[9000]],
      vendorLabel: "environment",
      insertBatch,
      fetchExistingKeys: async (scope) => {
        const visible = history.filter(
          (r) => r.captured_at >= scope.minCapturedAt && r.captured_at <= scope.maxCapturedAt,
        );
        return collectCsvSensorPresenceKeys(
          async (from, to) => visible.slice(from, to + 1),
          () => true,
        );
      },
    });
    expect(result).toMatchObject({
      ok: true,
      insertedRows: 0,
      duplicateRows: 3,
      allDuplicates: true,
    });
    expect(insertBatch).not.toHaveBeenCalled();
  });
  it("continues through short server-capped pages until an empty page", async () => {
    const rows = history.slice(0, 7);
    const readPage = vi.fn(async (from: number) => rows.slice(from, from + 2));
    expect(await collectCsvSensorPresenceKeys(readPage, () => true)).toEqual(
      new Set(rows.map((r) => dedupeKeyOf(r)!)),
    );
    expect(readPage.mock.calls.map((args) => args[0])).toEqual([0, 2, 4, 6, 7]);
  });
  it("does not read after cancellation and discards earlier identity-owned pages", async () => {
    let active = true;
    const readPage = vi.fn(async () => {
      active = false;
      return history.slice(0, 2);
    });
    expect(await collectCsvSensorPresenceKeys(readPage, () => active)).toEqual(new Set());
    expect(readPage).toHaveBeenCalledTimes(1);
  });
  it("propagates a later read failure instead of returning an incomplete successful lookup", async () => {
    const failure = new Error("read failed");
    const readPage = vi
      .fn()
      .mockResolvedValueOnce(history.slice(0, 2))
      .mockRejectedValueOnce(failure);
    await expect(collectCsvSensorPresenceKeys(readPage, () => true)).rejects.toBe(failure);
  });
  it("stops if a server ignores the range", async () => {
    const readPage = vi.fn(async () => history.slice(0, 2));
    await expect(collectCsvSensorPresenceKeys(readPage, () => true)).rejects.toThrow(
      "did not advance",
    );
    expect(readPage).toHaveBeenCalledTimes(2);
  });
});
