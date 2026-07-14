import { describe, it, expect } from "vitest";
import {
  isValidMaleScore,
  normalizePollenViabilityResult,
  summarizePollenViability,
  summarizeMaleEvaluation,
  summarizeMaleEvaluations,
  DEFAULT_MALE_EVALUATION_AXES,
  PHENO_MALE_EVALUATION_CAVEAT,
  type PhenoMaleEvaluationAxis,
} from "@/lib/phenoMaleEvaluationRules";

const AXES: PhenoMaleEvaluationAxis[] = [
  { key: "vegetative_vigor_structure", label: "Vegetative vigor & structure" },
  { key: "pollen_sac_density_timing", label: "Pollen sac density & timing" },
  { key: "environmental_robustness", label: "Environmental robustness" },
];

describe("isValidMaleScore", () => {
  it("accepts integers 1..10 only", () => {
    expect([1, 5, 10].every(isValidMaleScore)).toBe(true);
  });
  it("rejects out-of-range, non-integer, and non-number values", () => {
    for (const v of [0, 11, -1, 5.5, NaN, Infinity, "7", null, undefined, {}]) {
      expect(isValidMaleScore(v as unknown)).toBe(false);
    }
  });
});

describe("normalizePollenViabilityResult", () => {
  it("passes through the four known results", () => {
    for (const r of ["viable", "nonviable", "inconclusive", "untested"] as const) {
      expect(normalizePollenViabilityResult(r)).toBe(r);
    }
  });
  it("maps unknown/blank/non-string input to 'untested'", () => {
    for (const v of ["", "maybe", null, undefined, 3, {}]) {
      expect(normalizePollenViabilityResult(v as unknown)).toBe("untested");
    }
  });
});

describe("summarizePollenViability", () => {
  it("confirms only when both tests read viable", () => {
    const s = summarizePollenViability([{ result: "viable" }, { result: "viable" }]);
    expect(s.status).toBe("confirmed");
    expect(s.viableCount).toBe(2);
    expect(s.recordedCount).toBe(2);
  });
  it("is partial with a single viable read and no nonviable read", () => {
    const s = summarizePollenViability([{ result: "viable" }, { result: "inconclusive" }]);
    expect(s.status).toBe("partial");
    expect(s.viableCount).toBe(1);
  });
  it("flags nonviable even when another test is viable (nonviable takes precedence)", () => {
    const s = summarizePollenViability([{ result: "viable" }, { result: "nonviable" }]);
    expect(s.status).toBe("flagged_nonviable");
    expect(s.nonviableCount).toBe(1);
  });
  it("is untested when nothing viable/nonviable/inconclusive is recorded", () => {
    expect(summarizePollenViability([]).status).toBe("untested");
    expect(summarizePollenViability([{ result: "untested" }]).status).toBe("untested");
    expect(summarizePollenViability(null).status).toBe("untested");
  });
});

describe("summarizeMaleEvaluation", () => {
  it("summarizes a male's own ratings (rated, average, completeness, missing)", () => {
    const s = summarizeMaleEvaluation(
      {
        maleId: "m1",
        maleLabel: "Stud #1",
        strainLineage: "GG4 x Zkittlez",
        ratings: [
          { key: "vegetative_vigor_structure", score: 8 },
          { key: "environmental_robustness", score: 6 },
        ],
        pollenViabilityTests: [{ result: "viable" }, { result: "viable" }],
      },
      AXES,
    );
    expect(s.maleLabel).toBe("Stud #1");
    expect(s.strainLineage).toBe("GG4 x Zkittlez");
    expect(s.ratedCount).toBe(2);
    expect(s.totalAxes).toBe(3);
    expect(s.completeness).toBeCloseTo(2 / 3);
    expect(s.averageScore).toBeCloseTo(7);
    expect(s.ratedAxes.map((a) => a.key)).toEqual([
      "vegetative_vigor_structure",
      "environmental_robustness",
    ]);
    expect(s.missingAxes.map((a) => a.key)).toEqual(["pollen_sac_density_timing"]);
    expect(s.pollenViability.status).toBe("confirmed");
  });

  it("reports invalid (out-of-range/non-integer) ratings and does NOT use them", () => {
    const s = summarizeMaleEvaluation(
      {
        maleId: "m1",
        ratings: [
          { key: "vegetative_vigor_structure", score: 11 },
          { key: "pollen_sac_density_timing", score: 5.5 },
          { key: "environmental_robustness", score: 7 },
        ],
      },
      AXES,
    );
    expect([...s.invalidRatingKeys].sort()).toEqual([
      "pollen_sac_density_timing",
      "vegetative_vigor_structure",
    ]);
    expect(s.ratedCount).toBe(1);
    expect(s.averageScore).toBe(7);
    // Invalid axes are still reported as missing so the card reads honestly.
    expect(s.missingAxes.map((a) => a.key).sort()).toEqual([
      "pollen_sac_density_timing",
      "vegetative_vigor_structure",
    ]);
  });

  it("surfaces unknown rated keys without scoring them", () => {
    const s = summarizeMaleEvaluation(
      { maleId: "m1", ratings: [{ key: "not_an_axis", score: 9 }] },
      AXES,
    );
    expect(s.unknownRatingKeys).toEqual(["not_an_axis"]);
    expect(s.ratedCount).toBe(0);
    expect(s.averageScore).toBeNull();
  });

  it("falls back to maleId as label and null lineage when unset", () => {
    const s = summarizeMaleEvaluation({ maleId: "m9" }, AXES);
    expect(s.maleLabel).toBe("m9");
    expect(s.strainLineage).toBeNull();
    expect(s.completeness).toBe(0);
    expect(s.pollenViability.status).toBe("untested");
  });

  it("uses the default workbook axis set when none is passed", () => {
    const s = summarizeMaleEvaluation({ maleId: "m1" });
    expect(s.totalAxes).toBe(DEFAULT_MALE_EVALUATION_AXES.length);
  });
});

describe("summarizeMaleEvaluations", () => {
  it("preserves input order and never ranks by score", () => {
    const out = summarizeMaleEvaluations(
      [
        { maleId: "lo", ratings: [{ key: "vegetative_vigor_structure", score: 2 }] },
        { maleId: "hi", ratings: [{ key: "vegetative_vigor_structure", score: 10 }] },
      ],
      AXES,
    );
    expect(out.map((m) => m.maleId)).toEqual(["lo", "hi"]);
  });
  it("drops entries without a usable maleId and tolerates non-array input", () => {
    const out = summarizeMaleEvaluations([{ maleId: "" }, { maleId: "ok" }] as never, AXES);
    expect(out.map((m) => m.maleId)).toEqual(["ok"]);
    expect(summarizeMaleEvaluations(null)).toEqual([]);
  });
});

describe("PHENO_MALE_EVALUATION_CAVEAT", () => {
  it("states the suggest-only, no-automation posture", () => {
    expect(PHENO_MALE_EVALUATION_CAVEAT).toMatch(/does not (pick|promote)/i);
    expect(PHENO_MALE_EVALUATION_CAVEAT).toMatch(/no (writes|automation)/i);
  });
});
