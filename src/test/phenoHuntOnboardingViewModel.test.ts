/**
 * phenoHuntOnboardingViewModel — pure guided-setup + readiness ladder tests.
 *
 * Pins the Key rule:
 *   Setup complete    = hunt created with goals/candidates.
 *   Ready for tracking = enough to start logging evidence.
 *   Comparison-ready  = enough evidence exists to compare candidates honestly.
 * Setup state alone must NEVER yield comparison_ready.
 */
import { describe, it, expect } from "vitest";
import {
  candidateHasEvidence,
  countCandidatesWithEvidence,
  deriveHuntReadiness,
  HUNT_READINESS_COPY,
  HUNT_READINESS_ORDER,
  PHENO_GOAL_MAX_LENGTH,
  validatePhenoHuntOnboardingDraft,
} from "@/lib/phenoHuntOnboardingViewModel";

describe("validatePhenoHuntOnboardingDraft", () => {
  const base = { name: "Hunt", goal: "Find the loudest gas pheno", plantIds: ["p1"] };

  it("accepts a complete draft", () => {
    expect(validatePhenoHuntOnboardingDraft(base, "g1")).toEqual([]);
  });

  it("requires name, grow, candidates, and goal", () => {
    const errs = validatePhenoHuntOnboardingDraft(
      { name: "  ", goal: "  ", plantIds: [] },
      null,
    );
    expect(errs).toContain("name_required");
    expect(errs).toContain("grow_required");
    expect(errs).toContain("no_candidates");
    expect(errs).toContain("goal_required");
  });

  it("rejects goals over the persisted column limit", () => {
    const errs = validatePhenoHuntOnboardingDraft(
      { ...base, goal: "x".repeat(PHENO_GOAL_MAX_LENGTH + 1) },
      "g1",
    );
    expect(errs).toEqual(["goal_too_long"]);
  });

  it("accepts a goal exactly at the limit", () => {
    const errs = validatePhenoHuntOnboardingDraft(
      { ...base, goal: "x".repeat(PHENO_GOAL_MAX_LENGTH) },
      "g1",
    );
    expect(errs).toEqual([]);
  });
});

describe("deriveHuntReadiness ladder", () => {
  it("is setup_incomplete with no candidates", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: true,
        candidateCount: 0,
        candidatesWithEvidence: 0,
      }),
    ).toBe("setup_incomplete");
  });

  it("is setup_complete when created with goal + candidates but unconfirmed", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: false,
        candidateCount: 3,
        candidatesWithEvidence: 0,
      }),
    ).toBe("setup_complete");
  });

  it("legacy hunts (no goal, backfilled confirmation) never regress below setup_complete", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: false,
        setupConfirmed: true,
        candidateCount: 1,
        candidatesWithEvidence: 0,
      }),
    ).toBe("ready_for_tracking");
  });

  it("confirmation moves setup_complete to ready_for_tracking", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: true,
        candidateCount: 2,
        candidatesWithEvidence: 0,
      }),
    ).toBe("ready_for_tracking");
  });

  it("evidence on a single candidate is NOT comparison_ready", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: true,
        candidateCount: 4,
        candidatesWithEvidence: 1,
      }),
    ).toBe("ready_for_tracking");
  });

  it("evidence on two candidates is comparison_ready", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: true,
        candidateCount: 4,
        candidatesWithEvidence: 2,
      }),
    ).toBe("comparison_ready");
  });

  it("a single-candidate hunt can never be comparison_ready", () => {
    expect(
      deriveHuntReadiness({
        hasGoal: true,
        setupConfirmed: true,
        candidateCount: 1,
        candidatesWithEvidence: 1,
      }),
    ).toBe("ready_for_tracking");
  });

  it("KEY RULE: setup state alone never yields comparison_ready", () => {
    for (const hasGoal of [true, false]) {
      for (const setupConfirmed of [true, false]) {
        for (const candidateCount of [0, 1, 2, 10]) {
          for (const candidatesWithEvidence of [0, 1]) {
            const stage = deriveHuntReadiness({
              hasGoal,
              setupConfirmed,
              candidateCount,
              candidatesWithEvidence,
            });
            expect(stage).not.toBe("comparison_ready");
          }
        }
      }
    }
  });

  it("order and copy cover every stage", () => {
    expect(HUNT_READINESS_ORDER).toHaveLength(4);
    for (const stage of HUNT_READINESS_ORDER) {
      expect(HUNT_READINESS_COPY[stage].label.length).toBeGreaterThan(0);
      expect(HUNT_READINESS_COPY[stage].description.length).toBeGreaterThan(0);
    }
  });
});

describe("candidate evidence signals", () => {
  it("each observation type counts as evidence", () => {
    expect(candidateHasEvidence("p1", { scoresByPlant: { p1: {} } })).toBe(true);
    expect(candidateHasEvidence("p1", { sexByPlant: { p1: {} } })).toBe(true);
    expect(candidateHasEvidence("p1", { smokeByPlant: { p1: {} } })).toBe(true);
    expect(candidateHasEvidence("p1", { labByKey: { "p1:coa": {} } })).toBe(true);
    expect(candidateHasEvidence("p1", { roundsByKey: { "p1:veg": {} } })).toBe(true);
  });

  it("no signals means no evidence, and other plants' evidence does not leak", () => {
    expect(candidateHasEvidence("p1", {})).toBe(false);
    expect(
      candidateHasEvidence("p1", {
        scoresByPlant: { p2: {} },
        labByKey: { "p2:coa": {} },
      }),
    ).toBe(false);
  });

  it("keeper decisions are NOT evidence (no decision signal exists)", () => {
    // The signals contract deliberately has no decisionsByPlant field:
    // deciding is a judgment about evidence, not a recorded observation.
    const signalKeys = [
      "scoresByPlant",
      "sexByPlant",
      "smokeByPlant",
      "labByKey",
      "roundsByKey",
    ];
    expect(signalKeys).not.toContain("decisionsByPlant");
    expect(
      candidateHasEvidence("p1", {
        // @ts-expect-error decisions must never count as evidence
        decisionsByPlant: { p1: { decision: "keep" } },
      }),
    ).toBe(false);
  });

  it("counts candidates with evidence across a roster", () => {
    expect(
      countCandidatesWithEvidence(["p1", "p2", "p3"], {
        scoresByPlant: { p1: {} },
        labByKey: { "p3:home": {} },
      }),
    ).toBe(2);
  });
});
