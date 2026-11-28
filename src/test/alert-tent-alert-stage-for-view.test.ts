/**
 * Reviewer C on #3021, round 3: the Tent Alerts staleness note compares an
 * open alert with the stage its tent's alerts are judged by now, never with
 * one plant's own stage. In a Veg tent that also holds a Flower plant the
 * plant vote abstains, so Veg governs and a fresh Veg-range alert is current.
 */
import { describe, expect, it } from "vitest";
import { assessAlertStageStaleness } from "@/lib/alertStageStalenessRules";
import { resolveTentAlertStageForView } from "@/lib/alertSnapshotStageScopeRules";

const VEG_VPD = "VPD is above the veg target range. Observed 1.4 kPa (veg range 0.8–1.2 kPa).";
const SEEDLING_VPD =
  "VPD is above the seedling target range. Observed 1.3 kPa (seedling range 0.4–0.8 kPa).";

const GROW = "11111111-1111-4111-8111-111111111111";
const VEG_TENT = "22222222-2222-4222-8222-222222222222";
const FLOWER_TENT = "33333333-3333-4333-8333-333333333333";

/** Veg grow; a Veg tent holding one Flower and one Veg plant; a Flower tent. */
const TENTS = [
  { id: VEG_TENT, stage: "veg" },
  { id: FLOWER_TENT, stage: "flower" },
];
const PLANTS = [
  { grow_id: GROW, tent_id: VEG_TENT, stage: "flower" },
  { grow_id: GROW, tent_id: VEG_TENT, stage: "veg" },
  { grow_id: GROW, tent_id: FLOWER_TENT, stage: "flower" },
];

describe("resolveTentAlertStageForView", () => {
  it("mixed Veg tent with a Flower plant: the tent's alerts use Veg", () => {
    const stage = resolveTentAlertStageForView({
      growId: GROW,
      growRow: { stage: "veg" },
      tentId: VEG_TENT,
      tents: TENTS,
      plants: PLANTS,
    });
    expect(stage).toBe("veg");
    // So a fresh Veg-range alert is current for the Flower plant in that tent.
    expect(assessAlertStageStaleness({ reason: VEG_VPD, currentStage: stage }).stale).toBe(false);
    // The old comparison with the Flower plant's own stage was the bug.
    expect(assessAlertStageStaleness({ reason: VEG_VPD, currentStage: "flower" }).stale).toBe(true);
  });

  it("a tent that moved on still labels an alert from its old stage", () => {
    const stage = resolveTentAlertStageForView({
      growId: GROW,
      growRow: { stage: "veg" },
      tentId: FLOWER_TENT,
      tents: TENTS,
      plants: PLANTS,
    });
    expect(stage).toBe("flower");
    expect(assessAlertStageStaleness({ reason: SEEDLING_VPD, currentStage: stage }).note).toBe(
      "Checked against Seedling targets. This tent's alerts now use Flower targets, so this alert may no longer apply.",
    );
  });

  it("never guesses: missing grow row, pending reads or a tent outside the grow give null", () => {
    const base = {
      growId: GROW,
      growRow: { stage: "veg" },
      tentId: FLOWER_TENT,
      tents: TENTS,
      plants: PLANTS,
    };
    expect(resolveTentAlertStageForView({ ...base, growRow: null })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, tents: null })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, plants: null })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, plants: undefined })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, tentId: "elsewhere" })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, tentId: null })).toBeNull();
    expect(resolveTentAlertStageForView({ ...base, growId: " " })).toBeNull();
  });
});
