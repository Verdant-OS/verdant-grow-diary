/**
 * Pheno selection rules — pure logic tests.
 *
 * Covers phenotype completeness tiers, timepoint/replication/post-cure
 * assessments, the comparability grade, and the never-overstate guards
 * (no health or winner/keeper language in any tool-generated label).
 */
import { describe, it, expect } from "vitest";
import {
  assessPostCure,
  assessReplication,
  assessTimepoint,
  buildSelectionEvidence,
  classifyPhenotype,
  containsSelectionOverclaim,
  deriveSelectionCaveats,
  gradeComparability,
  type ComparabilityCandidate,
  type PhenotypeInput,
  type SelectionStrength,
} from "@/lib/phenoSelectionRules";
import { containsHealthyStatusLanguage } from "@/lib/phenoComparisonRules";

const ALL_CORE: PhenotypeInput = {
  structure: { value: 4 },
  bud_density: { value: 4 },
  resin: { value: 5, note: "frosty" },
  aroma: { value: "gassy citrus" },
  vigor: { value: 4 },
  finish: { value: "58 days" },
};

// Same as ALL_CORE minus the core "finish" trait → partial, not strong.
const CORE_NO_FINISH: PhenotypeInput = {
  structure: { value: 4 },
  bud_density: { value: 4 },
  resin: { value: 5, note: "frosty" },
  aroma: { value: "gassy citrus" },
  vigor: { value: 4 },
};

function evidence(pheno: PhenotypeInput, cured: boolean) {
  return buildSelectionEvidence(classifyPhenotype(pheno), cured);
}

describe("classifyPhenotype", () => {
  it("marks recorded vs missing and counts core", () => {
    const cls = classifyPhenotype({ structure: { value: 4 }, aroma: { note: "sweet" } });
    expect(cls.traits.find((t) => t.key === "structure")?.recorded).toBe(true);
    expect(cls.traits.find((t) => t.key === "aroma")?.recorded).toBe(true);
    expect(cls.traits.find((t) => t.key === "resin")?.recorded).toBe(false);
    expect(cls.recordedCoreCount).toBe(2);
    expect(cls.missingCoreKeys).toContain("resin");
  });

  it("treats null / empty as not recorded", () => {
    const cls = classifyPhenotype({ resin: { value: null, note: "  " } });
    expect(cls.traits.find((t) => t.key === "resin")?.recorded).toBe(false);
  });
});

describe("selection strength", () => {
  it("strong = all core recorded AND cured", () => {
    expect(evidence(ALL_CORE, true).strength).toBe("strong");
  });
  it("partial = all core but not cured", () => {
    expect(evidence(ALL_CORE, false).strength).toBe("partial");
  });
  it("partial = missing a core trait", () => {
    expect(evidence(CORE_NO_FINISH, true).strength).toBe("partial");
  });
  it("thin = two or fewer core traits", () => {
    expect(evidence({ structure: { value: 3 }, vigor: { value: 3 } }, false).strength).toBe(
      "thin",
    );
  });
});

describe("assessTimepoint / assessReplication / assessPostCure", () => {
  it("timepoint known vs unknown", () => {
    expect(assessTimepoint({ dayOfFlower: 45 }).known).toBe(true);
    expect(assessTimepoint({ dayOfFlower: 45 }).label).toMatch(/day 45/i);
    expect(assessTimepoint({ dayOfFlower: null, stage: "flower" }).known).toBe(false);
  });

  it("degrades impossible (negative/non-finite) flower days to unknown", () => {
    expect(assessTimepoint({ dayOfFlower: -1 }).known).toBe(false);
    expect(assessTimepoint({ dayOfFlower: Number.NaN }).known).toBe(false);
    // Two invalid days must surface a timepoint gap, not fake alignment.
    const g = gradeComparability([
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: null, replicated: true, strength: "strong", cured: true },
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: null, replicated: true, strength: "strong", cured: true },
    ]);
    expect(g.verdict).toBe("not_comparable");
    expect(g.reasons.join(" ")).toMatch(/timepoint alignment can't be confirmed/i);
  });
  it("replication flags single specimen and unknown", () => {
    expect(assessReplication(3).replicated).toBe(true);
    expect(assessReplication(1).flagged).toBe(true);
    expect(assessReplication(1).label).toMatch(/single specimen/i);
    expect(assessReplication(null).flagged).toBe(true);
  });
  it("post-cure flags uncured", () => {
    expect(assessPostCure({ curedDays: 21 }).cured).toBe(true);
    expect(assessPostCure(null).flagged).toBe(true);
    expect(assessPostCure(null).label).toMatch(/not cured/i);
  });

  it("requires a full day — sub-day curedDays stays not cured", () => {
    const half = assessPostCure({ curedDays: 0.5 });
    expect(half.cured).toBe(false);
    expect(half.curedDays).toBeNull();
    expect(half.label).toMatch(/not cured/i);
    // Exactly one day is accepted.
    expect(assessPostCure({ curedDays: 1 }).cured).toBe(true);
  });
});

describe("deriveSelectionCaveats", () => {
  const base = {
    hasPhoto: true,
    phenotype: classifyPhenotype(ALL_CORE),
    selection: evidence(ALL_CORE, true),
    replication: assessReplication(3),
    timepoint: assessTimepoint({ dayOfFlower: 45 }),
    postCure: assessPostCure({ curedDays: 21 }),
  };

  it("no gaps when everything is present", () => {
    expect(deriveSelectionCaveats(base)).toEqual([]);
  });

  it("flags thin phenotype, single specimen, uncured, unknown timepoint, no photo", () => {
    const thin = classifyPhenotype({ structure: { value: 3 } });
    const caveats = deriveSelectionCaveats({
      hasPhoto: false,
      phenotype: thin,
      selection: buildSelectionEvidence(thin, false),
      replication: assessReplication(1),
      timepoint: assessTimepoint({ dayOfFlower: null }),
      postCure: assessPostCure(null),
    });
    const codes = caveats.map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "thin_phenotype",
        "not_cured",
        "single_specimen",
        "timepoint_unknown",
        "no_photo",
      ]),
    );
  });

  it("flags missing core traits when partial (not thin)", () => {
    const cls = classifyPhenotype(CORE_NO_FINISH);
    const caveats = deriveSelectionCaveats({
      hasPhoto: true,
      phenotype: cls,
      selection: buildSelectionEvidence(cls, true),
      replication: assessReplication(3),
      timepoint: assessTimepoint({ dayOfFlower: 45 }),
      postCure: assessPostCure({ curedDays: 21 }),
    });
    const missing = caveats.find((c) => c.code === "missing_phenotype");
    expect(missing?.copy).toMatch(/finish time/i);
  });
});

describe("gradeComparability", () => {
  const strong = (over: Partial<ComparabilityCandidate> = {}): ComparabilityCandidate => ({
    tentId: "tent-a",
    growId: "grow-1",
    tentName: "Tent A",
    growName: "G",
    medium: "coco",
    dayOfFlower: 45,
    replicated: true,
    strength: "strong" as SelectionStrength,
    cured: true,
    ...over,
  });

  it("fewer than two candidates → not comparable", () => {
    expect(gradeComparability([strong()]).verdict).toBe("not_comparable");
  });

  it("all matched → comparable", () => {
    const g = gradeComparability([strong(), strong({ dayOfFlower: 47 })]);
    expect(g.verdict).toBe("comparable");
  });

  it("different tents (by ID) → not comparable (environment confound)", () => {
    const g = gradeComparability([
      strong(),
      strong({ tentId: "tent-b", tentName: "Tent B" }),
    ]);
    expect(g.verdict).toBe("not_comparable");
    expect(g.reasons.join(" ")).toMatch(/different tents\/grows/i);
  });

  it("same display name but different IDs → not comparable (name collision)", () => {
    // Two "Tent A" / "G" runs that are actually different environments.
    const g = gradeComparability([
      strong(),
      strong({ tentId: "tent-b", growId: "grow-2" }),
    ]);
    expect(g.verdict).toBe("not_comparable");
  });

  it("same tent/grow but different media (coco vs hydro) → not comparable", () => {
    const g = gradeComparability([strong(), strong({ medium: "hydro" })]);
    expect(g.verdict).toBe("not_comparable");
    expect(g.reasons.join(" ")).toMatch(/different media|root-zone/i);
  });

  it("missing growing medium → comparable with caveats", () => {
    const g = gradeComparability([
      strong({ medium: null }),
      strong({ medium: null, dayOfFlower: 47 }),
    ]);
    expect(g.verdict).toBe("comparable_with_caveats");
    expect(g.reasons.join(" ")).toMatch(/growing medium is missing/i);
  });

  it("shared name without IDs cannot prove parity → comparable with caveats", () => {
    const g = gradeComparability([
      strong({ tentId: null, growId: null }),
      strong({ tentId: null, growId: null, dayOfFlower: 47 }),
    ]);
    expect(g.verdict).toBe("comparable_with_caveats");
    expect(g.reasons.join(" ")).toMatch(/environment identity can't be confirmed/i);
  });

  it("timepoints far apart → not comparable", () => {
    const g = gradeComparability([strong({ dayOfFlower: 40 }), strong({ dayOfFlower: 60 })]);
    expect(g.verdict).toBe("not_comparable");
    expect(g.reasons.join(" ")).toMatch(/different timepoints/i);
  });

  it("any thin record → not comparable", () => {
    const g = gradeComparability([strong(), strong({ strength: "thin" })]);
    expect(g.verdict).toBe("not_comparable");
  });

  it("single specimen (no hard confound) → comparable with caveats", () => {
    const g = gradeComparability([strong(), strong({ replicated: false })]);
    expect(g.verdict).toBe("comparable_with_caveats");
    expect(g.reasons.join(" ")).toMatch(/single specimen/i);
  });

  it("uncured (no hard confound) → comparable with caveats", () => {
    const g = gradeComparability([strong(), strong({ cured: false })]);
    expect(g.verdict).toBe("comparable_with_caveats");
  });

  it("missing tent/grow context can never read as fully comparable", () => {
    const g = gradeComparability([
      strong({ tentId: null, growId: null, tentName: null, growName: null }),
      strong({ tentId: null, growId: null, tentName: null, growName: null, dayOfFlower: 47 }),
    ]);
    expect(g.verdict).toBe("comparable_with_caveats");
    expect(g.reasons.join(" ")).toMatch(/environment identity can't be confirmed/i);
  });
});

describe("never overstates", () => {
  it("overclaim detector catches winner/keeper language", () => {
    expect(containsSelectionOverclaim("this is the clear winner")).toBe(true);
    expect(containsSelectionOverclaim("obvious keeper")).toBe(true);
    expect(containsSelectionOverclaim("Strong record")).toBe(false);
  });

  it("no tool-generated label reads as healthy or as a pick", () => {
    const labels: string[] = [];
    for (const s of ["strong", "partial", "thin"] as SelectionStrength[]) {
      labels.push(buildSelectionEvidence(classifyPhenotype(ALL_CORE), s === "strong").label);
    }
    labels.push(assessReplication(1).label, assessPostCure(null).label);
    const g1 = gradeComparability([
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: 45, replicated: true, strength: "strong", cured: true },
      { tentId: "tent-b", growId: "grow-g", tentName: "B", growName: "G", medium: "coco", dayOfFlower: 60, replicated: false, strength: "thin", cured: false },
    ]);
    const g2 = gradeComparability([
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: 45, replicated: true, strength: "strong", cured: true },
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: 47, replicated: true, strength: "strong", cured: true },
    ]);
    const all = [...labels, g1.label, ...g1.reasons, g2.label, ...g2.reasons];
    for (const text of all) {
      expect(containsSelectionOverclaim(text), `overclaim: ${text}`).toBe(false);
      expect(containsHealthyStatusLanguage(text), `health lang: ${text}`).toBe(false);
    }
  });

  it("is deterministic", () => {
    const cands: ComparabilityCandidate[] = [
      { tentId: "tent-a", growId: "grow-g", tentName: "A", growName: "G", medium: "coco", dayOfFlower: 45, replicated: true, strength: "strong", cured: true },
      { tentId: "tent-b", growId: "grow-g", tentName: "B", growName: "G", medium: "coco", dayOfFlower: 60, replicated: false, strength: "thin", cured: false },
    ];
    expect(gradeComparability(cands)).toEqual(gradeComparability(cands));
  });
});
