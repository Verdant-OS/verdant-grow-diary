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

  it("states a large confirmed lower bound without claiming the import finished", () => {
    const copy = buildCsvImportFailureMessage(1000, true, true);
    expect(copy).toContain("1000 CSV readings confirmed saved.");
    expect(copy).toContain("couldn't confirm whether the remaining CSV readings were saved.");
    expect(copy).not.toMatch(/No CSV readings were saved/);
    expect(copy).toContain("No live sensor data was created");
  });
});

describe("mergeCsvImportFailureReceipts", () => {
  it("accumulates confirmed counts across retries without dropping uncertainty", () => {
    const first = mergeCsvImportFailureReceipts(null, {
      insertedCount: 1000,
      partialWrite: true,
      unconfirmedWrite: true,
    });
    expect(first).toEqual({
      insertedCount: 1000,
      partialWrite: true,
      unconfirmedWrite: true,
    });

    const second = mergeCsvImportFailureReceipts(first, {
      insertedCount: 0,
      partialWrite: false,
    });
    expect(second).toEqual({
      insertedCount: 1000,
      partialWrite: true,
      unconfirmedWrite: true,
    });
    expect(
      buildCsvImportFailureMessage(
        second.insertedCount,
        second.partialWrite === true,
        second.unconfirmedWrite === true,
        "unverified_duplicate",
      ),
    ).toContain("1000 CSV readings confirmed saved.");
  });

  it("never clears a prior unconfirmed write on a later zero-save retry", () => {
    const merged = mergeCsvImportFailureReceipts(
      { insertedCount: 500, partialWrite: true, unconfirmedWrite: true },
      { insertedCount: 0, partialWrite: false, unconfirmedWrite: false },
    );
    expect(merged.unconfirmedWrite).toBe(true);
    expect(merged.insertedCount).toBe(500);
  });

  it("treats any confirmed rows as a partial write for retry copy", () => {
    expect(
      mergeCsvImportFailureReceipts(null, { insertedCount: 1, partialWrite: false }).partialWrite,
    ).toBe(true);
  });
});

describe("hidden-history duplicate conflict copy", () => {
  it("explains an unresolved duplicate without exposing database diagnostics", () => {
    const copy = buildCsvImportFailureMessage(0, false, false, "unverified_duplicate");
    expect(copy).toContain("Matching CSV history was detected");
    expect(copy).toContain("couldn't verify all matching readings in your current history view");
    expect(copy).toContain("No new CSV readings were saved in this attempt");
    expect(copy).not.toMatch(/23505|sensor_readings_dedupe_uidx|upgrade|90.day/i);
  });

  it("keeps confirmed batches visible when a later batch hits an unresolved duplicate", () => {
    const copy = buildCsvImportFailureMessage(3, true, false, "unverified_duplicate");
    expect(copy).toContain("3 CSV readings confirmed saved.");
    expect(copy).toContain("Matching CSV history was detected");
    expect(copy).not.toContain("No new CSV readings were saved in this attempt");
  });

  it("combines confirmed batches with an uncertain tail beyond the read cap", () => {
    const copy = buildCsvImportFailureMessage(1000, true, true, "unverified_duplicate");
    expect(copy).toContain("1000 CSV readings confirmed saved.");
    expect(copy).toContain("couldn't confirm whether the remaining CSV readings were saved.");
    expect(copy).toContain("Matching CSV history was detected");
    expect(copy).not.toMatch(/No CSV readings were saved/);
  });
});
