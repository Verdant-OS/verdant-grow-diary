import { describe, expect, it } from "vitest";
import {
  buildGrowTentClimateReading,
  buildGrowTentClimateTsv,
  parseGrowTentClimateInputs,
} from "@/lib/growTentClimateRules";

/** Quote-aware TSV parse, the way Sheets and Excel read a pasted block. */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function reading(id: number, note: string) {
  const inputs = parseGrowTentClimateInputs("77", "60", "-2", "veg");
  return buildGrowTentClimateReading(id, inputs, "Lights on", "2026-10-28 09:00", note);
}

describe("Copy log TSV and double quotes in notes", () => {
  it("keeps every row and column when a note opens with an unmatched quote", () => {
    const rows = parseTsv(
      buildGrowTentClimateTsv([reading(1, '"after watering'), reading(2, "steady")]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.length)).toEqual([10, 10, 10]);
    expect(rows[1].at(-2)).toBe('"after watering');
    expect(rows[1].at(-1)).toBe("manual");
    expect(rows[2].at(-2)).toBe("steady");
  });

  it("round-trips quotes inside a note and keeps the formula guard", () => {
    const rows = parseTsv(
      buildGrowTentClimateTsv([reading(1, 'fan on "low"'), reading(2, '=HYPERLINK("x")')]),
    );
    expect(rows[1].at(-2)).toBe('fan on "low"');
    expect(rows[2].at(-2)).toBe(`'=HYPERLINK("x")`);
  });

  it("leaves quote-free cells unquoted", () => {
    const tsv = buildGrowTentClimateTsv([reading(1, "plain note")]);
    expect(tsv).not.toContain('"');
  });
});
