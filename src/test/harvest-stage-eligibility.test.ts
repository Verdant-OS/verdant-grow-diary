import { describe, expect, it } from "vitest";

import * as stageRules from "@/lib/quickLogStageDefaultRules";

type HarvestStageEligibility = {
  eligible: boolean;
  normalizedStage: string | null;
  reason: "eligible" | "early_stage" | "post_harvest" | "unknown_stage";
};

type EvaluateHarvestStageEligibility = (stage: unknown) => HarvestStageEligibility;

function evaluator(): EvaluateHarvestStageEligibility | undefined {
  return (
    stageRules as typeof stageRules & {
      evaluateHarvestStageEligibility?: EvaluateHarvestStageEligibility;
    }
  ).evaluateHarvestStageEligibility;
}

describe("harvest stage eligibility", () => {
  it("exports one canonical fail-closed stage evaluator", () => {
    expect(evaluator()).toBeTypeOf("function");
  });

  it("allows only active harvest-evidence stages", () => {
    const evaluate = evaluator();
    if (!evaluate) return;

    for (const stage of ["flower", "Flowering", "flush", "harvest"]) {
      expect(evaluate(stage)).toMatchObject({ eligible: true, reason: "eligible" });
    }
  });

  it("fails closed for early, missing, and unknown stages", () => {
    const evaluate = evaluator();
    if (!evaluate) return;

    expect(evaluate("seedling")).toMatchObject({
      eligible: false,
      normalizedStage: "seedling",
      reason: "early_stage",
    });
    expect(evaluate("veg")).toMatchObject({
      eligible: false,
      normalizedStage: "veg",
      reason: "early_stage",
    });
    expect(evaluate(null)).toMatchObject({
      eligible: false,
      normalizedStage: null,
      reason: "unknown_stage",
    });
    expect(evaluate("mystery")).toMatchObject({
      eligible: false,
      normalizedStage: null,
      reason: "unknown_stage",
    });
  });

  it("normalizes plant-side cure to canonical drying and treats it as post-harvest", () => {
    const evaluate = evaluator();
    if (!evaluate) return;

    expect(evaluate("cure")).toEqual({
      eligible: false,
      normalizedStage: "drying",
      reason: "post_harvest",
    });
    expect(evaluate("drying")).toEqual({
      eligible: false,
      normalizedStage: "drying",
      reason: "post_harvest",
    });
  });
});
