import { describe, expect, it } from "vitest";

import type { QuickLogActivityId } from "@/constants/quickLogActivityTypes";
import type { HarvestStageEligibility } from "@/lib/quickLogStageDefaultRules";
import * as activityRules from "@/lib/quickLogActivityRules";

interface PickerItem {
  activity: { id: QuickLogActivityId };
  disabled: boolean;
  disabledReason: string | null;
  harvestEligibility: HarvestStageEligibility | null;
}

interface PickerViewModel {
  primaryActivities: PickerItem[];
  additionalActivities: PickerItem[];
}

type BuildPickerViewModel = (input: {
  plantStage?: unknown;
  hiddenIds?: readonly QuickLogActivityId[];
}) => PickerViewModel;

function builder(): BuildPickerViewModel | undefined {
  return (
    activityRules as typeof activityRules & {
      buildQuickLogActivityPickerViewModel?: BuildPickerViewModel;
    }
  ).buildQuickLogActivityPickerViewModel;
}

function stageDisabledReason(): string | undefined {
  return (
    activityRules as typeof activityRules & {
      QUICK_LOG_HARVEST_STAGE_DISABLED_REASON?: string;
    }
  ).QUICK_LOG_HARVEST_STAGE_DISABLED_REASON;
}

function harvestFor(stage: unknown) {
  const build = builder();
  if (!build) return null;
  const view = build({ plantStage: stage });
  const harvest = view.additionalActivities.find((item) => item.activity.id === "harvest");
  expect(harvest).toBeDefined();
  return harvest ?? null;
}

describe("Quick Log activity picker rules", () => {
  it("exports one pure picker view-model builder", () => {
    expect(builder()).toBeTypeOf("function");
    expect(stageDisabledReason()).toBeTypeOf("string");
  });

  it("classifies primary and additional activities in stable product order", () => {
    const build = builder();
    if (!build) return;
    const view = build({ plantStage: "flower" });

    expect(view.primaryActivities.map((item) => item.activity.id)).toEqual([
      "note",
      "photo",
      "watering",
      "feeding",
      "environment_check",
      "issue_observation",
    ]);
    expect(view.additionalActivities.map((item) => item.activity.id)).toEqual([
      "training",
      "defoliation",
      "manual_sensor_snapshot",
      "harvest",
    ]);
  });

  it.each([
    ["seedling", "seedling"],
    ["veg", "veg"],
    ["Vegetative", "veg"],
    ["unknown", null],
    ["", null],
    [null, null],
    [undefined, null],
    ["drying", "drying"],
    ["cure", "drying"],
    ["Curing", "drying"],
  ])("fails harvest closed for stage %s", (stage, normalizedStage) => {
    const harvest = harvestFor(stage);
    if (!harvest) return;

    expect(harvest.disabled).toBe(true);
    expect(harvest.disabledReason).toBe(stageDisabledReason());
    expect(harvest.harvestEligibility).toMatchObject({
      eligible: false,
      normalizedStage,
    });
  });

  it.each([
    ["flower", "flower"],
    ["Flowering", "flower"],
    [" FLUSH ", "flush"],
    ["harvest", "harvest"],
  ])("enables harvest for canonical or aliased stage %s", (stage, normalizedStage) => {
    const harvest = harvestFor(stage);
    if (!harvest) return;

    expect(harvest.disabled).toBe(false);
    expect(harvest.disabledReason).toBeNull();
    expect(harvest.harvestEligibility).toEqual({
      eligible: true,
      normalizedStage,
      reason: "eligible",
    });
  });

  it("is deterministic and null-safe for untrusted context", () => {
    const build = builder();
    if (!build) return;
    const input = { plantStage: { stage: "flower" } };

    expect(build(input)).toEqual(build(input));
    expect(() =>
      build({
        plantStage: Symbol("untrusted"),
        hiddenIds: ["photo", "harvest"],
      }),
    ).not.toThrow();
    expect(
      build({
        plantStage: null,
        hiddenIds: ["photo", "harvest"],
      }),
    ).toMatchObject({
      primaryActivities: expect.not.arrayContaining([
        expect.objectContaining({ activity: expect.objectContaining({ id: "photo" }) }),
      ]),
      additionalActivities: expect.not.arrayContaining([
        expect.objectContaining({ activity: expect.objectContaining({ id: "harvest" }) }),
      ]),
    });
  });
});
