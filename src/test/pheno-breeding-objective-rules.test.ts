/**
 * phenoBreedingObjectiveRules — pure breeding-objective-brief model.
 *
 * Covers sanitization, per-candidate evaluation against the hunt's own
 * bar, hunt-level count-only coverage, copy, and a static-safety scan
 * stricter than the repo's usual pheno fence: this module must never even
 * gesture at cross-candidate ranking, not just avoid the word "winner".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  availableObjectiveAxes,
  BREEDING_OBJECTIVE_CAVEAT,
  BREEDING_OBJECTIVE_EMPTY_COPY,
  candidateObjectiveCopy,
  evaluateCandidateAgainstObjective,
  MAX_BREEDING_OBJECTIVE_TARGETS,
  sanitizeBreedingObjectiveTargets,
  summarizeCandidateObjective,
  summarizeHuntObjectiveCoverage,
  type BreedingObjectiveTarget,
} from "@/lib/phenoBreedingObjectiveRules";

const AROMA_LIKE_AXIS = LOUD_TRAIT_AXES.find((a) => a.key === "trichome_coverage")!;
const NOSE_AXIS = LOUD_TRAIT_AXES.find((a) => a.key === "nose_loudness")!;

describe("sanitizeBreedingObjectiveTargets", () => {
  it("keeps valid targets against known axes within range", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: "nose_loudness", comparator: "gte", threshold: 7 },
      { axisKey: "stretch", comparator: "lte", threshold: 2 },
    ]);
    expect(out).toEqual([
      { axisKey: "nose_loudness", comparator: "gte", threshold: 7 },
      { axisKey: "stretch", comparator: "lte", threshold: 2 },
    ]);
  });

  it("drops unknown axis keys instead of inventing a taxonomy", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: "made_up_axis", comparator: "gte", threshold: 3 },
    ]);
    expect(out).toEqual([]);
  });

  it("drops invalid comparators", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: "vigor", comparator: "eq", threshold: 3 },
    ]);
    expect(out).toEqual([]);
  });

  it("drops out-of-range thresholds instead of clamping them", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: NOSE_AXIS.key, comparator: "gte", threshold: NOSE_AXIS.max + 5 },
      { axisKey: "vigor", comparator: "gte", threshold: 0 }, // vigor min is 1
    ]);
    expect(out).toEqual([]);
  });

  it("drops non-finite thresholds", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: "vigor", comparator: "gte", threshold: NaN },
      { axisKey: "vigor", comparator: "gte", threshold: Infinity },
    ]);
    expect(out).toEqual([]);
  });

  it("first entry wins on duplicate axis keys (replace, never stack)", () => {
    const out = sanitizeBreedingObjectiveTargets([
      { axisKey: "vigor", comparator: "gte", threshold: 3 },
      { axisKey: "vigor", comparator: "lte", threshold: 1 },
    ]);
    expect(out).toEqual([{ axisKey: "vigor", comparator: "gte", threshold: 3 }]);
  });

  it("caps at one target per known axis", () => {
    const many = LOUD_TRAIT_AXES.map((a) => ({
      axisKey: a.key,
      comparator: "gte" as const,
      threshold: a.min,
    }));
    const overflow = [...many, { axisKey: "nose_loudness", comparator: "lte", threshold: 1 }];
    const out = sanitizeBreedingObjectiveTargets(overflow as unknown[]);
    expect(out.length).toBe(MAX_BREEDING_OBJECTIVE_TARGETS);
  });

  it("is null-safe on garbage input", () => {
    expect(sanitizeBreedingObjectiveTargets(null)).toEqual([]);
    expect(sanitizeBreedingObjectiveTargets(undefined)).toEqual([]);
    expect(sanitizeBreedingObjectiveTargets([null, "x", 5, {}] as unknown[])).toEqual([]);
  });
});

describe("evaluateCandidateAgainstObjective", () => {
  const targets: BreedingObjectiveTarget[] = [
    { axisKey: "nose_loudness", comparator: "gte", threshold: 7 },
    { axisKey: "stretch", comparator: "lte", threshold: 2 },
  ];

  it("evaluates each target against only this candidate's own traits", () => {
    const evals = evaluateCandidateAgainstObjective(targets, { nose_loudness: 8, stretch: 1 });
    expect(evals).toEqual([
      { axisKey: "nose_loudness", axisLabel: "Nose loudness", comparator: "gte", threshold: 7, actualValue: 8, met: true },
      { axisKey: "stretch", axisLabel: "Stretch", comparator: "lte", threshold: 2, actualValue: 1, met: true },
    ]);
  });

  it("a missed threshold reads as met:false, not absent", () => {
    const evals = evaluateCandidateAgainstObjective(targets, { nose_loudness: 5, stretch: 4 });
    expect(evals[0].met).toBe(false);
    expect(evals[1].met).toBe(false);
  });

  it("an unscored axis reads as met:null — never met, never failed by default", () => {
    const evals = evaluateCandidateAgainstObjective(targets, { nose_loudness: 9 });
    expect(evals[1].actualValue).toBeNull();
    expect(evals[1].met).toBeNull();
  });

  it("handles missing/malformed traits without throwing", () => {
    expect(evaluateCandidateAgainstObjective(targets, null)).toHaveLength(2);
    expect(evaluateCandidateAgainstObjective(targets, undefined)).toHaveLength(2);
    expect(evaluateCandidateAgainstObjective([], { nose_loudness: 9 })).toEqual([]);
  });
});

describe("summarizeCandidateObjective", () => {
  it("allMet requires every target scored AND met; zero targets is never allMet", () => {
    expect(summarizeCandidateObjective([], {}).allMet).toBe(false);
    const targets: BreedingObjectiveTarget[] = [{ axisKey: "vigor", comparator: "gte", threshold: 4 }];
    expect(summarizeCandidateObjective(targets, { vigor: 5 }).allMet).toBe(true);
    expect(summarizeCandidateObjective(targets, { vigor: 3 }).allMet).toBe(false);
    expect(summarizeCandidateObjective(targets, {}).allMet).toBe(false);
  });

  it("counts scored vs met independently", () => {
    const targets: BreedingObjectiveTarget[] = [
      { axisKey: "vigor", comparator: "gte", threshold: 4 },
      { axisKey: "stretch", comparator: "lte", threshold: 2 },
      { axisKey: AROMA_LIKE_AXIS.key, comparator: "gte", threshold: 4 },
    ];
    const s = summarizeCandidateObjective(targets, { vigor: 5, stretch: 5 });
    expect(s.targetCount).toBe(3);
    expect(s.scoredCount).toBe(2);
    expect(s.metCount).toBe(1);
    expect(s.allMet).toBe(false);
  });
});

describe("candidateObjectiveCopy", () => {
  it("names the count against the grower's own bar", () => {
    const targets: BreedingObjectiveTarget[] = [
      { axisKey: "vigor", comparator: "gte", threshold: 4 },
      { axisKey: "stretch", comparator: "lte", threshold: 2 },
    ];
    expect(candidateObjectiveCopy(summarizeCandidateObjective([], {}))).toBe(BREEDING_OBJECTIVE_EMPTY_COPY);
    expect(candidateObjectiveCopy(summarizeCandidateObjective(targets, {}))).toMatch(
      /Not yet scored against any of the 2 targets/,
    );
    expect(candidateObjectiveCopy(summarizeCandidateObjective(targets, { vigor: 5, stretch: 1 }))).toBe(
      "Meets 2 of 2 targets you set.",
    );
    expect(candidateObjectiveCopy(summarizeCandidateObjective(targets, { vigor: 3, stretch: 1 }))).toBe(
      "Meets 1 of 2 targets you set.",
    );
    expect(candidateObjectiveCopy(summarizeCandidateObjective(targets, { vigor: 5 }))).toBe(
      "Meets 1 of 2 targets you set (1 not yet scored).",
    );
  });

  it("singular target phrasing", () => {
    const targets: BreedingObjectiveTarget[] = [{ axisKey: "vigor", comparator: "gte", threshold: 4 }];
    expect(candidateObjectiveCopy(summarizeCandidateObjective(targets, {}))).toBe(
      "Not yet scored against the target you set.",
    );
  });
});

describe("summarizeHuntObjectiveCoverage — counts only, never an ordering", () => {
  it("tallies fully-scored and all-met counts across candidates", () => {
    const targets: BreedingObjectiveTarget[] = [{ axisKey: "vigor", comparator: "gte", threshold: 4 }];
    const coverage = summarizeHuntObjectiveCoverage(targets, [
      { candidateId: "a", traits: { vigor: 5 } },
      { candidateId: "b", traits: { vigor: 2 } },
      { candidateId: "c", traits: {} },
    ]);
    expect(coverage).toEqual({
      targetCount: 1,
      candidatesTotal: 3,
      candidatesFullyScored: 2,
      candidatesMeetingAll: 1,
    });
  });

  it("returns only aggregate counts — no candidate list, no order, no ids surfaced", () => {
    const coverage = summarizeHuntObjectiveCoverage([], []);
    const keys = Object.keys(coverage).sort();
    expect(keys).toEqual(
      ["candidatesFullyScored", "candidatesMeetingAll", "candidatesTotal", "targetCount"].sort(),
    );
  });
});

describe("availableObjectiveAxes", () => {
  it("excludes axes already used by existing targets", () => {
    const existing: BreedingObjectiveTarget[] = [{ axisKey: "vigor", comparator: "gte", threshold: 3 }];
    const available = availableObjectiveAxes(existing);
    expect(available.some((a) => a.key === "vigor")).toBe(false);
    expect(available.length).toBe(LOUD_TRAIT_AXES.length - 1);
  });

  it("returns the full canonical catalog when nothing is set", () => {
    expect(availableObjectiveAxes([])).toEqual(LOUD_TRAIT_AXES);
  });
});

describe("static safety — module source (stricter than the standard pheno fence)", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../lib/phenoBreedingObjectiveRules.ts"),
    "utf8",
  );

  it("is pure: no I/O, React, Supabase, AI, or writes", () => {
    expect(src).not.toMatch(/from ["'][^"']*supabase/i);
    expect(src).not.toMatch(/from ["']react["']/);
    expect(src).not.toMatch(/\bfetch\(|\.rpc\(|functions\.invoke|\.insert\(|\.update\(|\.delete\(/);
    expect(src).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
    expect(src).not.toMatch(/openai|anthropic|claude|gemini/i);
  });

  it("never gestures at cross-candidate ranking, not just avoids 'winner'", () => {
    expect(src).not.toMatch(/\bwinner\b/i);
    expect(src).not.toMatch(/\bbest\b/i);
    expect(src).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(src).not.toMatch(/\btop[- ]?(scor|pick|candidate)/i);
    expect(src).not.toMatch(/\bscoreboard\b/i);
    expect(src).not.toMatch(/auto[-_ ]?(select|rank)/i);
    expect(src).not.toMatch(/\b(guaranteed|definitely|certain)\b/i);
  });

  it("no function signature accepts more than one candidate's traits for a scoring verdict", () => {
    // The only multi-candidate function is the coverage counter, and its
    // return type is asserted elsewhere to be counts-only.
    expect(src).toMatch(/summarizeHuntObjectiveCoverage/);
    expect(src).not.toMatch(/compareCandidates|rankCandidates|sortByScore|orderByMet/i);
  });

  it("reuses the canonical axis catalog instead of inventing one", () => {
    expect(src).toMatch(/from "@\/lib\/phenoExpressionRules"/);
    expect(src).toMatch(/LOUD_TRAIT_AXES/);
  });

  it("the caveat text names the grower's own bar, never a comparison to others", () => {
    expect(BREEDING_OBJECTIVE_CAVEAT).toMatch(/the bar you set/);
    expect(BREEDING_OBJECTIVE_CAVEAT).toMatch(/never to each other/);
  });
});
