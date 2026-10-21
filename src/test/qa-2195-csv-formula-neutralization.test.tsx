/**
 * Regression suite for PR #2195 review follow-up at 294a08ce:
 *  - Neutralize spreadsheet formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`)
 *    on string cells in CSV export (including tent names and other text cells),
 *    while preserving negative numeric temperatures as numbers.
 *  - Disambiguate duplicate tent names with tent IDs and disable export while
 *    Quick Log manual history is refetching (`fetchStatus === "fetching"`).
 */
import { describe, expect, it } from "vitest";
import { buildSensorReadingsCsv } from "@/lib/sensorChartExport";
import type { SensorReading } from "@/mock";

const BASE_READING: SensorReading = {
  ts: "2026-10-15T12:00:00.000Z",
  capturedAt: "2026-10-15T12:00:00.000Z",
  tentId: "tent-1",
  temp: -2.5,
  rh: 55,
  vpd: 1.1,
  co2: 800,
  soil: 42,
  observedMetrics: ["temp", "rh", "vpd", "co2", "soil"],
  source: "manual",
  status: "usable",
};

describe("buildSensorReadingsCsv — CSV formula injection neutralization (#2195)", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+SUM(A1:A2)", "'+SUM(A1:A2)"],
    ["-10+20", "'-10+20"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", '"\'\rcmd"'],
  ])(
    "neutralizes tent name %j to %s while keeping negative numeric temperatures unprefixed",
    (rawTentName, expectedCell) => {
      const csv = buildSensorReadingsCsv([BASE_READING], undefined, "celsius", {
        tentNamesById: { "tent-1": rawTentName },
      });
      const dataLine = csv.split("\n")[1] ?? "";
      const cells = dataLine.split(",");
      // Numeric negative temperature (-2.5°C) must remain a number, not prefixed with a quote.
      expect(cells[1]).toBe("-2.5");
      expect(dataLine.endsWith(`,${expectedCell}`)).toBe(true);
    },
  );

  it("neutralizes non-tent string fields if they begin with a formula trigger", () => {
    const readingWithFormulaSource: SensorReading = {
      ...BASE_READING,
      source: '=HYPERLINK("http://evil.example")' as unknown as SensorReading["source"],
    };
    const csv = buildSensorReadingsCsv([readingWithFormulaSource], undefined, "celsius");
    const dataLine = csv.split("\n")[1] ?? "";
    expect(dataLine).toContain('"\'=HYPERLINK(""http://evil.example"")"');
  });

  it("disambiguates duplicate tent names across distinct tent IDs", () => {
    const r1: SensorReading = { ...BASE_READING, tentId: "tent-a" };
    const r2: SensorReading = {
      ...BASE_READING,
      tentId: "tent-b",
      ts: "2026-10-15T13:00:00.000Z",
      capturedAt: "2026-10-15T13:00:00.000Z",
    };
    const csv = buildSensorReadingsCsv([r1, r2], undefined, "celsius", {
      tentNamesById: { "tent-a": "Flower Tent", "tent-b": "Flower Tent" },
    });
    const lines = csv.split("\n");
    expect(lines[1]?.endsWith(",Flower Tent (tent-a)")).toBe(true);
    expect(lines[2]?.endsWith(",Flower Tent (tent-b)")).toBe(true);
  });
});
