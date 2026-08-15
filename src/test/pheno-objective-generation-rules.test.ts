/**
 * phenoObjectiveGenerationRules — pure cross-generation objective progress.
 *
 * Covers chain walking (incl. the cycle + depth guards the DB cannot enforce),
 * per-axis scored/met counts, trend direction, the refusal to compare an axis
 * the earlier generation never scored, and a static-safety scan that the
 * module stays descriptive — never causal, predictive, or a ranking.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildGenerationChain,
  buildGenerationProgress,
  GENERATION_PROGRESS_CAVEAT,
  MAX_GENERATION_CHAIN,
  type GenerationHuntInput,
} from "@/lib/phenoObjectiveGenerationRules";
import type { BreedingObjectiveTarget } from "@/lib/phenoBreedingObjectiveRules";

const NOSE_TARGET: BreedingObjectiveTarget = {
  axisKey: "nose_loudness",
  comparator: "gte",
  threshold: 7,
};

function hunt(
  huntId: string,
  parentHuntId: string | null,
  candidates: Array<Record<string, number> | null>,
  targets: BreedingObjectiveTarget[] = [NOSE_TARGET],
  generationLabel: string | null = null,
): GenerationHuntInput {
  return {
    huntId,
    huntName: `Hunt ${huntId}`,
    generationLabel,
    parentHuntId,
    targets,
    candidates: candidates.map((traits) => ({ traits })),
  };
}

describe("buildGenerationChain", () => {
  it("walks parents into an oldest-first chain", () => {
    const byId = {
      f1: hunt("f1", null, []),
      f2: hunt("f2", "f1", []),
      f3: hunt("f3", "f2", []),
    };
    expect(buildGenerationChain("f3", byId).map((h) => h.huntId)).toEqual(["f1", "f2", "f3"]);
  });

  it("breaks a multi-hop cycle the database cannot reject (A→B→A)", () => {
    const byId = { a: hunt("a", "b", []), b: hunt("b", "a", []) };
    const chain = buildGenerationChain("a", byId);
    // Terminates, and never repeats a hunt.
    expect(chain.map((h) => h.huntId).sort()).toEqual(["a", "b"]);
  });

  it("bounds the walk at MAX_GENERATION_CHAIN", () => {
    const byId: Record<string, GenerationHuntInput> = {};
    for (let i = 0; i < 20; i += 1) {
      byId[`h${i}`] = hunt(`h${i}`, i === 0 ? null : `h${i - 1}`, []);
    }
    expect(buildGenerationChain("h19", byId).length).toBe(MAX_GENERATION_CHAIN);
  });

  it("stops cleanly on a missing or unreadable parent", () => {
    const byId = { f2: hunt("f2", "gone", []) };
    expect(buildGenerationChain("f2", byId).map((h) => h.huntId)).toEqual(["f2"]);
    expect(buildGenerationChain("nope", byId)).toEqual([]);
  });
});

describe("buildGenerationProgress", () => {
  it("counts scored and met per axis, per generation", () => {
    const f1 = hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 4 }, null]);
    const model = buildGenerationProgress([f1]);
    const axis = model.generations[0].axes[0];
    expect(axis.scoredCount).toBe(2); // the unscored candidate is not counted
    expect(axis.metCount).toBe(1);
    expect(axis.metShare).toBe(0.5);
    // A single generation is never "comparable".
    expect(model.comparable).toBe(false);
    expect(model.trends).toEqual([]);
  });

  it("reports a larger share honestly, without claiming the line improved", () => {
    const f1 = hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 4 }]);
    const f2 = hunt("f2", "f1", [{ nose_loudness: 8 }, { nose_loudness: 9 }]);
    const model = buildGenerationProgress([f1, f2]);
    expect(model.comparable).toBe(true);
    const trend = model.trends[0];
    expect(trend.direction).toBe("larger_share");
    expect(trend.earlierShare).toBe(0.5);
    expect(trend.latestShare).toBe(1);
    expect(trend.detail).toMatch(
      /100% of the 2 scored this generation met your bar, against 50% of 2 before/,
    );
    expect(trend.detail).toMatch(/not proof the line improved/i);
  });

  it("reports a smaller share plainly", () => {
    const f1 = hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 9 }]);
    const f2 = hunt("f2", "f1", [{ nose_loudness: 2 }, { nose_loudness: 3 }]);
    const trend = buildGenerationProgress([f1, f2]).trends[0];
    expect(trend.direction).toBe("smaller_share");
    expect(trend.detail).toMatch(/smaller share met the bar/i);
  });

  it("reports an unchanged share", () => {
    const f1 = hunt("f1", null, [{ nose_loudness: 8 }, { nose_loudness: 4 }]);
    const f2 = hunt("f2", "f1", [{ nose_loudness: 9 }, { nose_loudness: 3 }]);
    expect(buildGenerationProgress([f1, f2]).trends[0].direction).toBe("unchanged");
  });

  it("refuses to trend an axis the earlier generation never scored (no false jump)", () => {
    const f1 = hunt("f1", null, [null, null]); // nothing scored
    const f2 = hunt("f2", "f1", [{ nose_loudness: 9 }]);
    const model = buildGenerationProgress([f1, f2]);
    const trend = model.trends[0];
    expect(trend.direction).toBe("not_comparable");
    expect(trend.earlierShare).toBeNull();
    expect(trend.detail).toMatch(/not enough scored candidates in both generations/i);
    expect(model.comparable).toBe(false);
  });

  it("treats an unscored axis as not-yet-scored, never as 0% met", () => {
    const f1 = hunt("f1", null, [null]);
    const axis = buildGenerationProgress([f1]).generations[0].axes[0];
    expect(axis.metShare).toBeNull();
    expect(axis.metCount).toBe(0);
    expect(axis.scoredCount).toBe(0);
  });

  it("honors an lte target (lower is better) the same way", () => {
    const target: BreedingObjectiveTarget = { axisKey: "stretch", comparator: "lte", threshold: 2 };
    const f1 = hunt("f1", null, [{ stretch: 4 }, { stretch: 1 }], [target]);
    const axis = buildGenerationProgress([f1]).generations[0].axes[0];
    expect(axis.scoredCount).toBe(2);
    expect(axis.metCount).toBe(1);
  });

  it("is null-safe on malformed input", () => {
    expect(buildGenerationProgress([]).generations).toEqual([]);
    expect(buildGenerationProgress(null as unknown as GenerationHuntInput[]).generations).toEqual(
      [],
    );
    const noTargets = hunt("f1", null, [{ nose_loudness: 8 }], []);
    expect(buildGenerationProgress([noTargets]).generations[0].axes).toEqual([]);
  });
});

describe("static safety — generation rules source", () => {
  const rawSrc = readFileSync(
    path.resolve(__dirname, "../lib/phenoObjectiveGenerationRules.ts"),
    "utf8",
  );
  // Strip comments (repo convention), THEN the exported disclaimer constants.
  // Those constants exist precisely to say "never proof", "never a forecast" —
  // the banned words appear there under negation, doing the honest work. The
  // fence protects CLAIMS the module makes about the grower's data, so it is
  // scoped to the logic; the disclaimers get their own explicit assertions
  // below, so nothing goes unchecked.
  const code = rawSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/export const GENERATION_PROGRESS_[A-Z_]+\s*=\s*[\s\S]*?;/g, "");

  it("is pure: no I/O, React, Supabase, AI, writes, or clock", () => {
    expect(rawSrc).not.toMatch(/from ["'][^"']*supabase/i);
    expect(rawSrc).not.toMatch(/from ["']react["']/);
    expect(rawSrc).not.toMatch(/\bfetch\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
    expect(rawSrc).not.toMatch(/\bnew Date\(|Date\.now\(|Math\.random\(/);
  });

  it("stays descriptive — never causal, predictive, or a ranking", () => {
    expect(code).not.toMatch(/\bwinner\b/i);
    expect(code).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(code).not.toMatch(/\bbest\b/i);
    expect(code).not.toMatch(/\bimproving\b|\bimproved the line\b/i);
    expect(code).not.toMatch(/\bpredict|\bforecast|\bwill (?:be|hold|improve)\b/i);
    expect(code).not.toMatch(/\bguaranteed\b|\bproven\b/i);
  });

  it("the caveat disclaims causation and prediction explicitly", () => {
    expect(GENERATION_PROGRESS_CAVEAT).toMatch(/never proof the line improved/i);
    expect(GENERATION_PROGRESS_CAVEAT).toMatch(/never a forecast/i);
  });

  it("reuses the single objective evaluator rather than a divergent copy", () => {
    expect(rawSrc).toMatch(/from "@\/lib\/phenoBreedingObjectiveRules"/);
    expect(rawSrc).toMatch(/summarizeCandidateObjective/);
  });
});
