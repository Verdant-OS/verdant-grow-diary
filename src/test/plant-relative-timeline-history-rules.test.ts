import { describe, expect, it } from "vitest";
import {
  buildPlantHistoryPage,
  buildPlantHistoryReadView,
  collectPlantHistoryRows,
  plantHistoryCursorFilter,
} from "@/lib/plantRelativeTimelineHistoryRules";

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  plant_id: "plant-1",
  entry_at: "2026-09-16T12:00:00.123456+00:00",
  ...overrides,
});

describe("plant history pagination rules", () => {
  it("keeps the DB timestamp's microseconds and ID in its boundary", () => {
    const page = buildPlantHistoryPage(
      Array.from({ length: 11 }, (_, i) => row(11 - i)),
      12,
      "plant-1",
    );
    expect(page.rows).toHaveLength(10);
    expect(page.totalCount).toBe(12);
    expect(plantHistoryCursorFilter(page.nextCursor!)).toBe(
      'entry_at.lt."2026-09-16T12:00:00.123456+00:00",and(entry_at.eq."2026-09-16T12:00:00.123456+00:00",id.lt."00000000-0000-0000-0000-000000000002")',
    );
  });
  it.each([0, 1, 10])("finishes a %i-row result without a fabricated continuation", (count) => {
    const page = buildPlantHistoryPage(
      Array.from({ length: count }, (_, i) => row(i)),
      count,
      "plant-1",
    );
    expect(page.nextCursor).toBeNull();
    expect(page.boundaryUnavailable).toBe(false);
    expect(page.rows).toHaveLength(count);
  });
  it.each([null, undefined, "12", -1, 1.5, Number.NaN, 0])(
    "keeps malformed or contradictory count %s unknown",
    (count) => {
      expect(buildPlantHistoryPage([row(1)], count, "plant-1").totalCount).toBeNull();
    },
  );
  it.each([null, undefined, {}, [null], [row(1, { plant_id: "other" })]])(
    "rejects malformed/wrong-plant page %s",
    (data) => {
      expect(() => buildPlantHistoryPage(data, 1, "plant-1")).toThrow(/unavailable/);
    },
  );
  it.each([null, "not-a-date", '2026-09-16T12:00:00Z",plant_id.eq.other'])(
    "retains rows but blocks an unsafe timestamp boundary %s",
    (entry_at) => {
      const data = Array.from({ length: 11 }, (_, i) => row(i, { entry_at }));
      const page = buildPlantHistoryPage(data, 12, "plant-1");
      expect(page.rows).toHaveLength(10);
      expect(page.boundaryUnavailable).toBe(true);
      expect(page.nextCursor).toBeNull();
    },
  );
  it("rejects cursor ID filter injection", () => {
    expect(() =>
      plantHistoryCursorFilter({ entryAt: row(1).entry_at, id: 'x"),plant_id.eq.other' }),
    ).toThrow(/boundary/);
  });
  it("deduplicates pages by diary identity, without discarding malformed rows", () => {
    const first = buildPlantHistoryPage([row(2), row(1)], 3, "plant-1");
    const next = buildPlantHistoryPage([row(1), row(0), row(3, { id: null })], null, "plant-1");
    expect(collectPlantHistoryRows([first, next])).toHaveLength(4);
    expect(collectPlantHistoryRows(null)).toEqual([]);
  });
  it("is deterministic without mutating its input", () => {
    const rows = Array.from({ length: 11 }, (_, i) => Object.freeze(row(i)));
    Object.freeze(rows);
    expect(buildPlantHistoryPage(rows, 12, "plant-1")).toEqual(
      buildPlantHistoryPage(rows, 12, "plant-1"),
    );
  });
});

describe("plant history count and read truth", () => {
  it("uses the server total independently from projection and filter counts", () => {
    const view = buildPlantHistoryReadView(
      { data: [row(1), row(2)], totalCount: 12, hasNextPage: true },
      "plant-1",
      1,
      0,
    );
    expect(view.countLabel).toBe("Showing 2 of 12 timeline entries");
    expect(view.printCountLabel).toBe("Visible entries: 0 from 2 loaded diary entries; 12 total.");
    expect(view.invalidRowsNotice).toBe("1 loaded diary entry could not be displayed.");
    expect(view.showLoadMore).toBe(true);
  });
  it("keeps absent totals unknown even when rows are available", () => {
    const view = buildPlantHistoryReadView({ data: [row(1)], totalCount: null }, "plant-1", 1);
    expect(view.countLabel).toMatch(/1 loaded.*total not verified/);
    expect(view.totalCount).toBeNull();
    expect(view.complete).toBe(false);
  });
  it("only calls a verified successful zero empty", () => {
    expect(buildPlantHistoryReadView({ data: [], totalCount: 0 }, "plant-1").showEmpty).toBe(true);
    expect(buildPlantHistoryReadView({ data: [], totalCount: null }, "plant-1").showEmpty).toBe(
      false,
    );
    expect(buildPlantHistoryReadView({ data: [], totalCount: 0 }, null).showEmpty).toBe(false);
  });
  it.each([
    { isPending: true, fetchStatus: "paused" as const },
    { isPending: true, fetchStatus: "fetching" as const },
    { isError: true },
  ])("does not mislabel unresolved/failed reads as empty: %s", (state) => {
    const view = buildPlantHistoryReadView(state, "plant-1");
    expect(view.showEmpty).toBe(false);
    expect(view.showHeader).toBe(false);
    expect(view.notice).not.toBeNull();
  });
  it("marks cached totals and retains retry after a failed older read", () => {
    const view = buildPlantHistoryReadView(
      {
        data: [row(1)],
        totalCount: 12,
        isError: true,
        isFetchNextPageError: true,
        hasNextPage: true,
      },
      "plant-1",
      1,
    );
    expect(view.countLabel).toContain("12 total at last successful read");
    expect(view.retryOlder).toBe(true);
    expect(view.canRetry).toBe(true);
    expect(view.showLoadMore).toBe(false);
  });
  it("does not retain the projection's default 50-row history limit", () => {
    expect(
      buildPlantHistoryReadView(
        { data: Array.from({ length: 61 }, (_, i) => row(i)), totalCount: 61 },
        "plant-1",
        61,
      ).projectionLimit,
    ).toBe(61);
  });
  it("treats an exhausted cursor with a larger total as incomplete", () => {
    const view = buildPlantHistoryReadView({ data: [row(1)], totalCount: 12 }, "plant-1", 1);
    expect(view.complete).toBe(false);
    expect(view.canRetry).toBe(true);
    expect(view.notice).toMatch(/could not be reached/);
  });
});
