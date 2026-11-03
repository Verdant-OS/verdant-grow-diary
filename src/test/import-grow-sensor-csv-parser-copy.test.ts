/**
 * Pins the import-grow-sensor-csv guide copy to parseEnvironmentCSVText.
 * Out-of-range VPD and CO₂ drop only that metric. Only a bad time,
 * temperature, or humidity skips the row. The unit prompt is the
 * 0–45 overlap, not every unclear header.
 */
import { describe, expect, it } from "vitest";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { parseEnvironmentCSVText } from "@/lib/csvParser";

describe("import guide copy matches the CSV parser", () => {
  it("does not say a bad VPD or CO₂ skips the row, and matches unit inference", () => {
    const guide = findGuideBySlug("import-grow-sensor-csv")!;
    const copy = JSON.stringify({
      intro: guide.intro,
      sections: guide.sections,
      faq: guide.faq,
    });
    expect(copy).toContain("calculated, not measured");
    expect(copy).toContain("only when every sampled temperature is from 0 to 45");
    expect(copy).toContain("multiplied by 100");
    expect(copy).toContain("PPFD / PAR");
    expect(copy).not.toContain("doesn't quietly fix bad readings");
    expect(copy).not.toContain("If your export has a VPD column, Verdant keeps it");
    expect(guide.modifiedOn).toBe("2026-11-02");

    const parsed = parseEnvironmentCSVText(
      [
        "timestamp,Temp C,humidity,vpd,co2,ppfd",
        "2026-01-01 00:00:00,25,0.6,99,99999,9000",
        "2026-01-01 00:05:00,200,60,1.2,800",
        "2026-01-01 00:10:00,25,140,1.2,800",
      ].join("\n"),
    );
    expect(parsed.isAmbiguous).toBe(false);
    expect(parsed.validRows).toHaveLength(1);
    expect(parsed.validRows[0]?.vpd_source).toBe("derived");
    expect(parsed.validRows[0]?.co2_ppm).toBeNull();
    expect(parsed.validRows[0]?.vpd_kpa).not.toBeNull();
    expect(parsed.validRows[0]?.humidity_pct).toBe(60);
    expect(parsed.validRows[0]?.ppfd).toBeNull();
    expect(parsed.skippedRows.map((row) => row.reason)).toEqual([
      "invalid_temperature",
      "invalid_humidity",
    ]);

    expect(
      parseEnvironmentCSVText(
        ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,22,55"].join("\n"),
      ).isAmbiguous,
    ).toBe(true);
    expect(
      parseEnvironmentCSVText(
        ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,80,55"].join("\n"),
      ).validRows[0]?.raw_temp_unit,
    ).toBe("F");
    expect(
      parseEnvironmentCSVText(
        ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,-5,55"].join("\n"),
      ).validRows[0]?.raw_temp_unit,
    ).toBe("C");
  });
});
