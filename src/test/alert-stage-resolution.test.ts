/**
 * alert-stage-resolution — precedence contract for the stage that alert /
 * threshold surfaces evaluate VPD & environment targets against.
 *
 * Live audit bug #14: the Alerts surface used `grows.stage` alone, so a
 * grow the grower had advanced to Vegetative (visible on the tent badge)
 * still rendered "Alert context: Using Seedling targets". The resolver
 * combines the grow row with the grow's tents and the most advanced known
 * stage wins on disagreement — a trailing value is a stale creation
 * default, not a grower decision.
 */
import { describe, expect, it } from "vitest";

import { resolveAlertContextStage } from "@/lib/alertStageResolution";

describe("resolveAlertContextStage — precedence", () => {
  it("audit repro: veg grow with a lagging seedling tent resolves to veg", () => {
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: ["seedling"] }),
    ).toEqual({ stage: "veg", source: "grow" });
  });

  it("mirror case: seedling grow with a tent the grower advanced resolves to the tent stage", () => {
    expect(
      resolveAlertContextStage({ growStage: "seedling", tentStages: ["veg"] }),
    ).toEqual({ stage: "veg", source: "tent" });
  });

  it("agreement keeps the shared stage and credits the grow field", () => {
    expect(
      resolveAlertContextStage({ growStage: "flower", tentStages: ["flower"] }),
    ).toEqual({ stage: "flower", source: "grow" });
  });

  it("uses the tent stage when the grow stage is unknown", () => {
    expect(
      resolveAlertContextStage({ growStage: null, tentStages: ["flower"] }),
    ).toEqual({ stage: "flower", source: "tent" });
    expect(
      resolveAlertContextStage({ growStage: "definitely-not-a-stage", tentStages: ["veg"] }),
    ).toEqual({ stage: "veg", source: "tent" });
  });

  it("uses the grow stage when no tent stage is known", () => {
    expect(resolveAlertContextStage({ growStage: "veg", tentStages: [] })).toEqual({
      stage: "veg",
      source: "grow",
    });
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: [null, "", "??"] }),
    ).toEqual({ stage: "veg", source: "grow" });
    expect(resolveAlertContextStage({ growStage: "veg" })).toEqual({
      stage: "veg",
      source: "grow",
    });
  });

  it("returns null (never a guessed stage) when nothing is known", () => {
    expect(resolveAlertContextStage({})).toEqual({ stage: null, source: null });
    expect(
      resolveAlertContextStage({ growStage: "", tentStages: [undefined, "nope"] }),
    ).toEqual({ stage: null, source: null });
  });

  it("normalizes labels and aliases to canonical STAGES values", () => {
    // Human label form (as stored by some legacy rows).
    expect(
      resolveAlertContextStage({ growStage: "Vegetative", tentStages: ["Seedling"] }).stage,
    ).toBe("veg");
    // Plant-side alias: cure → drying.
    expect(resolveAlertContextStage({ growStage: "cure" }).stage).toBe("drying");
  });

  it("multi-tent disagreement resolves to the most advanced known stage", () => {
    expect(
      resolveAlertContextStage({
        growStage: "veg",
        tentStages: ["seedling", "flower", "veg"],
      }),
    ).toEqual({ stage: "flower", source: "tent" });
  });

  it("advances past flower when a later stage is set anywhere", () => {
    expect(
      resolveAlertContextStage({ growStage: "flower", tentStages: ["harvest"] }),
    ).toEqual({ stage: "harvest", source: "tent" });
    expect(
      resolveAlertContextStage({ growStage: "drying", tentStages: ["flower"] }),
    ).toEqual({ stage: "drying", source: "grow" });
  });
});
