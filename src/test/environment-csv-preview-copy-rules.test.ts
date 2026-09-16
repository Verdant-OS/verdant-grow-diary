import { describe, expect, it } from "vitest";
import {
  CSV_IMPORT_DESCRIPTION,
  CSV_IMPORT_READING_COPY,
  formatCsvPreviewRow,
  buildCsvImportFailureMessage,
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
  const shared = /Matching CSV history was detected/;
  const retryHint = /retrying the same file may encounter the same conflict/i;
  const noLive = /No live sensor data was created/;

  it.each([
    {
      label: "zero visible matches",
      args: [0, false, false, "unverified_duplicate"] as const,
      expectSaved: /No new CSV readings were saved in this attempt/,
      expectUncertain: null,
    },
    {
      label: "confirmed partial batch",
      args: [3, true, false, "unverified_duplicate"] as const,
      expectSaved: /3 CSV readings confirmed saved/,
      expectUncertain: null,
    },
    {
      label: "singular confirmed save",
      args: [1, true, false, "unverified_duplicate"] as const,
      expectSaved: /1 CSV reading confirmed saved/,
      expectUncertain: null,
    },
    {
      label: "partial write without a confirmed count",
      args: [0, true, false, "unverified_duplicate"] as const,
      expectSaved: /Earlier CSV readings may already have been saved/,
      expectUncertain: null,
    },
    {
      label: "lost acknowledgement before conflict",
      args: [0, false, true, "unverified_duplicate"] as const,
      expectSaved: /Import stopped/,
      expectUncertain: /couldn't confirm whether any CSV readings were saved/,
    },
    {
      label: "lost acknowledgement after partial save",
      args: [2, true, true, "unverified_duplicate"] as const,
      expectSaved: /2 CSV readings confirmed saved/,
      expectUncertain: /couldn't confirm whether the remaining CSV readings were saved/,
    },
  ])("$label", ({ args, expectSaved, expectUncertain }) => {
    const [insertedCount, partialWrite, unconfirmedWrite, failureReason] = args;
    const copy = buildCsvImportFailureMessage(
      insertedCount,
      partialWrite,
      unconfirmedWrite,
      failureReason,
    );
    expect(copy).toMatch(shared);
    expect(copy).toMatch(retryHint);
    expect(copy).toMatch(noLive);
    expect(copy).toMatch(expectSaved);
    if (expectUncertain) expect(copy).toMatch(expectUncertain);
    expect(copy).not.toMatch(/Try again\.|violates unique constraint|23505/i);
  });

  it("requires failureReason to reach hidden-history copy (mutation guard)", () => {
    const withoutReason = buildCsvImportFailureMessage(0, false, false);
    const withReason = buildCsvImportFailureMessage(0, false, false, "unverified_duplicate");
    expect(withoutReason).toMatch(/No CSV readings were saved/);
    expect(withReason).toMatch(/Matching CSV history was detected/);
    expect(withoutReason).not.toMatch(/Matching CSV history was detected/);
  });
});
