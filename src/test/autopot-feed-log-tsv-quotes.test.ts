import { describe, expect, it } from "vitest";
import { buildAutopotEntry, buildAutopotTsv, type AutopotRawEntry } from "@/lib/autopotFeedLogRules";

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

const BLANK: AutopotRawEntry = {
  date: "2026-10-28",
  tent: "",
  system: "AutoPot Classic",
  entryType: "Refill / top-up",
  volumeGal: "",
  waterTempF: "",
  mix: "",
  actualPh: "",
  actualEc: "",
  actualUnit: "mS/cm",
  plannedPh: "",
  plannedEc: "",
  plannedUnit: "mS/cm",
  note: "",
};

const entry = (id: number, date: string, partial: Partial<AutopotRawEntry>) =>
  buildAutopotEntry(id, { ...BLANK, date, ...partial });

describe("Copy log TSV and double quotes in free text", () => {
  it("keeps every row and column when a note opens with an unmatched quote", () => {
    const rows = parseTsv(
      buildAutopotTsv([
        entry(1, "2026-10-28", { note: '"after flush' }),
        entry(2, "2026-10-27", { mix: 'Stash "Bloom' }),
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.length)).toEqual([10, 10, 10]);
    expect(rows[1][9]).toBe('"after flush');
    expect(rows[2][5]).toBe('Stash "Bloom');
  });

  it("keeps the formula guard and leaves quote-free cells unquoted", () => {
    const rows = parseTsv(buildAutopotTsv([entry(1, "2026-10-28", { tent: '=HYPERLINK("x")' })]));
    expect(rows[1][1]).toBe(`'=HYPERLINK("x")`);
    expect(buildAutopotTsv([entry(1, "2026-10-28", { note: "plain" })])).not.toContain('"');
  });
});
