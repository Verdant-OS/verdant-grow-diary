/**
 * Pure unit tests for Quick Log pheno evidence handoff resolution.
 * Closes the #547 seed path: prefill.phenoHuntId must drive hunt context
 * even when plants.pheno_hunt_id is missing on the loaded plant row.
 */
import { describe, expect, it } from "vitest";
import {
  resolveQuickLogPhenoGoalSeed,
  resolveQuickLogPhenoHuntId,
} from "@/lib/quickLogPhenoEvidenceHandoffRules";

describe("resolveQuickLogPhenoHuntId", () => {
  it("prefers the handoff hunt when the selected plant matches the prefill plant", () => {
    expect(
      resolveQuickLogPhenoHuntId({
        plantHuntId: null,
        prefillHuntId: "hunt-1",
        prefillPlantId: "plant-a",
        selectedPlantId: "plant-a",
      }),
    ).toBe("hunt-1");
  });

  it("uses plant row hunt when there is no matching handoff", () => {
    expect(
      resolveQuickLogPhenoHuntId({
        plantHuntId: "hunt-row",
        prefillHuntId: "hunt-1",
        prefillPlantId: "plant-a",
        selectedPlantId: "plant-b",
      }),
    ).toBe("hunt-row");
  });

  it("returns null when neither handoff nor plant row has a hunt", () => {
    expect(
      resolveQuickLogPhenoHuntId({
        plantHuntId: "",
        prefillHuntId: null,
        prefillPlantId: "plant-a",
        selectedPlantId: "plant-a",
      }),
    ).toBeNull();
  });

  it("does not invent a hunt from a prefill for a different plant", () => {
    expect(
      resolveQuickLogPhenoHuntId({
        plantHuntId: null,
        prefillHuntId: "hunt-1",
        prefillPlantId: "plant-a",
        selectedPlantId: "plant-other",
      }),
    ).toBeNull();
  });
});

describe("resolveQuickLogPhenoGoalSeed", () => {
  const ready = {
    open: true,
    alreadyConsumed: false,
    prefillGoalId: "vigor",
    prefillHuntId: "hunt-1",
    prefillPlantId: "plant-a",
    selectedPlantId: "plant-a",
    resolvedHuntId: "hunt-1",
    contextStatus: "ready",
    contextHuntId: "hunt-1",
    configuredGoalIds: ["structure", "vigor", "aroma"] as const,
  };

  it("seeds the exact goal the grower clicked when context is ready", () => {
    expect(resolveQuickLogPhenoGoalSeed(ready)).toEqual({
      action: "seed",
      goalId: "vigor",
    });
  });

  it("does not re-seed after the handoff was consumed", () => {
    expect(resolveQuickLogPhenoGoalSeed({ ...ready, alreadyConsumed: true })).toEqual({
      action: "none",
    });
  });

  it("fails closed when the goal is not in configured goals", () => {
    expect(
      resolveQuickLogPhenoGoalSeed({
        ...ready,
        prefillGoalId: "yield",
        configuredGoalIds: ["structure", "vigor"],
      }),
    ).toEqual({ action: "none" });
  });

  it("fails closed when context is still loading", () => {
    expect(
      resolveQuickLogPhenoGoalSeed({
        ...ready,
        contextStatus: "loading",
      }),
    ).toEqual({ action: "none" });
  });

  it("fails closed when plant or hunt mismatch", () => {
    expect(
      resolveQuickLogPhenoGoalSeed({
        ...ready,
        selectedPlantId: "plant-other",
      }),
    ).toEqual({ action: "none" });
    expect(
      resolveQuickLogPhenoGoalSeed({
        ...ready,
        resolvedHuntId: "hunt-other",
      }),
    ).toEqual({ action: "none" });
  });
});
