import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { QuickLogActivityId } from "@/constants/quickLogActivityTypes";
import {
  evaluateQuickLogPrePersistenceGate,
  QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
} from "@/lib/quickLogActivityRules";

function evaluateHarvest(currentPlantStage: unknown) {
  return evaluateQuickLogPrePersistenceGate({
    activityId: "harvest",
    currentPlantStage,
  });
}

describe("Quick Log Harvest pre-persistence gate", () => {
  it("exports a typed pure gate", () => {
    expect(evaluateQuickLogPrePersistenceGate).toBeTypeOf("function");
  });

  it.each(["flower", "flush", "harvest"])(
    "allows an eligible %s-stage Harvest",
    (currentPlantStage) => {
      expect(evaluateHarvest(currentPlantStage)).toEqual({
        allowed: true,
        blockedReason: null,
      });
    },
  );

  it("blocks an ineligible Harvest before persistence", () => {
    expect(evaluateHarvest("seedling")).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
    });
  });

  it("fails closed when the current plant stage is null", () => {
    expect(evaluateHarvest(null)).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
    });
  });

  it("fails closed during cure", () => {
    expect(evaluateHarvest("cure")).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
    });
  });

  it("uses current context when an eligible selection becomes stale", () => {
    const selectedActivityId: QuickLogActivityId = "harvest";

    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: selectedActivityId,
        currentPlantStage: "flower",
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: selectedActivityId,
        currentPlantStage: "seedling",
      }),
    ).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
    });
  });

  it("pins handleSave to the pre-persistence gate before the save hook", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/QuickLogAllActivitiesSection.tsx"),
      "utf8",
    );
    const handleSave = source.slice(
      source.indexOf("const handleSave"),
      source.indexOf("const noContext"),
    );
    const gateCallIndex = handleSave.indexOf("evaluateQuickLogPrePersistenceGate({");
    const saveCallIndex = handleSave.indexOf("await save({");

    expect(gateCallIndex).toBeGreaterThanOrEqual(0);
    expect(saveCallIndex).toBeGreaterThan(gateCallIndex);
    expect(handleSave).toMatch(
      /if \(!persistenceGate\.allowed\) \{[\s\S]*?return;[\s\S]*?await save\(\{/,
    );
  });
});
