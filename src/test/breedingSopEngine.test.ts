import { describe, expect, it } from "vitest";
import {
  canAdvance,
  evaluateCandidate,
  getNextStep,
  getStep,
  rankCandidates,
  type CandidateScores,
} from "@/lib/breeding/breedingSopEngine";
import { BREEDING_SOP_STEPS } from "@/constants/breedingSopSteps";

const f1SelectStep = BREEDING_SOP_STEPS.find((s) => s.id === "f1_select")!;

const fullyMet: CandidateScores = {
  candidateId: "cand_a",
  scores: {
    yield: 0.9,
    resin: 0.85,
    disease_resistance: 0.8,
    aroma: 0.7,
    effects: 0.6,
    flowering_time: 0.5,
  },
  met: {
    yield: true,
    resin: true,
    disease_resistance: true,
  },
};

const partiallyMet: CandidateScores = {
  candidateId: "cand_b",
  scores: { yield: 0.9, resin: 0.9, disease_resistance: 0.9 },
  met: { yield: true, resin: true }, // missing disease_resistance
};

describe("breedingSopEngine — getStep / getNextStep", () => {
  it("returns null for unknown id and for null input", () => {
    expect(getStep(null)).toBeNull();
    expect(getStep("does_not_exist")).toBeNull();
  });

  it("returns the first step when currentId is null", () => {
    expect(getNextStep(null)?.id).toBe("p1_establish");
  });

  it("walks the DAG in order and returns null after the last step", () => {
    expect(getNextStep("p1_establish")?.id).toBe("f1_create");
    expect(getNextStep("stabilize")).toBeNull();
  });
});

describe("breedingSopEngine — evaluateCandidate", () => {
  it("returns zero score and unmet when inputs are missing", () => {
    const result = evaluateCandidate(null, null);
    expect(result.score).toBe(0);
    expect(result.meetsRequired).toBe(false);
  });

  it("computes a normalized weighted score in [0,1]", () => {
    const result = evaluateCandidate(f1SelectStep, fullyMet);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.meetsRequired).toBe(true);
    expect(result.missingCriteria).toHaveLength(0);
  });

  it("SAFETY: never reports meetsRequired when a required criterion is not explicitly met", () => {
    const result = evaluateCandidate(f1SelectStep, partiallyMet);
    expect(result.meetsRequired).toBe(false);
    expect(result.missingCriteria).toContain("disease_resistance");
  });

  it("clamps and ignores non-finite scores instead of throwing", () => {
    const noisy: CandidateScores = {
      candidateId: "noisy",
      scores: {
        yield: Number.POSITIVE_INFINITY,
        resin: -1,
        disease_resistance: Number.NaN,
      },
      met: { yield: true, resin: true, disease_resistance: true },
    };
    const result = evaluateCandidate(f1SelectStep, noisy);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("is deterministic across repeated calls", () => {
    const a = evaluateCandidate(f1SelectStep, fullyMet);
    const b = evaluateCandidate(f1SelectStep, fullyMet);
    expect(a).toEqual(b);
  });
});

describe("breedingSopEngine — rankCandidates", () => {
  it("returns [] for empty input", () => {
    expect(rankCandidates(f1SelectStep, [])).toEqual([]);
    expect(rankCandidates(f1SelectStep, null)).toEqual([]);
  });

  it("ranks meetsRequired ahead of higher-scoring but unmet candidates", () => {
    const ranked = rankCandidates(f1SelectStep, [partiallyMet, fullyMet]);
    expect(ranked[0]?.candidateId).toBe("cand_a");
    expect(ranked[0]?.meetsRequired).toBe(true);
    expect(ranked[1]?.candidateId).toBe("cand_b");
  });

  it("uses evidenceCount then candidateId as deterministic tie-breakers", () => {
    const base: Omit<CandidateScores, "candidateId" | "evidenceCount"> = {
      scores: { yield: 0.8, resin: 0.8, disease_resistance: 0.8 },
      met: { yield: true, resin: true, disease_resistance: true },
    };
    const ranked = rankCandidates(f1SelectStep, [
      { ...base, candidateId: "b_low_evidence", evidenceCount: 1 },
      { ...base, candidateId: "a_low_evidence", evidenceCount: 1 },
      { ...base, candidateId: "c_high_evidence", evidenceCount: 5 },
    ]);
    expect(ranked.map((r) => r.candidateId)).toEqual([
      "c_high_evidence",
      "a_low_evidence",
      "b_low_evidence",
    ]);
  });
});

describe("breedingSopEngine — canAdvance", () => {
  it("SAFETY: refuses to advance when no candidate is selected", () => {
    const result = canAdvance(f1SelectStep, [], [fullyMet]);
    expect(result.canAdvance).toBe(false);
    expect(result.reasons.join("|")).toMatch(/at least one/i);
  });

  it("SAFETY: refuses when a required criterion is not met", () => {
    const result = canAdvance(f1SelectStep, ["cand_b"], [partiallyMet]);
    expect(result.canAdvance).toBe(false);
    expect(result.reasons.some((r) => r.includes("disease_resistance"))).toBe(true);
  });

  it("SAFETY: refuses when the selected id does not exist in the candidate pool", () => {
    const result = canAdvance(f1SelectStep, ["ghost"], [fullyMet]);
    expect(result.canAdvance).toBe(false);
    expect(result.reasons.some((r) => r.includes("ghost"))).toBe(true);
  });

  it("allows advance when every selected candidate meets required criteria", () => {
    const result = canAdvance(f1SelectStep, ["cand_a"], [fullyMet]);
    expect(result.canAdvance).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("SAFETY: refuses when the step is unknown", () => {
    const result = canAdvance(null, ["cand_a"], [fullyMet]);
    expect(result.canAdvance).toBe(false);
  });
});
