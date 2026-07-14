/**
 * pheno-hunt-csv-export-traceability — the scale-up CSV additions: spreadsheet
 * formula-injection defense, candidate_number (legacy nulls blank), hunt/plant
 * ids, evidence readiness + goals, honest provenance, and injected exportedAt.
 * Column + row ordering stays deterministic and never ranked.
 */
import { describe, it, expect } from "vitest";
import { buildPhenoHuntCsv, csvField, type PhenoHuntCsvInput } from "@/lib/phenoHuntCsvExport";

/** Minimal RFC-4180 line parser (handles quotes + doubled quotes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function rows(csv: string): {
  header: string[];
  body: string[][];
  cell: (r: number, col: string) => string;
} {
  const lines = csv.trimEnd().split("\r\n");
  const header = parseCsvLine(lines[0]);
  const body = lines.slice(1).map(parseCsvLine);
  return {
    header,
    body,
    cell: (r, col) => body[r][header.indexOf(col)],
  };
}

function baseInput(overrides: Partial<PhenoHuntCsvInput> = {}): PhenoHuntCsvInput {
  return {
    huntName: "Blue Dream Hunt",
    huntId: "hunt-9",
    candidates: [
      { candidateId: "p1", candidateNumber: 3, candidateLabel: "Sour Zebra", stage: "cured" },
      { candidateId: "p2", candidateNumber: null, candidateLabel: "BD #2", stage: "flower" },
    ],
    scoresByPlant: {},
    decisionsByPlant: {},
    sexByPlant: {},
    smokeByPlant: {},
    labByKey: {},
    ...overrides,
  };
}

describe("csvField — formula-injection defense", () => {
  it("neutralises leading formula triggers on string values", () => {
    expect(csvField("=1+2")).toBe("'=1+2");
    expect(csvField("+cmd|'/C calc'!A0")).toBe("'+cmd|'/C calc'!A0");
    expect(csvField("-2+3")).toBe("'-2+3");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tTAB")).toBe("'\tTAB");
  });

  it("guards AND RFC-4180 quotes when a formula value also contains a comma", () => {
    expect(csvField("=HYPERLINK(1,2)")).toBe('"\'=HYPERLINK(1,2)"');
  });

  it("never formula-guards a numeric value (negative numbers stay numbers)", () => {
    expect(csvField(-3)).toBe("-3");
    expect(csvField(9)).toBe("9");
  });

  it("leaves plain values and the pinned escaping untouched", () => {
    expect(csvField("gas")).toBe("gas");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe("");
  });
});

describe("buildPhenoHuntCsv — traceability columns", () => {
  it("includes the new identity/traceability headers", () => {
    const { header } = rows(buildPhenoHuntCsv(baseInput()));
    for (const col of [
      "hunt_id",
      "candidate_number",
      "candidate_label",
      "plant_id",
      "readiness",
      "completed_evidence_goals",
      "missing_evidence_goals",
      "coa_source",
      "data_provenance",
      "exported_at",
    ]) {
      expect(header).toContain(col);
    }
  });

  it("exports candidate_number for numbered candidates and blank for legacy nulls", () => {
    const r = rows(buildPhenoHuntCsv(baseInput()));
    expect(r.cell(0, "candidate_number")).toBe("3");
    expect(r.cell(1, "candidate_number")).toBe("");
    expect(r.cell(0, "hunt_id")).toBe("hunt-9");
    expect(r.cell(0, "plant_id")).toBe("p1");
  });

  it("carries the display identity (number · label) as candidate_display", () => {
    const r = rows(buildPhenoHuntCsv(baseInput()));
    expect(r.cell(0, "candidate_display")).toBe("#3 · Sour Zebra");
    expect(r.cell(1, "candidate_display")).toBe("BD #2");
  });

  it("exports an evidence readiness value (not a phenotype score)", () => {
    const r = rows(buildPhenoHuntCsv(baseInput()));
    // p2 (flower, no evidence) is insufficient
    expect(["insufficient", "partial", "comparison_ready"]).toContain(r.cell(1, "readiness"));
    expect(r.cell(1, "readiness")).toBe("insufficient");
  });

  it("labels provenance honestly and defaults to live", () => {
    expect(rows(buildPhenoHuntCsv(baseInput())).cell(0, "data_provenance")).toBe("live");
    expect(
      rows(buildPhenoHuntCsv(baseInput({ provenance: "demo" }))).cell(0, "data_provenance"),
    ).toBe("demo");
  });

  it("passes exportedAt through verbatim (no internal clock)", () => {
    const r = rows(buildPhenoHuntCsv(baseInput({ exportedAt: "2026-07-14T00:00:00Z" })));
    expect(r.cell(0, "exported_at")).toBe("2026-07-14T00:00:00Z");
  });

  it("preserves INPUT order — never ranked by readiness", () => {
    const r = rows(
      buildPhenoHuntCsv(
        baseInput({
          candidates: [
            { candidateId: "p2", candidateNumber: null, candidateLabel: "BD #2" },
            { candidateId: "p1", candidateNumber: 3, candidateLabel: "Sour Zebra" },
          ],
        }),
      ),
    );
    expect(r.cell(0, "candidate_label")).toBe("BD #2");
    expect(r.cell(1, "candidate_label")).toBe("Sour Zebra");
  });

  it("prefers a supplied readinessByPlant over internal derivation", () => {
    const r = rows(
      buildPhenoHuntCsv(
        baseInput({
          readinessByPlant: {
            p1: {
              readiness: "comparison_ready",
              completedGoals: ["identity", "aroma"],
              missingGoals: [],
            },
          },
        }),
      ),
    );
    expect(r.cell(0, "readiness")).toBe("comparison_ready");
    expect(r.cell(0, "completed_evidence_goals")).toBe("identity;aroma");
  });
});
