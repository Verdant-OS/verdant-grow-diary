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
  it("accumulates confirmed inserts across retries", () => {
    expect(
      mergeCsvImportFailureReceipts(
        { insertedCount: 2, partialWrite: true },
        { insertedCount: 3, partialWrite: false },
      ),
    ).toEqual({ insertedCount: 5, partialWrite: true, unconfirmedWrite: false });
  });

  it("preserves unconfirmedWrite once any attempt lost confirmation", () => {
    expect(
      mergeCsvImportFailureReceipts(
        { insertedCount: 1, unconfirmedWrite: true },
        { insertedCount: 0, partialWrite: false, unconfirmedWrite: false },
      ),
    ).toEqual({ insertedCount: 1, partialWrite: true, unconfirmedWrite: true });
  });
});

describe("unverified duplicate CSV import copy", () => {
  it("explains hidden history conflicts without claiming a clean zero-save outcome", () => {
    const copy = buildCsvImportFailureMessage(0, false, false, "unverified_duplicate");
    expect(copy).toMatch(/couldn't verify all matching readings/i);
    expect(copy).toMatch(/outside that view/i);
    expect(copy).toMatch(/No live sensor data was created/);
  });

  it("states the confirmed lower bound when some rows saved before the conflict", () => {
    const copy = buildCsvImportFailureMessage(4, true, true, "unverified_duplicate");
    expect(copy).toMatch(/4 .*confirmed saved/i);
    expect(copy).toMatch(/couldn't confirm whether the remaining/i);
    expect(copy).toMatch(/retrying the same file may encounter the same conflict/i);
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
