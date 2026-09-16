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
});

describe("unverified duplicate CSV import copy", () => {
  const shared = [
    "Matching CSV history was detected",
    "couldn't verify all matching readings in your current history view",
    "Older readings may be outside that view",
    "retrying the same file may encounter the same conflict",
    "No live sensor data was created",
  ] as const;

  it.each([
    {
      label: "zero saves, no partial write",
      insertedCount: 0,
      partialWrite: false,
      unconfirmedWrite: false,
      savedFragment: "No new CSV readings were saved in this attempt",
      uncertainFragment: null,
    },
    {
      label: "confirmed partial batch",
      insertedCount: 3,
      partialWrite: true,
      unconfirmedWrite: false,
      savedFragment: "3 CSV readings confirmed saved",
      uncertainFragment: null,
    },
    {
      label: "single confirmed save",
      insertedCount: 1,
      partialWrite: true,
      unconfirmedWrite: false,
      savedFragment: "1 CSV reading confirmed saved",
      uncertainFragment: null,
    },
    {
      label: "lost acknowledgement with no confirmed saves",
      insertedCount: 0,
      partialWrite: false,
      unconfirmedWrite: true,
      savedFragment: "Import stopped",
      uncertainFragment: "couldn't confirm whether any CSV readings were saved",
    },
    {
      label: "lost acknowledgement with some confirmed saves",
      insertedCount: 2,
      partialWrite: true,
      unconfirmedWrite: true,
      savedFragment: "2 CSV readings confirmed saved",
      uncertainFragment: "couldn't confirm whether the remaining CSV readings were saved",
    },
  ])(
    "builds grower-safe copy for $label",
    ({ insertedCount, partialWrite, unconfirmedWrite, savedFragment, uncertainFragment }) => {
      const copy = buildCsvImportFailureMessage(
        insertedCount,
        partialWrite,
        unconfirmedWrite,
        "unverified_duplicate",
      );
      for (const fragment of shared) expect(copy).toContain(fragment);
      expect(copy).toContain(savedFragment);
      if (uncertainFragment) expect(copy).toContain(uncertainFragment);
      expect(copy).not.toMatch(/23505|sensor_readings_dedupe_uidx|upgrade|90.day/i);
    },
  );

  it("does not treat unverified duplicate copy as a generic failure", () => {
    const generic = buildCsvImportFailureMessage(0, false, false);
    const unverified = buildCsvImportFailureMessage(0, false, false, "unverified_duplicate");
    expect(generic).toContain("No CSV readings were saved");
    expect(unverified).not.toContain("No CSV readings were saved. Try again.");
  });
});

describe("mergeCsvImportFailureReceipts", () => {
  it("accumulates confirmed inserts across retries", () => {
    const merged = mergeCsvImportFailureReceipts(
      { insertedCount: 3, partialWrite: true, unconfirmedWrite: true },
      { insertedCount: 0, partialWrite: false },
    );
    expect(merged).toEqual({
      insertedCount: 3,
      partialWrite: true,
      unconfirmedWrite: true,
    });
  });

  it("starts from null when the first attempt fails", () => {
    expect(
      mergeCsvImportFailureReceipts(null, { insertedCount: 0, unconfirmedWrite: true }),
    ).toEqual({
      insertedCount: 0,
      partialWrite: false,
      unconfirmedWrite: true,
    });
  });

  it("marks partialWrite when a later retry confirms additional rows", () => {
    const merged = mergeCsvImportFailureReceipts(
      { insertedCount: 0, partialWrite: false },
      { insertedCount: 2, partialWrite: true },
    );
    expect(merged.insertedCount).toBe(2);
    expect(merged.partialWrite).toBe(true);
  });
});
