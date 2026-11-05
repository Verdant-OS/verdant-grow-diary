/**
 * CSV exports must neutralize spreadsheet formula triggers (deep audit
 * 2026-11-05, finding F-03). A grower's own note or cycle name starting with
 * `=`, `+`, `-`, `@`, tab or CR must not execute when the file opens in Excel
 * or Sheets, while numeric cells stay numeric.
 */
import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "@/lib/csvCellEscapeRules";
import { csvEscape } from "@/lib/aiDoctorEvidenceCsvExportRules";
import { buildGrowHelpToolkitCsv } from "@/lib/growHelpToolkitExport";

describe("escapeCsvCell", () => {
  it("prefixes formula triggers with an apostrophe", () => {
    expect(escapeCsvCell('=HYPERLINK("https://x")')).toBe('"\'=HYPERLINK(""https://x"")"');
    expect(escapeCsvCell("@x")).toBe("'@x");
    expect(escapeCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
    expect(escapeCsvCell("\t=1")).toBe("'\t=1");
  });
  it("leaves numbers and plain numeric strings unguarded", () => {
    expect(escapeCsvCell(-0.6)).toBe("-0.6");
    expect(escapeCsvCell("-0.6")).toBe("-0.6");
    expect(escapeCsvCell("+12")).toBe("+12");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
  it("still quotes commas, quotes and newlines", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("AI Doctor evidence CSV", () => {
  it("neutralizes a formula-shaped cell", () => {
    expect(csvEscape("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvEscape("@danger")).toBe("'@danger");
    expect(csvEscape(-0.6)).toBe("-0.6");
  });
});

describe("Grow Help Toolkit CSV", () => {
  it("neutralizes formula-shaped cycle names, items and values", () => {
    const csv = buildGrowHelpToolkitCsv({
      cycleName: '=HYPERLINK("https://x")',
      generatedLabel: "2026-11-05",
      rows: [{ section: "Notes", item: "@note", value: "-2+3", unit: "", formula: "+SUM(A1)" }],
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('Grow Help Toolkit,"\'=HYPERLINK(""https://x"")",,,');
    expect(lines[3]).toBe("Notes,'@note,'-2+3,,'+SUM(A1)");
    expect(csv).not.toMatch(/(^|,)[=@][^,]*/m);
  });
});
