import { describe, it, expect } from "vitest";
import {
  INITIAL_IMPORT_STATE,
  applyUnitChoice,
  buildCoveragePreview,
  cancelImport,
  reduceParseResult,
  rowsToPersist,
  startParsingState,
} from "@/lib/environmentCsvImportViewModel";
import { parseEnvironmentCSVText } from "@/lib/csvParser";

describe("environmentCsvImportViewModel", () => {
  it("starts parsing then transitions to preview on clean parse", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n";
    const parsed = parseEnvironmentCSVText(csv);
    const next = reduceParseResult(startParsingState(), parsed);
    expect(next.phase).toBe("preview");
    expect(next.parsed?.validRows).toHaveLength(1);
  });

  it("transitions to unit_confirm when ambiguous", () => {
    const csv = "Timestamp,Temperature,RH\n2026-06-01T10:00:00Z,25,50\n";
    const parsed = parseEnvironmentCSVText(csv);
    const next = reduceParseResult(startParsingState(), parsed);
    expect(next.phase).toBe("unit_confirm");
    const afterUnit = applyUnitChoice(next, "F");
    expect(afterUnit.phase).toBe("preview");
    expect(afterUnit.parsed!.isAmbiguous).toBe(false);
  });

  it("reduces errors into error phase", () => {
    const next = reduceParseResult(startParsingState(), {
      validRows: [],
      skippedRows: [],
      dateRange: null,
      isAmbiguous: false,
      detectedColumns: {
        timestamp: null,
        date: null,
        time: null,
        temperature: null,
        humidity: null,
        vpd: null,
        co2: null,
        ppfd: null,
      },
      errors: [{ code: "empty_file", message: "x" }],
    });
    expect(next.phase).toBe("error");
    expect(next.errorCode).toBe("empty_file");
  });

  it("cancel resets to initial", () => {
    expect(cancelImport()).toEqual(INITIAL_IMPORT_STATE);
  });

  it("coverage preview reports days and partial banner", () => {
    const csv =
      "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n2026-06-03T10:00:00Z,25,50\nbad,25,50\n";
    const parsed = parseEnvironmentCSVText(csv);
    const cov = buildCoveragePreview(parsed);
    expect(cov.validRows).toBe(2);
    expect(cov.skippedRows).toBe(1);
    expect(cov.daysCovered).toBeGreaterThanOrEqual(2);
    expect(cov.partialSuccess).toBe(true);
    expect(cov.partialMessage).toMatch(/Imported safely with 1 row skipped/);
  });

  it("rowsToPersist returns valid rows only", () => {
    const csv = "Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n";
    const parsed = parseEnvironmentCSVText(csv);
    expect(rowsToPersist(parsed)).toHaveLength(1);
    expect(rowsToPersist(null)).toEqual([]);
  });
});
