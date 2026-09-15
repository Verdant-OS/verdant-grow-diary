import { describe, expect, it } from "vitest";
import {
  CSV_IMPORT_DESCRIPTION,
  CSV_IMPORT_READING_COPY,
  formatCsvPreviewRow,
  buildCsvImportFailureMessage,
  mergeCsvImportFailureReceipts,
} from "@/lib/environmentCsvPreviewCopyRules";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";

function row(over: Partial<ParsedEnvironmentRow> = {}): ParsedEnvironmentRow {
  return {
    rowNumber: 1,
    captured_at: "2026-05-31T19:00:00.000Z",
    temperature_c: 25.7,
    humidity_pct: 52.4,
    vpd_kpa: 1.57,
    co2_ppm: 775,
    ppfd: 925,
    raw_temperature: 25.7,
    raw_temp_unit: "C",
    raw_payload: {},
    vpd_source: "csv",
    source_tag: "csv",
    ...over,
  };
}

describe("environmentCsvPreviewCopyRules", () => {
  it("uses hardware-neutral import description", () => {
    expect(CSV_IMPORT_DESCRIPTION).toContain("Spider Farmer");
    expect(CSV_IMPORT_DESCRIPTION).toContain("AC Infinity");
    expect(CSV_IMPORT_DESCRIPTION).toContain("historical CSV context");
  });

  it("uses hardware-neutral parsing copy", () => {
    expect(CSV_IMPORT_READING_COPY).toBe("Reading your environment export…");
  });

  it("formats Spider Farmer preview rows with CO2 and PPFD", () => {
    const copy = formatCsvPreviewRow(row());
    expect(copy).toContain("25.7°C");
    expect(copy).toContain("52%");
    expect(copy).toContain("1.57 kPa VPD");
    expect(copy).toContain("775 ppm CO₂");
    expect(copy).toContain("925 PPFD");
  });

  it("omits optional metrics when missing", () => {
    const copy = formatCsvPreviewRow(row({ vpd_kpa: null, co2_ppm: null, ppfd: null }));
    expect(copy).toContain("25.7°C");
    expect(copy).toContain("52%");
    expect(copy).not.toContain("VPD");
    expect(copy).not.toContain("ppm CO₂");
    expect(copy).not.toContain("PPFD");
  });
});

describe("mergeCsvImportFailureReceipts", () => {
  it("accumulates confirmed inserts across retries without dropping uncertainty", () => {
    const first = mergeCsvImportFailureReceipts(null, {
      insertedCount: 2,
      partialWrite: true,
      unconfirmedWrite: true,
    });
    expect(first).toEqual({
      insertedCount: 2,
      partialWrite: true,
      unconfirmedWrite: true,
    });

    const second = mergeCsvImportFailureReceipts(first, {
      insertedCount: 0,
      partialWrite: false,
    });
    expect(second.insertedCount).toBe(2);
    expect(second.partialWrite).toBe(true);
    expect(second.unconfirmedWrite).toBe(true);
  });

  it("adds later acknowledged inserts to the running lower bound", () => {
    const merged = mergeCsvImportFailureReceipts(
      { insertedCount: 1, partialWrite: true, unconfirmedWrite: true },
      { insertedCount: 3, partialWrite: true },
    );
    expect(merged.insertedCount).toBe(4);
    expect(merged.partialWrite).toBe(true);
    expect(merged.unconfirmedWrite).toBe(true);
  });

  it("does not clear unconfirmedWrite when a later retry reports a definite zero-save failure", () => {
    const merged = mergeCsvImportFailureReceipts(
      { insertedCount: 0, unconfirmedWrite: true },
      { insertedCount: 0, partialWrite: false },
    );
    expect(merged.unconfirmedWrite).toBe(true);
    expect(merged.insertedCount).toBe(0);
    expect(merged.partialWrite).toBe(false);
  });
});

describe("unconfirmed CSV import copy", () => {
  it("does not claim zero saves when no batch was acknowledged", () => {
    const copy = buildCsvImportFailureMessage(0, false, true);
    expect(copy).toMatch(/couldn.t confirm|unconfirmed/i);
    expect(copy).toMatch(/review imported history before retrying/i);
    expect(copy).not.toMatch(/No CSV readings were saved/);
  });

  it("states the confirmed lower bound without treating it as the total", () => {
    const copy = buildCsvImportFailureMessage(2, true, true);
    expect(copy).toMatch(/2 .*confirmed/i);
    expect(copy).toMatch(/couldn.t confirm|unconfirmed/i);
    expect(copy).not.toMatch(/stopped after|No CSV readings were saved/i);
  });
});
