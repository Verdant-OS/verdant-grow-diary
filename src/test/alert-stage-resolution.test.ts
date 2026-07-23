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

  it("mixed-stage tents abstain — the grow row's declared stage governs", () => {
    // A grow deliberately running tents at different stages has no single
    // tent truth; behavior matches the pre-resolver code (grow row wins).
    expect(
      resolveAlertContextStage({
        growStage: "veg",
        tentStages: ["seedling", "flower", "veg"],
      }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "grow" });
    // Disagreeing tents with an unknown grow resolve to null, same as before.
    expect(
      resolveAlertContextStage({ growStage: null, tentStages: ["veg", "flower"] }),
    ).toEqual({ stage: null, normalizedStage: "unknown", source: null });
    // Agreement across vocab forms still counts as consensus.
    expect(
      resolveAlertContextStage({
        growStage: "seedling",
        tentStages: ["veg", "Vegetative"],
      }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "tent" });
  });

  it("harvest cap: a leftover harvest/cure tent cannot switch off an active grow's banding", () => {
    // Reused-tent repro (adversarial review): GrowLineageRepair repoints
    // tents.grow_id without resetting stage, so an active veg grow can
    // hold a tent still staged cure/harvest. The grow row's live decision
    // keeps governing — stage-band alerts stay on.
    expect(
      resolveAlertContextStage({ growStage: "veg", tentStages: ["cure"] }),
    ).toEqual({ stage: "veg", normalizedStage: "veg", source: "grow" });
    expect(
      resolveAlertContextStage({ growStage: "flower", tentStages: ["harvest"] }),
    ).toEqual({ stage: "flower", normalizedStage: "flower", source: "grow" });
    // Closing out is the grow row's call: a harvest-stage grow governs...
    expect(
      resolveAlertContextStage({ growStage: "drying", tentStages: ["flower"] }),
    ).toEqual({ stage: "drying", normalizedStage: "harvest", source: "grow" });
    // ...and with no grow signal at all, an agreeing harvest tent stands.
    expect(
      resolveAlertContextStage({ growStage: null, tentStages: ["harvest"] }),
    ).toEqual({ stage: "harvest", normalizedStage: "harvest", source: "tent" });
  });
});
