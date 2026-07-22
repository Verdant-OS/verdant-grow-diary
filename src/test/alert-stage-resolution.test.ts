/**
 * alert-stage-resolution — precedence contract for the stage that alert /
 * threshold surfaces evaluate VPD & environment targets against.
 *
 * Live audit bug #14: the Alerts surface used `grows.stage` alone, so a
 * grow the grower had advanced to Vegetative (visible on the tent badge)
 * still rendered "Alert context: Using Seedling targets". The resolver
 * combines the grow row with the grow's tents; candidates are classified
 * with the live `normalizeVpdStage` alias table, the most advanced known
 * stage wins on disagreement, and the winner is returned as the field's
 * RAW stored value so downstream classifiers see exactly the token they
 * always received.
 */
import { describe, expect, it } from "vitest";

import { resolveAlertContextStage } from "@/lib/alertStageResolution";

describe("resolveAlertContextStage — precedence", () => {
  it("audit repro: veg grow with a lagging seedling tent resolves to veg", () => {
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: ["seedling"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "grow" });
  });

  it("mirror case: seedling grow with a tent the grower advanced resolves to the tent stage", () => {
    expect(
      resolveAlertContextStage({ growStage: "seedling", tentStages: ["veg"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "tent" });
  });

  it("agreement keeps the shared stage and credits the grow field", () => {
    expect(
      resolveAlertContextStage({ growStage: "flower", tentStages: ["flower"] }),
    ).toEqual({ stage: "flower", normalizedStage: "flower", source: "grow" });
  });

  it("rank ties keep the grow's own raw value (historical primacy)", () => {
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: ["vegetative"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "grow" });
  });

  it("uses the tent stage when the grow stage is unknown or unrecognized", () => {
    expect(
      resolveAlertContextStage({ growStage: null, tentStages: ["flower"] }),
    ).toEqual({ stage: "flower", normalizedStage: "flower", source: "tent" });
    expect(
      resolveAlertContextStage({ growStage: "definitely-not-a-stage", tentStages: ["veg"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "tent" });
  });

  it("uses the grow stage when no tent stage is known", () => {
    expect(resolveAlertContextStage({ growStage: "veg", tentStages: [] })).toEqual({
      stage: "veg",
      normalizedStage: "veg",
      source: "grow",
    });
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: [null, "", "??"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "grow" });
    expect(resolveAlertContextStage({ growStage: "veg" })).toEqual({
      stage: "veg",
      normalizedStage: "veg",
      source: "grow",
    });
  });

  it("returns null (never a guessed stage) when nothing is recognized", () => {
    expect(resolveAlertContextStage({})).toEqual({
      stage: null,
      normalizedStage: "unknown",
      source: null,
    });
    expect(
      resolveAlertContextStage({ growStage: "", tentStages: [undefined, "nope"] }),
    ).toEqual({ stage: null, normalizedStage: "unknown", source: null });
  });

  it("keeps the winner's RAW stored value for label-form fields", () => {
    // Downstream classifiers and header copy receive the stored token
    // exactly as the pre-resolver code passed it.
    expect(
      resolveAlertContextStage({ growStage: "Vegetative", tentStages: ["Seedling"] }),
    ).toEqual({ stage: "Vegetative", normalizedStage: "veg", source: "grow" });
  });

  it("recognizes the classifiers' legacy alias vocabulary (no drop regression)", () => {
    // These tokens are unknown to the six-value grow STAGES select but are
    // fully classified by normalizeVpdStage — the resolver must not drop
    // them to null (they classified before this helper existed).
    expect(resolveAlertContextStage({ growStage: "transition" })).toEqual({
      stage: "transition",
      normalizedStage: "preflower",
      source: "grow",
    });
    expect(resolveAlertContextStage({ growStage: "bloom" })).toEqual({
      stage: "bloom",
      normalizedStage: "flower",
      source: "grow",
    });
    expect(resolveAlertContextStage({ growStage: "flush" })).toEqual({
      stage: "flush",
      normalizedStage: "late_flower",
      source: "grow",
    });
    expect(resolveAlertContextStage({ growStage: "curing" })).toEqual({
      stage: "curing",
      normalizedStage: "harvest",
      source: "grow",
    });
    // A legacy preflower grow with a lagging seedling tent stays preflower.
    expect(
      resolveAlertContextStage({ growStage: "preflower", tentStages: ["seedling"] }),
    ).toEqual({ stage: "preflower", normalizedStage: "preflower", source: "grow" });
  });

  it("multi-tent disagreement resolves to the most advanced known stage", () => {
    expect(
      resolveAlertContextStage({
        growStage: "veg",
        tentStages: ["seedling", "flower", "veg"],
      }),
    ).toEqual({ stage: "flower", normalizedStage: "flower", source: "tent" });
  });

  it("advances past flower when a later stage is set anywhere", () => {
    expect(
      resolveAlertContextStage({ growStage: "flower", tentStages: ["harvest"] }),
    ).toEqual({ stage: "harvest", normalizedStage: "harvest", source: "tent" });
    expect(
      resolveAlertContextStage({ growStage: "drying", tentStages: ["flower"] }),
    ).toEqual({ stage: "drying", normalizedStage: "harvest", source: "grow" });
  });
});
