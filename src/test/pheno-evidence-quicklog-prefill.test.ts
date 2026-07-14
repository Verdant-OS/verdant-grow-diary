import { describe, it, expect } from "vitest";
import { buildPhenoEvidenceGoalQuickLogPrefill } from "@/lib/phenoEvidenceQuickLogPrefill";

const BASE = {
  huntId: "hunt-1",
  plantId: "plant-a",
  plantName: "Alpha",
  growId: "g1",
  tentId: "t1",
  goalId: "aroma",
  configuredGoals: ["structure", "aroma"],
};

describe("buildPhenoEvidenceGoalQuickLogPrefill", () => {
  it("builds a prefill for the exact clicked goal", () => {
    const p = buildPhenoEvidenceGoalQuickLogPrefill(BASE);
    expect(p).toMatchObject({
      plantId: "plant-a",
      phenoHuntId: "hunt-1",
      phenoEvidenceGoal: "aroma",
      eventType: "observation",
      source: "pheno-evidence-goal",
      suggestSnapshot: true,
    });
  });

  it("does not require a tent (snapshot suggestion off without one)", () => {
    const p = buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, tentId: null });
    expect(p).not.toBeNull();
    expect(p!.tentId).toBeNull();
    expect(p!.suggestSnapshot).toBe(false);
  });

  it("fails closed when the goal is not currently configured for the hunt", () => {
    expect(
      buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, configuredGoals: ["structure"] }),
    ).toBeNull();
    expect(
      buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, goalId: "not_a_goal" }),
    ).toBeNull();
    expect(
      buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, configuredGoals: "garbage" }),
    ).toBeNull();
  });

  it("fails closed on missing hunt/plant/goal ids", () => {
    expect(buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, huntId: " " })).toBeNull();
    expect(buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, plantId: null })).toBeNull();
    expect(buildPhenoEvidenceGoalQuickLogPrefill({ ...BASE, goalId: undefined })).toBeNull();
  });

  it("never invents a goal: output goal always equals the clicked goal", () => {
    const p = buildPhenoEvidenceGoalQuickLogPrefill(BASE);
    expect(p!.phenoEvidenceGoal).toBe(BASE.goalId);
  });
});
