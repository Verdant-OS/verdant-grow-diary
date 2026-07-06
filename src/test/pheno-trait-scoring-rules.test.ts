import { describe, it, expect } from "vitest";
import {
  isValidTraitScore,
  traitRecordToRatings,
  summarizeCandidateTraitScores,
  summarizeTraitScores,
  DEFAULT_HYBRID_TRAITS,
  type PhenoTraitDefinition,
} from "@/lib/phenoTraitScoringRules";

const TRAITS: PhenoTraitDefinition[] = [
  { key: "vigor", label: "Vigor" },
  { key: "aroma", label: "Aroma" },
  { key: "yield_impression", label: "Yield (impression)" },
];

describe("isValidTraitScore", () => {
  it("accepts integers 1..5 only", () => {
    expect([1, 2, 3, 4, 5].every(isValidTraitScore)).toBe(true);
  });
  it("rejects out-of-range, non-integer, and non-number values", () => {
    for (const v of [0, 6, -1, 2.5, NaN, Infinity, "3", null, undefined, {}]) {
      expect(isValidTraitScore(v as unknown)).toBe(false);
    }
  });
});

describe("traitRecordToRatings", () => {
  it("converts a jsonb trait record into rating inputs", () => {
    expect(traitRecordToRatings({ vigor: 4, aroma: 5 })).toEqual([
      { key: "vigor", score: 4 },
      { key: "aroma", score: 5 },
    ]);
  });
  it("passes non-number values through as null score (reported later, not used)", () => {
    expect(traitRecordToRatings({ vigor: "high" })).toEqual([{ key: "vigor", score: null }]);
  });
  it("returns [] for non-object input", () => {
    expect(traitRecordToRatings(null)).toEqual([]);
    expect(traitRecordToRatings([1, 2])).toEqual([]);
    expect(traitRecordToRatings("x")).toEqual([]);
  });
});

describe("summarizeCandidateTraitScores", () => {
  it("summarizes a candidate's own ratings (rated, average, completeness, missing)", () => {
    const s = summarizeCandidateTraitScores(
      {
        candidateId: "p1",
        candidateLabel: "BD #1",
        ratings: [
          { key: "vigor", score: 4 },
          { key: "aroma", score: 5 },
        ],
      },
      TRAITS,
    );
    expect(s.ratedCount).toBe(2);
    expect(s.totalTraits).toBe(3);
    expect(s.completeness).toBeCloseTo(2 / 3);
    expect(s.averageScore).toBeCloseTo(4.5);
    expect(s.ratedTraits.map((t) => t.key)).toEqual(["vigor", "aroma"]);
    expect(s.missingTraits.map((t) => t.key)).toEqual(["yield_impression"]);
    expect(s.invalidRatingKeys).toEqual([]);
  });

  it("reports invalid (out-of-range/non-integer) ratings and does NOT use them", () => {
    const s = summarizeCandidateTraitScores(
      {
        candidateId: "p1",
        ratings: [
          { key: "vigor", score: 9 }, // out of range
          { key: "aroma", score: 2.5 }, // non-integer
          { key: "yield_impression", score: 3 }, // valid
        ],
      },
      TRAITS,
    );
    expect([...s.invalidRatingKeys].sort()).toEqual(["aroma", "vigor"]);
    expect(s.ratedTraits.map((t) => t.key)).toEqual(["yield_impression"]);
    expect(s.averageScore).toBe(3);
    // Invalid-scored traits count as missing (not yet validly rated).
    expect(s.missingTraits.map((t) => t.key).sort()).toEqual(["aroma", "vigor"]);
  });

  it("surfaces unknown rating keys not in the active trait set, without scoring them", () => {
    const s = summarizeCandidateTraitScores(
      {
        candidateId: "p1",
        ratings: [
          { key: "vigor", score: 4 },
          { key: "mystery_trait", score: 5 },
        ],
      },
      TRAITS,
    );
    expect(s.unknownRatingKeys).toEqual(["mystery_trait"]);
    expect(s.ratedTraits.map((t) => t.key)).toEqual(["vigor"]);
  });

  it("returns null average and 0 completeness for an unrated candidate", () => {
    const s = summarizeCandidateTraitScores({ candidateId: "p1" }, TRAITS);
    expect(s.averageScore).toBeNull();
    expect(s.ratedCount).toBe(0);
    expect(s.completeness).toBe(0);
    expect(s.missingTraits).toHaveLength(3);
  });

  it("falls back to candidateId when label is blank; keeps rating notes", () => {
    const s = summarizeCandidateTraitScores(
      {
        candidateId: "abc",
        candidateLabel: "  ",
        ratings: [{ key: "vigor", score: 4, note: "stretchy" }],
      },
      TRAITS,
    );
    expect(s.candidateLabel).toBe("abc");
    expect(s.ratedTraits[0].note).toBe("stretchy");
  });

  it("uses the DEFAULT_HYBRID_TRAITS set when none is supplied", () => {
    const s = summarizeCandidateTraitScores({
      candidateId: "p1",
      ratings: [{ key: "vigor", score: 3 }],
    });
    expect(s.totalTraits).toBe(DEFAULT_HYBRID_TRAITS.length);
  });
});

describe("summarizeTraitScores (set)", () => {
  it("preserves input order and does NOT rank by score", () => {
    const out = summarizeTraitScores(
      [
        { candidateId: "low", ratings: [{ key: "vigor", score: 1 }] },
        { candidateId: "high", ratings: [{ key: "vigor", score: 5 }] },
      ],
      TRAITS,
    );
    // 'low' stays first despite a lower average — no ranking/reordering.
    expect(out.map((s) => s.candidateId)).toEqual(["low", "high"]);
  });

  it("skips garbage rows and handles null/undefined input", () => {
    expect(summarizeTraitScores(null)).toEqual([]);
    expect(summarizeTraitScores(undefined)).toEqual([]);
    const out = summarizeTraitScores(
      [{ candidateId: "a", ratings: [] }, { candidateId: "" } as never],
      TRAITS,
    );
    expect(out.map((s) => s.candidateId)).toEqual(["a"]);
  });
});
