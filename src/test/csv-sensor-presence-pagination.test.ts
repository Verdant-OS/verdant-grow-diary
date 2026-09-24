import { describe, expect, it, vi } from "vitest";
import {
  collectCsvSensorPresenceKeys,
  CSV_PRESENCE_PAGE_SIZE,
} from "@/lib/csvSensorPresenceService";
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
  it("returns an empty set when the first page is empty", async () => {
    const readPage = vi.fn(async () => []);
    expect(await collectCsvSensorPresenceKeys(readPage, () => true)).toEqual(new Set());
    expect(readPage).toHaveBeenCalledTimes(1);
  });
  it("throws when a presence row cannot form a dedupe key", async () => {
    const readPage = vi.fn(async () => [
      { tent_id: "", source: "csv", metric: "temperature_c", captured_at: "2026-01-01T00:00:00Z" },
    ]);
    await expect(collectCsvSensorPresenceKeys(readPage, () => true)).rejects.toThrow(
      "Invalid CSV presence row",
    );
  });
  it("discards partial keys when cancelled after the first page", async () => {
    let page = 0;
    let active = true;
    const readPage = vi.fn(async (from: number) => {
      page += 1;
      if (page === 2) active = false;
      return history.slice(from, from + 2);
    });
    expect(await collectCsvSensorPresenceKeys(readPage, () => active)).toEqual(new Set());
    expect(readPage).toHaveBeenCalledTimes(2);
  });
  it("requests full CSV_PRESENCE_PAGE_SIZE windows until an empty page", async () => {
    const readPage = vi.fn(async (from: number, to: number) => {
      expect(to - from + 1).toBe(CSV_PRESENCE_PAGE_SIZE);
      if (from >= history.length) return [];
      return history.slice(from, from + CSV_PRESENCE_PAGE_SIZE);
    });
    const keys = await collectCsvSensorPresenceKeys(readPage, () => true);
    expect(keys.size).toBe(history.length);
    const expectedOffsets = Array.from(
      { length: history.length / CSV_PRESENCE_PAGE_SIZE + 1 },
      (_, index) => index * CSV_PRESENCE_PAGE_SIZE,
    );
    expect(readPage.mock.calls.map((args) => args[0])).toEqual(expectedOffsets);
    expect(readPage.mock.calls.at(-1)).toEqual([
      history.length,
      history.length + CSV_PRESENCE_PAGE_SIZE - 1,
    ]);
  });
});
