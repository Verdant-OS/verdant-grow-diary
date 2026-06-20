import { describe, expect, it } from "vitest";
import {
  CSV_IMPORT_DESCRIPTION,
  CSV_IMPORT_READING_COPY,
  formatCsvPreviewRow,
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
