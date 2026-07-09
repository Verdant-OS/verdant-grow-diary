/**
 * phenoHuntCsvExport — pure CSV builder for a hunt's candidate records.
 * Proves header shape, per-candidate flattening, RFC-4180 escaping,
 * input-order preservation (never ranked), and safe filenames.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoHuntCsv,
  csvField,
  phenoHuntCsvFilename,
  type PhenoHuntCsvInput,
} from "@/lib/phenoHuntCsvExport";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";

function baseInput(overrides: Partial<PhenoHuntCsvInput> = {}): PhenoHuntCsvInput {
  return {
    huntName: "Blue Dream Hunt",
    candidates: [
      { candidateId: "p1", candidateLabel: "BD #1", strain: "Blue Dream", stage: "flower" },
      { candidateId: "p2", candidateLabel: "BD #2", strain: "Blue Dream", stage: "cure" },
    ],
    scoresByPlant: {
      p1: { plantId: "p1", traits: { [LOUD_TRAIT_AXES[0].key]: 9 }, note: "loudest" },
    },
    decisionsByPlant: {
      p1: { plantId: "p1", decision: "keep", note: "frost", decidedAt: "2026-03-02T00:00:00Z" },
    },
    sexByPlant: {
      p1: { plantId: "p1", sex: "female", hermObserved: false, note: null, observedAt: null },
    },
    smokeByPlant: {
      p1: {
        plantId: "p1",
        flavorDescriptors: ["gas"],
        effectDescriptors: ["couchlock"],
        smoothness: 4,
        potencyImpression: 5,
        verdict: "keeper",
      },
    },
    labByKey: {
      "p1:coa": {
        plantId: "p1",
        source: "coa",
        thcPct: 27.5,
        cbdPct: 0.1,
        totalCannabinoidsPct: null,
        dominantTerpenes: [],
        labVerified: true,
      },
    },
    ...overrides,
  };
}

describe("csvField escaping", () => {
  it("passes plain values through", () => {
    expect(csvField("gas")).toBe("gas");
    expect(csvField(9)).toBe("9");
  });
  it("blanks null / undefined", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
  it("quotes and doubles quotes for comma / quote / newline", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("phenoHuntCsvFilename", () => {
  it("slugifies and always ends in .csv", () => {
    expect(phenoHuntCsvFilename("Blue Dream Hunt")).toBe("pheno-hunt-blue-dream-hunt-export.csv");
  });
  it("falls back to 'hunt' for an empty/symbol-only name", () => {
    expect(phenoHuntCsvFilename("!!!")).toBe("pheno-hunt-hunt-export.csv");
  });
});

describe("buildPhenoHuntCsv", () => {
  it("emits a header plus one row per candidate", () => {
    const csv = buildPhenoHuntCsv(baseInput());
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 candidates
    expect(lines[0]).toContain("candidate_label");
    expect(lines[0]).toContain("decision");
    // every trait axis is a column
    for (const axis of LOUD_TRAIT_AXES) expect(lines[0]).toContain(axis.key);
  });

  it("flattens a candidate's scores, decision, sex, smoke, and COA", () => {
    const csv = buildPhenoHuntCsv(baseInput());
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[1]).toContain("BD #1");
    expect(rows[1]).toContain("keep");
    expect(rows[1]).toContain("female");
    expect(rows[1]).toContain("keeper"); // smoke verdict
    expect(rows[1]).toContain("27.5"); // coa thc
    expect(rows[1]).toContain("9"); // trait score
  });

  it("preserves INPUT order — never sorts or ranks candidates by score", () => {
    // p2 has no score; a ranking export would push it below p1. Input order
    // must survive regardless.
    const csv = buildPhenoHuntCsv(
      baseInput({
        candidates: [
          { candidateId: "p2", candidateLabel: "BD #2" },
          { candidateId: "p1", candidateLabel: "BD #1" },
        ],
      }),
    );
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[1]).toContain("BD #2");
    expect(rows[2]).toContain("BD #1");
  });

  it("escapes a candidate label containing a comma", () => {
    const csv = buildPhenoHuntCsv(
      baseInput({
        candidates: [{ candidateId: "p1", candidateLabel: "BD #1, tall pheno" }],
        scoresByPlant: {},
        decisionsByPlant: {},
        sexByPlant: {},
        smokeByPlant: {},
        labByKey: {},
      }),
    );
    expect(csv).toContain('"BD #1, tall pheno"');
  });
});
