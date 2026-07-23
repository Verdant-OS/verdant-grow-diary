import { describe, expect, it } from "vitest";

import {
  bindQuickLogActivityDraft,
  buildQuickLogTargetIdentity,
  buildQuickLogTargetKey,
  evaluateQuickLogPrePersistenceGate,
  QUICK_LOG_TARGET_CHANGED_REASON,
  type QuickLogTargetIdentity,
} from "@/lib/quickLogActivityRules";

const targetA: QuickLogTargetIdentity = {
  growId: "grow-1",
  tentId: "tent-1",
  plantId: "plant-a",
};

describe("Quick Log target binding rules", () => {
  it("exports deterministic target identity, key, and draft-binding helpers", () => {
    expect(buildQuickLogTargetIdentity).toBeTypeOf("function");
    expect(buildQuickLogTargetKey).toBeTypeOf("function");
    expect(bindQuickLogActivityDraft).toBeTypeOf("function");
    expect(QUICK_LOG_TARGET_CHANGED_REASON).toBeTypeOf("string");
  });

  it("binds every activity draft to the exact selection-time target", () => {
    expect(bindQuickLogActivityDraft("harvest", targetA)).toEqual({
      activityId: "harvest",
      target: targetA,
      targetKey: buildQuickLogTargetKey(targetA),
    });
    expect(bindQuickLogActivityDraft("note", targetA)).toEqual({
      activityId: "note",
      target: targetA,
      targetKey: buildQuickLogTargetKey(targetA),
    });
  });

  it("normalizes null and partial targets deterministically", () => {
    expect(buildQuickLogTargetIdentity(null)).toEqual({
      growId: null,
      tentId: null,
      plantId: null,
    });
    expect(buildQuickLogTargetIdentity({ growId: "grow-1" })).toEqual({
      growId: "grow-1",
      tentId: null,
      plantId: null,
    });
    expect(buildQuickLogTargetKey({ growId: "grow-1" })).toBe(
      buildQuickLogTargetKey({
        growId: "grow-1",
        tentId: null,
        plantId: null,
      }),
    );
    expect(buildQuickLogTargetKey(targetA)).toBe(buildQuickLogTargetKey(targetA));
  });

  it.each([
    ["grow", { ...targetA, growId: "grow-2" }],
    ["tent", { ...targetA, tentId: "tent-2" }],
    ["plant", { ...targetA, plantId: "plant-b" }],
  ])("blocks a same-stage Harvest when the current %s changes", (_, currentTarget) => {
    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: "harvest",
        currentPlantStage: "flower",
        selectedTarget: targetA,
        currentTarget,
      }),
    ).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_TARGET_CHANGED_REASON,
    });
  });

  it("fails closed when no selection-time target binding exists", () => {
    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: "harvest",
        currentPlantStage: "flower",
        selectedTarget: null,
        currentTarget: targetA,
      }),
    ).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_TARGET_CHANGED_REASON,
    });
  });

  it("preserves eligible same-target Harvest persistence", () => {
    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: "harvest",
        currentPlantStage: "flower",
        selectedTarget: targetA,
        currentTarget: targetA,
      }),
    ).toEqual({ allowed: true, blockedReason: null });
  });

  it("treats equivalent partial targets as equal and partial mismatches as blocked", () => {
    const partialSelection = { growId: "grow-1", plantId: null };

    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: "note",
        selectedTarget: partialSelection,
        currentTarget: { growId: "grow-1", tentId: null },
      }),
    ).toEqual({ allowed: true, blockedReason: null });
    expect(
      evaluateQuickLogPrePersistenceGate({
        activityId: "note",
        selectedTarget: partialSelection,
        currentTarget: { growId: "grow-1", plantId: "plant-b" },
      }),
    ).toEqual({
      allowed: false,
      blockedReason: QUICK_LOG_TARGET_CHANGED_REASON,
    });
  });
});
