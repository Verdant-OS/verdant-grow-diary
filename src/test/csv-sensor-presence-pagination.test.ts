import { describe, expect, it, vi } from "vitest";
import {
  collectCandidateCsvSensorPresenceKeys,
  collectCsvSensorPresenceKeys,
  CSV_PRESENCE_PAGE_SIZE,
  CSV_PRESENCE_TIMESTAMP_BATCH_SIZE,
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

describe("CSV candidate timestamp lookup", () => {
  it("returns an empty set without querying when every timestamp is invalid", async () => {
    const readPage = vi.fn(async () => []);
    expect(
      await collectCandidateCsvSensorPresenceKeys(
        [null, undefined, "invalid", "   "],
        readPage,
        () => true,
      ),
    ).toEqual(new Set());
    expect(readPage).not.toHaveBeenCalled();
  });

  it("returns an empty set when ownership ends before the first timestamp batch", async () => {
    const readPage = vi.fn(async () => history.slice(0, 1));
    expect(
      await collectCandidateCsvSensorPresenceKeys([history[0].captured_at], readPage, () => false),
    ).toEqual(new Set());
    expect(readPage).not.toHaveBeenCalled();
  });

  it("discards keys from earlier timestamp batches when ownership ends mid-import", async () => {
    const rows = history.slice(0, CSV_PRESENCE_TIMESTAMP_BATCH_SIZE + 1);
    let active = true;
    const readPage = vi.fn(async (batch: readonly string[], from: number, to: number) => {
      const page = rows.filter((row) => batch.includes(row.captured_at)).slice(from, to + 1);
      if (batch.includes(rows.at(-1)!.captured_at) && page.length > 0) active = false;
      return page;
    });
    expect(
      await collectCandidateCsvSensorPresenceKeys(
        rows.map((row) => row.captured_at),
        readPage,
        () => active,
      ),
    ).toEqual(new Set());
    expect(readPage.mock.calls.length).toBeGreaterThan(0);
  });

  it("reads only sparse candidate timestamps while honoring smaller server pages", async () => {
    const candidates = [history[1000], history[5000], history[9000]];
    const timestamps = candidates.map((row) => row.captured_at);
    const readPage = vi.fn(async (batch: readonly string[], from: number) =>
      history.filter((row) => batch.includes(row.captured_at)).slice(from, from + 2),
    );
    expect(await collectCandidateCsvSensorPresenceKeys(timestamps, readPage, () => true)).toEqual(
      new Set(candidates.map((row) => dedupeKeyOf(row)!)),
    );
    expect(readPage.mock.calls.map((call) => call[1])).toEqual([0, 2, 3]);
    for (const [batch] of readPage.mock.calls) expect(batch).toEqual(timestamps);
  });

  it("bounds timestamp batches and normalizes equivalent timestamps without mutating input", async () => {
    const rows = history.slice(0, CSV_PRESENCE_TIMESTAMP_BATCH_SIZE * 2 + 3);
    const input = [
      ...rows.map((row) => row.captured_at).reverse(),
      "2026-01-01T01:00:00+01:00",
      null,
      undefined,
      "invalid",
    ];
    const original = [...input];
    const readPage = vi.fn(async (batch: readonly string[], from: number, to: number) =>
      rows.filter((row) => batch.includes(row.captured_at)).slice(from, to + 1),
    );
    expect(await collectCandidateCsvSensorPresenceKeys(input, readPage, () => true)).toEqual(
      new Set(rows.map((row) => dedupeKeyOf(row)!)),
    );
    const firstPages = readPage.mock.calls.filter((call) => call[1] === 0);
    expect(firstPages.map((call) => call[0].length)).toEqual([100, 100, 3]);
    expect(firstPages.flatMap((call) => [...call[0]])).toEqual(rows.map((row) => row.captured_at));
    expect(readPage).toHaveBeenCalledTimes(6);
    expect(input).toEqual(original);
  });

  it("discards completed batches if ownership changes during a later timestamp batch", async () => {
    const rows = history.slice(0, CSV_PRESENCE_TIMESTAMP_BATCH_SIZE + 1);
    let active = true;
    const readPage = vi.fn(async (batch: readonly string[], from: number, to: number) => {
      if (batch.includes(rows.at(-1)!.captured_at)) active = false;
      return rows.filter((row) => batch.includes(row.captured_at)).slice(from, to + 1);
    });
    expect(
      await collectCandidateCsvSensorPresenceKeys(
        rows.map((row) => row.captured_at),
        readPage,
        () => active,
      ),
    ).toEqual(new Set());
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("propagates a later timestamp-batch failure without returning earlier keys", async () => {
    const rows = history.slice(0, CSV_PRESENCE_TIMESTAMP_BATCH_SIZE + 1);
    const failure = new Error("second timestamp batch failed");
    const readPage = vi.fn(async (batch: readonly string[], from: number, to: number) => {
      if (batch.includes(rows.at(-1)!.captured_at)) throw failure;
      return rows.filter((row) => batch.includes(row.captured_at)).slice(from, to + 1);
    });
    await expect(
      collectCandidateCsvSensorPresenceKeys(
        rows.map((row) => row.captured_at),
        readPage,
        () => true,
      ),
    ).rejects.toBe(failure);
  });
});

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

  it("reconciles sparse duplicates via candidate timestamp lookup like production", async () => {
    const candidates = [history[1000], history[5000], history[9000]];
    const insertBatch = vi.fn(async () => ({ error: null }));
    const readPage = vi.fn(async (batch: readonly string[], from: number) =>
      history.filter((row) => batch.includes(row.captured_at)).slice(from, from + 2),
    );
    const result = await runDuplicateAwareCsvHistoryImport({
      rows: candidates,
      vendorLabel: "environment",
      insertBatch,
      fetchExistingKeys: async () =>
        collectCandidateCsvSensorPresenceKeys(
          candidates.map((row) => row.captured_at),
          readPage,
          () => true,
        ),
    });
    expect(result).toMatchObject({
      ok: true,
      insertedRows: 0,
      duplicateRows: 3,
      allDuplicates: true,
    });
    expect(insertBatch).not.toHaveBeenCalled();
    expect(readPage.mock.calls.every(([batch]) => batch.length === 3)).toBe(true);
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
