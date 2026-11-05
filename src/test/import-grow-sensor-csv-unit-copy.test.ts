/**
 * Pins the unit-choice and blank-cell sentences on the import guide.
 * A wrong unit stores wrong temperatures. A blank temperature cell
 * does not skip the row by itself.
 */
import { describe, expect, it } from "vitest";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { parseEnvironmentCSVText, renormalizeWithUnit } from "@/lib/csvParser";

const WRONG_UNIT_CLOSING =
  "Check the unit in the import preview before saving, because a wrong-unit import can't be corrected in the app yet. Choosing the wrong unit does not skip rows. The unit prompt only appears when every temperature is between 0 and 45. A wrong choice stores the wrong temperatures. When the file has no VPD column, it also stores a wrong calculated VPD; a VPD supplied in the file is kept. A 24°C reading imported as °F is stored as about -4.4°C.";

describe("import guide unit and blank-cell copy", () => {
  it("matches a wrong unit choice and a blank temperature cell", () => {
    const guide = findGuideBySlug("import-grow-sensor-csv")!;
    const skipSection = guide.sections
      .flatMap((section) => section.continuations ?? [])
      .find((section) => section.heading === "Why some rows get skipped");
    expect(guide.intro).toContain("time, temperature, humidity, VPD, CO₂, and PPFD/PAR columns");
    expect(skipSection?.body).toContain(
      "A blank temperature or humidity cell is left empty and does not skip the row by itself.",
    );
    expect(skipSection?.body).toContain("A row that has a time but no usable reading is skipped.");
    expect(skipSection?.closing).toBe(WRONG_UNIT_CLOSING);
    expect(JSON.stringify(guide)).not.toContain("delete that import");
    expect(JSON.stringify(guide)).not.toContain("wrong unit was picked");

    const blankTemp = parseEnvironmentCSVText(
      ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,,55", "2026-01-01 00:05:00,,"].join(
        "\n",
      ),
      { sourceTimeZone: "UTC" },
    );
    expect(blankTemp.validRows).toHaveLength(1);
    expect(blankTemp.validRows[0]?.temperature_c).toBeNull();
    expect(blankTemp.validRows[0]?.humidity_pct).toBe(55);
    expect(blankTemp.skippedRows.map((row) => row.reason)).toEqual(["no_metrics"]);

    const ambiguous = parseEnvironmentCSVText(
      ["timestamp,Temperature,humidity", "2026-01-01 00:00:00,24,55"].join("\n"),
      { sourceTimeZone: "UTC" },
    );
    const asFahrenheit = renormalizeWithUnit(ambiguous, "F");
    expect(asFahrenheit.validRows).toHaveLength(1);
    expect(asFahrenheit.skippedRows).toHaveLength(0);
    expect(asFahrenheit.validRows[0]?.temperature_c).toBeCloseTo(-4.4, 1);
    expect(asFahrenheit.validRows[0]?.vpd_source).toBe("derived");

    const withFileVpd = renormalizeWithUnit(
      parseEnvironmentCSVText(
        ["timestamp,Temperature,humidity,vpd", "2026-01-01 00:00:00,24,55,1.1"].join("\n"),
        { sourceTimeZone: "UTC" },
      ),
      "F",
    );
    expect(withFileVpd.validRows[0]?.vpd_kpa).toBe(1.1);
    expect(withFileVpd.validRows[0]?.vpd_source).toBe("csv");
  });
});
