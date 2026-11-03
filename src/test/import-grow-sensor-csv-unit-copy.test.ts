/**
 * Pins the unit-choice and blank-cell sentences added after the first
 * parser-copy test was locked. A wrong unit stores wrong temperatures;
 * a blank temperature cell does not skip the row by itself.
 */
import { describe, expect, it } from "vitest";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { parseEnvironmentCSVText, renormalizeWithUnit } from "@/lib/csvParser";

describe("import guide unit and blank-cell copy", () => {
  it("matches a wrong unit choice and a blank temperature cell", () => {
    const guide = findGuideBySlug("import-grow-sensor-csv")!;
    const copy = JSON.stringify({
      intro: guide.intro,
      sections: guide.sections,
      faq: guide.faq,
    });
    expect(guide.intro).toContain("PPFD/PAR");
    expect(copy).toContain("no usable reading");
    expect(copy).toContain("does not skip the row by itself");
    expect(copy).toContain("delete that import and re-import choosing the other unit");
    expect(copy).toContain("unit prompt only appears when every temperature is between 0 and 45");
    expect(copy).not.toContain("wrong unit was picked");

    const blankTemp = parseEnvironmentCSVText(
      ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,,55", "2026-01-01 00:05:00,,"].join(
        "\n",
      ),
    );
    expect(blankTemp.validRows).toHaveLength(1);
    expect(blankTemp.validRows[0]?.temperature_c).toBeNull();
    expect(blankTemp.validRows[0]?.humidity_pct).toBe(55);
    expect(blankTemp.skippedRows.map((row) => row.reason)).toEqual(["no_metrics"]);

    const ambiguous = parseEnvironmentCSVText(
      ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,24,55"].join("\n"),
    );
    const asFahrenheit = renormalizeWithUnit(ambiguous, "F");
    expect(asFahrenheit.validRows).toHaveLength(1);
    expect(asFahrenheit.skippedRows).toHaveLength(0);
    expect(asFahrenheit.validRows[0]?.temperature_c).toBeCloseTo((24 - 32) * (5 / 9));
    expect(asFahrenheit.validRows[0]?.vpd_source).toBe("derived");
  });
});
