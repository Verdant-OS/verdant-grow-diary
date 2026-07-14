/**
 * pheno-candidate-readiness — the pure, stage-aware evidence-readiness model.
 * Covers the stage matrix (early → cured), trust filtering, freshness (injected
 * now), null/malformed inputs, determinism, and the candidate-input mapper.
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePhenoCandidateReadiness,
  readinessEvidenceFromCandidateInput,
  PHENO_READINESS_LABELS,
  type PhenoReadinessEvidence,
} from "@/lib/phenoCandidateReadiness";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

function base(overrides: Partial<PhenoReadinessEvidence> = {}): PhenoReadinessEvidence {
  return {
    candidateId: "p1",
    candidateNumber: 1,
    candidateLabel: "Sour Zebra",
    plantLabel: "Plant One",
    stage: "flower",
    quickLogCount: 2,
    photoCount: 1,
    hasTraitScore: true,
    hasAromaNote: true,
    sexObserved: true,
    ...overrides,
  };
}

describe("evaluatePhenoCandidateReadiness — stage matrix", () => {
  it("a fully documented FLOWER candidate is comparison_ready", () => {
    const r = evaluatePhenoCandidateReadiness(base({ stage: "flower" }));
    expect(r.readiness).toBe("comparison_ready");
    // harvest/cure goals are not yet applicable at flower — not counted missing
    expect(r.missingGoals).not.toContain("harvest");
    expect(r.missingGoals).not.toContain("post_cure");
    expect(r.nextEvidenceTarget).toBeNull();
  });

  it("an early SEEDLING with only foundational evidence is partial, never comparison_ready", () => {
    const r = evaluatePhenoCandidateReadiness({
      candidateId: "s1",
      candidateLabel: "Seedling A",
      stage: "seedling",
      quickLogCount: 1,
    });
    expect(r.readiness).toBe("partial");
    // late-stage goals must NOT be flagged missing on a seedling
    expect(r.missingGoals).not.toContain("aroma");
    expect(r.missingGoals).not.toContain("harvest");
    expect(r.missingGoals).not.toContain("post_cure");
  });

  it("missing late-stage evidence never penalises an early plant (selectedGoalCount grows with stage)", () => {
    const seedling = evaluatePhenoCandidateReadiness(base({ stage: "seedling" }));
    const flower = evaluatePhenoCandidateReadiness(base({ stage: "flower" }));
    const cured = evaluatePhenoCandidateReadiness(base({ stage: "cured" }));
    expect(seedling.selectedGoalCount).toBeLessThan(flower.selectedGoalCount);
    expect(flower.selectedGoalCount).toBeLessThan(cured.selectedGoalCount);
  });

  it("a FLOWER candidate missing aroma+sex is partial with aroma as the next target", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "flower", hasAromaNote: false, sexObserved: false }),
    );
    expect(r.readiness).toBe("partial");
    expect(r.missingGoals).toContain("aroma");
    expect(r.missingGoals).toContain("sex");
    // aroma comes before sex in progression order
    expect(r.nextEvidenceTarget?.goalId).toBe("aroma");
    expect(r.nextEvidenceTarget?.anchor).toBe("phenotype-notes");
  });

  it("no identity AND no observation → insufficient", () => {
    const r = evaluatePhenoCandidateReadiness({
      candidateId: "x",
      candidateNumber: null,
      candidateLabel: null,
      plantLabel: null,
      stage: "flower",
    });
    expect(r.readiness).toBe("insufficient");
    expect(r.missingGoals).toContain("identity");
    expect(r.missingGoals).toContain("observation");
  });

  it("a CURED candidate needs the post-cure smoke test to be comparison_ready", () => {
    const withoutSmoke = evaluatePhenoCandidateReadiness(
      base({
        stage: "cured",
        hasHarvestEvidence: true,
        hasPostHarvestNote: true,
        keeperDecision: "keep",
        keeperRationale: "gassy, dense",
        hasPostCureSmokeTest: false,
      }),
    );
    expect(withoutSmoke.readiness).toBe("partial");
    expect(withoutSmoke.missingGoals).toContain("post_cure");
    expect(withoutSmoke.nextEvidenceTarget?.goalId).toBe("post_cure");

    const withSmoke = evaluatePhenoCandidateReadiness(
      base({
        stage: "cured",
        hasHarvestEvidence: true,
        hasPostHarvestNote: true,
        keeperDecision: "keep",
        keeperRationale: "gassy, dense",
        hasPostCureSmokeTest: true,
      }),
    );
    expect(withSmoke.readiness).toBe("comparison_ready");
  });

  it("keeper decision 'undecided' does not complete the keeper goal", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({
        stage: "harvest",
        hasHarvestEvidence: true,
        hasPostHarvestNote: true,
        keeperDecision: "undecided",
      }),
    );
    expect(r.missingGoals).toContain("keeper_decision");
  });
});

describe("evaluatePhenoCandidateReadiness — trustworthy evidence", () => {
  it("untrusted sensors do not complete sensor_context and raise a caution", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "flower", trustedSensorSnapshotCount: 0, untrustedSensorPresent: true }),
    );
    expect(r.completedGoals).not.toContain("sensor_context");
    expect(r.cautionReasons.some((c) => /demo \/ stale \/ invalid/i.test(c))).toBe(true);
  });

  it("a trusted sensor completes sensor_context with no untrusted caution", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "flower", trustedSensorSnapshotCount: 1, untrustedSensorPresent: false }),
    );
    expect(r.completedGoals).toContain("sensor_context");
    expect(r.cautionReasons.some((c) => /demo \/ stale/i.test(c))).toBe(false);
  });

  it("a lab estimate is flagged as not a COA (provenance honesty)", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "cured", hasLabResult: true, labSource: "estimate" }),
    );
    expect(r.cautionReasons.some((c) => /estimate, not a lab COA/i.test(c))).toBe(true);
  });

  it("unknown stage raises a caution and assumes early stage", () => {
    const r = evaluatePhenoCandidateReadiness(base({ stage: null }));
    expect(r.cautionReasons.some((c) => /stage is not recorded/i.test(c))).toBe(true);
  });

  it("keeper decision without rationale is flagged as weaker evidence", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "harvest", keeperDecision: "cull", keeperRationale: null }),
    );
    expect(r.cautionReasons.some((c) => /without a rationale/i.test(c))).toBe(true);
  });
});

describe("evaluatePhenoCandidateReadiness — freshness (injected now)", () => {
  it("does NOT read the clock without options.now", () => {
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "flower", latestObservationAt: "2000-01-01T00:00:00Z" }),
    );
    expect(r.cautionReasons.some((c) => /No observation recorded/i.test(c))).toBe(false);
  });

  it("flags a stale pre-harvest candidate when now is injected", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "flower", latestObservationAt: "2026-01-01T00:00:00Z" }),
      { now },
    );
    expect(
      r.cautionReasons.some((c) => /No observation recorded in the last \d+ days/.test(c)),
    ).toBe(true);
  });

  it("does not flag staleness on a post-harvest candidate", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const r = evaluatePhenoCandidateReadiness(
      base({ stage: "cured", latestObservationAt: "2026-01-01T00:00:00Z" }),
      { now },
    );
    expect(r.cautionReasons.some((c) => /No observation recorded/i.test(c))).toBe(false);
  });
});

describe("evaluatePhenoCandidateReadiness — null-safety & determinism", () => {
  it("handles a nearly empty candidate without throwing", () => {
    const r = evaluatePhenoCandidateReadiness({ candidateId: "z" });
    expect(r.readiness).toBe("insufficient");
    expect(r.completedGoalCount).toBe(0);
    expect(Array.isArray(r.goals)).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const input = base({
      stage: "cured",
      hasPostCureSmokeTest: true,
      hasHarvestEvidence: true,
      hasPostHarvestNote: true,
      keeperDecision: "keep",
      keeperRationale: "x",
    });
    expect(evaluatePhenoCandidateReadiness(input)).toEqual(evaluatePhenoCandidateReadiness(input));
  });

  it("tolerates malformed numeric/string fields", () => {
    const r = evaluatePhenoCandidateReadiness({
      candidateId: "m",
      candidateNumber: -3 as unknown as number,
      quickLogCount: Number.NaN,
      photoCount: -1,
      stage: "  ",
      candidateLabel: "   ",
      plantLabel: "Named",
    });
    // negative/NaN counts read as zero; blank label falls back to plantLabel
    expect(r.completedGoals).toContain("identity");
    expect(r.missingGoals).toContain("observation");
  });

  it("exposes readiness labels with no ranking/winner language", () => {
    const values = Object.values(PHENO_READINESS_LABELS).join(" ").toLowerCase();
    expect(values).not.toMatch(/winner|best|rank|keeper pick/);
  });
});

describe("readinessEvidenceFromCandidateInput — mapper", () => {
  function candidate(overrides: Partial<PhenoCandidateInput> = {}): PhenoCandidateInput {
    return {
      candidateId: "p1",
      candidateNumber: 4,
      candidateLabel: "Blue Zebra",
      plantLabel: "Plant 1",
      stage: "flower",
      quickLogEntries: [{ id: "q1", at: "2026-01-01T00:00:00Z" }],
      photos: [{ id: "ph1", url: "u" }],
      sensorSnapshots: [],
      ...overrides,
    };
  }

  it("counts only trusted sensor snapshots and flags untrusted ones", () => {
    const e = readinessEvidenceFromCandidateInput(
      candidate({
        sensorSnapshots: [
          { id: "s1", source: "demo" },
          { id: "s2", source: "live" },
          { id: "s3", source: "stale" },
        ],
      }),
    );
    expect(e.trustedSensorSnapshotCount).toBe(1);
    expect(e.untrustedSensorPresent).toBe(true);
  });

  it("derives aroma/trait/smoke/lab from candidate.expression", () => {
    const e = readinessEvidenceFromCandidateInput(
      candidate({
        expression: {
          traits: [{ key: "nose_loudness", value: 8 }],
          aromaDescriptors: ["gas"],
          noseNote: null,
          smokeTest: {
            flavorDescriptors: ["gas"],
            effectDescriptors: [],
            smoothness: null,
            potencyImpression: null,
            verdict: "keep",
          },
          labResult: {
            thcPct: 20,
            cbdPct: null,
            totalCannabinoidsPct: null,
            dominantTerpenes: [],
            source: "coa",
          },
        },
      }),
    );
    expect(e.hasTraitScore).toBe(true);
    expect(e.hasAromaNote).toBe(true);
    expect(e.hasPostCureSmokeTest).toBe(true);
    expect(e.hasLabResult).toBe(true);
    expect(e.labSource).toBe("coa");
  });

  it("extras win over expression-derived signals", () => {
    const e = readinessEvidenceFromCandidateInput(candidate(), {
      sexObserved: true,
      keeperDecision: "keep",
      keeperRationale: "dense",
      hasHarvestEvidence: true,
    });
    expect(e.sexObserved).toBe(true);
    expect(e.keeperDecision).toBe("keep");
    expect(e.hasHarvestEvidence).toBe(true);
  });

  it("round-trips through evaluate() to a real readiness result", () => {
    const e = readinessEvidenceFromCandidateInput(candidate(), {
      hasTraitScore: true,
      sexObserved: true,
    });
    const withAroma = { ...e, hasAromaNote: true };
    const r = evaluatePhenoCandidateReadiness(withAroma);
    expect(r.readiness).toBe("comparison_ready");
  });
});
