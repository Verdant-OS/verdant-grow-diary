import { describe, it, expect } from "vitest";
import {
  buildPhenoExpressionView,
  assessCohortComparability,
  LOUD_TRAIT_AXES,
  PHENO_HERM_SUGGEST_CAVEAT,
  type PhenoExpressionInput,
} from "@/lib/phenoExpressionRules";

describe("LOUD_TRAIT_AXES", () => {
  it("has nose loudness as a 0-10 intensity axis and 1-5 quality axes", () => {
    const nose = LOUD_TRAIT_AXES.find((a) => a.key === "nose_loudness");
    expect(nose).toMatchObject({ min: 0, max: 10, kind: "intensity" });
    expect(LOUD_TRAIT_AXES.find((a) => a.key === "trichome_coverage")).toMatchObject({
      min: 1,
      max: 5,
      kind: "quality",
    });
  });
});

describe("buildPhenoExpressionView", () => {
  it("returns null when there is no expression input", () => {
    expect(buildPhenoExpressionView("c1", null)).toBeNull();
    expect(buildPhenoExpressionView("c1", undefined)).toBeNull();
  });

  it("keeps valid trait scores in canonical axis order and flags invalid/unknown keys", () => {
    const e = buildPhenoExpressionView("c1", {
      traits: [
        { key: "yield_impression", value: 4 },
        { key: "nose_loudness", value: 10 },
        { key: "vigor", value: 9 }, // out of 1-5 range → invalid
        { key: "mystery", value: 3 }, // not an axis → unknown
      ],
    })!;
    // nose_loudness sorts first (canonical order), yield later.
    expect(e.traits.map((t) => t.key)).toEqual(["nose_loudness", "yield_impression"]);
    expect(e.invalidTraitKeys).toContain("vigor");
    expect(e.unknownTraitKeys).toContain("mystery");
  });

  it("accepts nose loudness up to 10 but rejects 11", () => {
    expect(
      buildPhenoExpressionView("c1", { traits: [{ key: "nose_loudness", value: 10 }] })!.traits,
    ).toHaveLength(1);
    expect(
      buildPhenoExpressionView("c1", { traits: [{ key: "nose_loudness", value: 11 }] })!
        .invalidTraitKeys,
    ).toEqual(["nose_loudness"]);
  });

  it("partitions aroma descriptors into known vocabulary and unknown tags", () => {
    const e = buildPhenoExpressionView("c1", {
      aromaDescriptors: ["Gas", "gas", "funk", "spaceship"],
    })!;
    // dedupe + lowercase; known first, unknown after
    expect(e.aromaDescriptors).toEqual(["gas", "funk", "spaceship"]);
    expect(e.unknownAromaDescriptors).toEqual(["spaceship"]);
  });

  it("builds a post-cure smoke test and clamps out-of-range 1-5 fields", () => {
    const e = buildPhenoExpressionView("c1", {
      smokeTest: {
        flavorDescriptors: ["gas", "pepper"],
        effectDescriptors: ["couchlock"],
        smoothness: 9, // out of range → null
        potencyImpression: 5,
        verdict: "keeper",
      },
    })!;
    expect(e.smokeTest).toMatchObject({
      smoothness: null,
      potencyImpression: 5,
      verdict: "keeper",
      hasContent: true,
    });
    expect(e.smokeTest!.flavorDescriptors).toEqual(["gas", "pepper"]);
  });

  it("attaches COA lab data with a source tag and lab-verified marker", () => {
    const e = buildPhenoExpressionView("c1", {
      labResult: {
        thcPct: 28.4,
        dominantTerpenes: [{ name: "caryophyllene", pct: 0.9 }, { name: "" }],
        source: "coa",
      },
    })!;
    expect(e.labResult).toMatchObject({ thcPct: 28.4, source: "coa", labVerified: true });
    // blank terpene name dropped
    expect(e.labResult!.dominantTerpenes.map((t) => t.name)).toEqual(["caryophyllene"]);
    // an estimate is NOT lab-verified
    const est = buildPhenoExpressionView("c1", { labResult: { thcPct: 20, source: "estimate" } })!;
    expect(est.labResult).toMatchObject({ source: "estimate", labVerified: false });
    // no numbers → no lab view at all (never fabricated)
    expect(buildPhenoExpressionView("c1", { labResult: { source: "coa" } })!.labResult).toBeNull();
  });

  it("normalizes sex and, for a herm, surfaces a SUGGEST-ONLY consider-removing action", () => {
    const herm = buildPhenoExpressionView("c1", {
      sex: "hermaphrodite",
      hermObserved: true,
      hermNote: "nanners wk6",
    })!;
    expect(herm.sex).toBe("hermaphrodite");
    expect(herm.herm).toMatchObject({
      observed: true,
      action: "consider_removing",
      note: "nanners wk6",
    });
    expect(herm.herm.caveat).toBe(PHENO_HERM_SUGGEST_CAVEAT);
    expect(herm.herm.caveat.toLowerCase()).toContain("never removes a plant for you");
    // no herm observed → no action
    const fem = buildPhenoExpressionView("c1", { sex: "female" })!;
    expect(fem.herm).toMatchObject({ observed: false, action: null });
  });

  it("flags every kind of missing expression data honestly", () => {
    const bare = buildPhenoExpressionView("c1", { round: "veg" })!;
    const codes = bare.missing.map((m) => m.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "no_traits_scored",
        "no_nose",
        "no_smoke_test",
        "no_lab_result",
        "sex_unknown",
      ]),
    );
    expect(bare.hasAnyExpression).toBe(false);
  });

  it("marks hasAnyExpression true when any real expression exists", () => {
    expect(buildPhenoExpressionView("c1", { aromaDescriptors: ["gas"] })!.hasAnyExpression).toBe(
      true,
    );
  });
});

describe("assessCohortComparability (apples-to-apples)", () => {
  const m = (candidateId: string, growLabel: string | null, tentLabel: string | null) => ({
    candidateId,
    growLabel,
    tentLabel,
  });

  it("no warning when all share the same grow and tent", () => {
    const c = assessCohortComparability([m("a", "G", "T"), m("b", "G", "T")]);
    expect(c.sameGrow).toBe(true);
    expect(c.sameTent).toBe(true);
    expect(c.warning).toBeNull();
  });

  it("warns (grow-level) when candidates span different grows", () => {
    const c = assessCohortComparability([m("a", "G1", "T"), m("b", "G2", "T")]);
    expect(c.sameGrow).toBe(false);
    expect(c.warning).toMatch(/different grows/i);
  });

  it("warns (tent-level) when same grow but different tents", () => {
    const c = assessCohortComparability([m("a", "G", "T1"), m("b", "G", "T2")]);
    expect(c.sameGrow).toBe(true);
    expect(c.sameTent).toBe(false);
    expect(c.warning).toMatch(/different tents/i);
  });

  it("does not warn when context is unknown, and handles empty input", () => {
    expect(assessCohortComparability([m("a", null, null), m("b", null, null)]).warning).toBeNull();
    expect(assessCohortComparability(null).warning).toBeNull();
    expect(assessCohortComparability([]).sameGrow).toBe(true);
  });
});
