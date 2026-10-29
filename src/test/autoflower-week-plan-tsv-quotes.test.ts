import { describe, expect, it } from "vitest";
import {
  buildAutoflowerPlanTsv,
  createDefaultAutoflowerPlan,
  type AutoflowerPlanState,
} from "@/lib/autoflowerWeekPlanRules";

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

function plan(plantName: string, harvestNote: string): AutoflowerPlanState {
  const base = createDefaultAutoflowerPlan("2026-11-01");
  return {
    ...base,
    plantName,
    milestones: { ...base.milestones, harvest: { actualDate: "", note: harvestNote } },
  };
}

describe("Copy plan TSV and double quotes", () => {
  it("keeps every row and column when the plant name opens with an unmatched quote", () => {
    const plain = parseTsv(buildAutoflowerPlanTsv(plan("Auto 1", "done")));
    const quoted = parseTsv(buildAutoflowerPlanTsv(plan('"Auto 1', 'cut "early')));
    expect(quoted.map((r) => r.length)).toEqual(plain.map((r) => r.length));
    expect(quoted[1][1]).toBe('"Auto 1');
    expect(quoted.at(-1)?.[6]).toBe('cut "early');
  });

  it("keeps the formula guard and leaves quote-free cells unquoted", () => {
    expect(parseTsv(buildAutoflowerPlanTsv(plan('=HYPERLINK("x")', "")))[1][1]).toBe(
      `'=HYPERLINK("x")`,
    );
    expect(buildAutoflowerPlanTsv(plan("Auto 1", "done"))).not.toContain('"');
  });
});
