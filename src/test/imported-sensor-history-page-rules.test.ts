import { describe, expect, it } from "vitest";
import {
  IMPORTED_SENSOR_HISTORY_PAGE_SIZE,
  buildImportedSensorHistoryPageSummary,
  formatImportedSensorHistoryObservation,
  normalizeImportedSensorHistorySelection,
  prepareImportedSensorHistoryObservationRows,
  type ImportedSensorHistorySelection,
} from "../lib/importedSensorHistoryPageRules";

describe("canonical imported observation rows", () => {
  it("removes ingestion-time fallback without mutating timestamps or stored values", () => {
    const input = [{ captured_at: null, ts: "2026-10-24T12:00:00Z", value: 24 }];
    expect(prepareImportedSensorHistoryObservationRows(input)).toEqual([{ captured_at: null, ts: null, value: 24 }]);
    expect(input[0].ts).toBe("2026-10-24T12:00:00Z");
  });
  it("handles absent rows without inventing observations", () => {
    expect(prepareImportedSensorHistoryObservationRows(null)).toEqual([]);
    expect(prepareImportedSensorHistoryObservationRows(undefined)).toEqual([]);
  });
});

describe("normalizeImportedSensorHistorySelection", () => {
  it.each([undefined, null, {}])("keeps omitted date bounds open: %s", (input) => {
    expect(normalizeImportedSensorHistorySelection(input)).toEqual({
      selection: { fromDate: "", throughDate: "", page: 0 },
      startAt: null,
      endBefore: null,
      error: null,
      offset: 0,
    });
  });

  it("maps an inclusive UTC date range to an exclusive next-day end", () => {
    expect(
      normalizeImportedSensorHistorySelection({
        fromDate: "2026-09-23",
        throughDate: "2026-10-24",
        page: 2,
      }),
    ).toEqual({
      selection: { fromDate: "2026-09-23", throughDate: "2026-10-24", page: 2 },
      startAt: "2026-09-23T00:00:00.000Z",
      endBefore: "2026-10-25T00:00:00.000Z",
      error: null,
      offset: 100,
    });
  });

  it.each([
    ["2024-02-29", "2024-03-01T00:00:00.000Z"],
    ["2026-12-31", "2027-01-01T00:00:00.000Z"],
    ["0099-12-31", "0100-01-01T00:00:00.000Z"],
    ["9998-12-31", "9999-01-01T00:00:00.000Z"],
  ])("includes the entire valid Through day %s", (throughDate, endBefore) => {
    expect(normalizeImportedSensorHistorySelection({ throughDate })).toMatchObject({
      startAt: null,
      endBefore,
      error: null,
    });
  });

  it("preserves the first supported year instead of Date.UTC's 1900 adjustment", () => {
    expect(normalizeImportedSensorHistorySelection({ fromDate: "0001-01-01" })).toMatchObject({
      startAt: "0001-01-01T00:00:00.000Z",
      endBefore: null,
      error: null,
    });
  });

  it.each([
    "2026-02-29",
    "2024-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-9-23",
    "2026-09-3",
    " 2026-09-23",
    "2026-09-23 ",
    "2026-09-23T00:00:00Z",
    "09/23/2026",
    "0000-01-01",
    "9999-01-01",
    "10000-01-01",
    "invalid",
    " ",
  ])("fails closed on an invalid From or Through date: %s", (invalid) => {
    for (const key of ["fromDate", "throughDate"] as const) {
      const result = normalizeImportedSensorHistorySelection({ [key]: invalid });
      expect(result.error).toMatch(/valid/);
      expect(result.startAt).toBeNull();
      expect(result.endBefore).toBeNull();
      expect(result.selection[key]).toBe(invalid);
    }
  });

  it.each([null, 42, false, [], {}])("rejects supplied non-string date bounds: %s", (invalid) => {
    for (const key of ["fromDate", "throughDate"] as const) {
      const input = { [key]: invalid } as unknown as Partial<ImportedSensorHistorySelection>;
      expect(normalizeImportedSensorHistorySelection(input)).toMatchObject({
        startAt: null,
        endBefore: null,
        error: expect.stringMatching(/valid/),
      });
    }
  });

  it("rejects a reversed range and does not expose either query bound", () => {
    expect(
      normalizeImportedSensorHistorySelection({ fromDate: "2026-10-24", throughDate: "2026-09-23" }),
    ).toMatchObject({
      startAt: null,
      endBefore: null,
      error: "From date must be on or before Through date.",
    });
  });

  it("accepts the same From and Through date", () => {
    expect(
      normalizeImportedSensorHistorySelection({ fromDate: "2026-10-24", throughDate: "2026-10-24" }),
    ).toMatchObject({
      startAt: "2026-10-24T00:00:00.000Z",
      endBefore: "2026-10-25T00:00:00.000Z",
      error: null,
    });
  });

  it.each([NaN, Infinity, -Infinity, -1, -0.1, Number.MAX_SAFE_INTEGER + 1])(
    "resets invalid page %s to zero",
    (page) => {
      expect(normalizeImportedSensorHistorySelection({ page })).toMatchObject({
        selection: { page: 0 },
        offset: 0,
      });
    },
  );

  it("floors a finite fractional page", () => {
    expect(normalizeImportedSensorHistorySelection({ page: 2.9 })).toMatchObject({
      selection: { page: 2 },
      offset: 100,
    });
  });

  it("bounds offsets and the final inclusive row index within safe integers", () => {
    const result = normalizeImportedSensorHistorySelection({ page: Number.MAX_SAFE_INTEGER });
    const maxPage = Math.floor(
      (Number.MAX_SAFE_INTEGER - (IMPORTED_SENSOR_HISTORY_PAGE_SIZE - 1)) /
        IMPORTED_SENSOR_HISTORY_PAGE_SIZE,
    );
    expect(result.selection.page).toBe(maxPage);
    expect(Number.isSafeInteger(result.offset)).toBe(true);
    expect(Number.isSafeInteger(result.offset + IMPORTED_SENSOR_HISTORY_PAGE_SIZE - 1)).toBe(true);
  });

  it("is deterministic and does not mutate selection input", () => {
    const input = Object.freeze({ fromDate: "2024-02-29", throughDate: "2024-02-29", page: 1 });
    expect(normalizeImportedSensorHistorySelection(input)).toEqual(
      normalizeImportedSensorHistorySelection(input),
    );
    expect(input).toEqual({ fromDate: "2024-02-29", throughDate: "2024-02-29", page: 1 });
  });
});

describe("buildImportedSensorHistoryPageSummary", () => {
  it("defines a bounded fifty-metric-row page", () => {
    expect(IMPORTED_SENSOR_HISTORY_PAGE_SIZE).toBe(50);
  });

  it.each([0, 1, 100])("makes no row or navigation claims for zero total at page %s", (page) => {
    expect(buildImportedSensorHistoryPageSummary(0, page)).toEqual({
      pageCount: 0,
      firstRow: 0,
      lastRow: 0,
      hasNewer: false,
      hasOlder: false,
      lastPage: 0,
    });
  });

  it.each([1, 49, 50])("handles a single page with %s rows", (total) => {
    expect(buildImportedSensorHistoryPageSummary(total, 0)).toEqual({
      pageCount: 1,
      firstRow: 1,
      lastRow: total,
      hasNewer: false,
      hasOlder: false,
      lastPage: 0,
    });
  });

  it("reports a full first page with evidence that older rows exist", () => {
    expect(buildImportedSensorHistoryPageSummary(51, 0)).toEqual({
      pageCount: 2,
      firstRow: 1,
      lastRow: 50,
      hasNewer: false,
      hasOlder: true,
      lastPage: 1,
    });
  });

  it("reports a middle page in a large five-metric import", () => {
    expect(buildImportedSensorHistoryPageSummary(33_655, 336)).toEqual({
      pageCount: 674,
      firstRow: 16_801,
      lastRow: 16_850,
      hasNewer: true,
      hasOlder: true,
      lastPage: 673,
    });
  });

  it("reports the earliest five rows on the last page of a large import", () => {
    expect(buildImportedSensorHistoryPageSummary(33_655, 673)).toEqual({
      pageCount: 674,
      firstRow: 33_651,
      lastRow: 33_655,
      hasNewer: true,
      hasOlder: false,
      lastPage: 673,
    });
  });

  it("does not advertise another page for an exact full final page", () => {
    expect(buildImportedSensorHistoryPageSummary(100, 1)).toMatchObject({
      firstRow: 51,
      lastRow: 100,
      hasNewer: true,
      hasOlder: false,
      lastPage: 1,
    });
  });

  it("allows recovery from an out-of-range page without inventing displayed rows", () => {
    expect(buildImportedSensorHistoryPageSummary(51, 99)).toEqual({
      pageCount: 2,
      firstRow: 0,
      lastRow: 0,
      hasNewer: true,
      hasOlder: false,
      lastPage: 1,
    });
  });

  it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an unverified or invalid total %s instead of claiming empty history",
    (total) => {
      expect(() => buildImportedSensorHistoryPageSummary(total, 0)).toThrow(/total/);
    },
  );

  it("normalizes invalid and fractional page input consistently", () => {
    expect(buildImportedSensorHistoryPageSummary(200, NaN)).toEqual(
      buildImportedSensorHistoryPageSummary(200, 0),
    );
    expect(buildImportedSensorHistoryPageSummary(200, 1.9)).toEqual(
      buildImportedSensorHistoryPageSummary(200, 1),
    );
  });

  it("returns the same summary repeatedly", () => {
    expect(buildImportedSensorHistoryPageSummary(33_655, 336)).toEqual(
      buildImportedSensorHistoryPageSummary(33_655, 336),
    );
  });
});

describe("formatImportedSensorHistoryObservation", () => {
  it.each([
    ["2026-09-23T00:00:00Z", "2026-09-23 00:00:00.000 UTC"],
    ["2026-09-23T00:00:00-05:00", "2026-09-23 05:00:00.000 UTC"],
    ["2026-10-24T23:59:59.123+02:00", "2026-10-24 21:59:59.123 UTC"],
    ["0001-01-01T00:00:00.000Z", "0001-01-01 00:00:00.000 UTC"],
  ])("formats %s with an explicit UTC label", (timestamp, expected) => {
    expect(formatImportedSensorHistoryObservation(timestamp)).toBe(expected);
    expect(formatImportedSensorHistoryObservation(timestamp)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "invalid",
    "2026-09-23",
    "2026-09-23T00:00:00",
    "2026-02-30T00:00:00Z",
    "2026-10-24T25:00:00Z",
    "2026-10-24T00:00:00+99:00",
  ])("makes no observation-time claim for %s", (timestamp) => {
    expect(formatImportedSensorHistoryObservation(timestamp)).toBe("Unknown observation time");
  });
});
