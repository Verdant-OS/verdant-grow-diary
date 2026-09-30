import { describe, expect, it } from "vitest";
import {
  resolveQuickLogPrefillTarget,
  resolveQuickLogWriteTarget,
} from "@/lib/quickLogTargetIntegrityRules";
import {
  legacyQuickLogEventRequiresTent,
  quickLogActivityRequiresTent,
} from "@/lib/quickLogTentRequirementRules";

const plant = { id: "p1", grow_id: "g1", tent_id: null };
const readyTarget = { status: "ready", target: { plantId: "p1", growId: "g1", tentId: null } };

describe("tentless plant target integrity", () => {
  it("requires explicit opt-in while preserving the old default", () => {
    const input = { activeGrowId: "g1", selectedPlant: plant, selectedTent: null };
    expect(resolveQuickLogWriteTarget(input)).toEqual({
      status: "blocked",
      reason: "plant_tent_unassigned",
    });
    expect(resolveQuickLogWriteTarget({ ...input, requireTent: false })).toEqual(readyTarget);
  });

  it("resolves a tentless route only from the stored plant and grow", () => {
    const input = {
      prefill: { plantId: "p1", growId: "g1" },
      plants: [plant],
      tents: [],
      requireTent: false,
    };
    const result = resolveQuickLogPrefillTarget(input);
    expect(result).toEqual(readyTarget);
    expect(resolveQuickLogPrefillTarget(input)).toEqual(result);
    expect(result.status === "ready" && Object.isFrozen(result.target)).toBe(true);
  });

  it.each([
    { prefill: { plantId: "p1", growId: "g2" }, reason: "prefill_grow_mismatch" },
    { prefill: { plantId: "p1", tentId: "t1" }, reason: "prefill_tent_mismatch" },
    { prefill: { plantId: "missing" }, reason: "plant_not_found" },
  ])("preserves $reason for a tentless route", ({ prefill, reason }) => {
    expect(resolveQuickLogPrefillTarget({ prefill, plants: [plant], requireTent: false })).toEqual({
      status: "blocked",
      reason,
    });
  });

  it.each([
    { selectedPlant: null, activeGrowId: "g1", reason: "missing_plant" },
    { selectedPlant: plant, activeGrowId: null, reason: "missing_active_grow" },
    {
      selectedPlant: { ...plant, grow_id: null },
      activeGrowId: "g1",
      reason: "plant_grow_unassigned",
    },
    {
      selectedPlant: { ...plant, is_archived: true },
      activeGrowId: "g1",
      reason: "plant_inactive",
    },
    { selectedPlant: plant, activeGrowId: "g2", reason: "active_grow_mismatch" },
  ])(
    "preserves $reason when tentless resolution is enabled",
    ({ selectedPlant, activeGrowId, reason }) => {
      expect(
        resolveQuickLogWriteTarget({ selectedPlant, activeGrowId, requireTent: false }),
      ).toEqual({ status: "blocked", reason });
    },
  );

  it("never invents a tent from a selected row", () => {
    expect(
      resolveQuickLogWriteTarget({
        selectedPlant: plant,
        activeGrowId: "g1",
        selectedTent: { id: "t1", grow_id: "g1" },
        requireTent: false,
      }),
    ).toEqual({ status: "blocked", reason: "selected_tent_mismatch" });
  });

  it("keeps the assigned tent's grow fence when opt-in is enabled", () => {
    expect(
      resolveQuickLogWriteTarget({
        selectedPlant: { ...plant, tent_id: "t1" },
        activeGrowId: "g1",
        selectedTent: { id: "t1", grow_id: "g2" },
        requireTent: false,
      }),
    ).toEqual({ status: "blocked", reason: "tent_grow_mismatch" });
  });
});

describe("Quick Log tent requirement allow-list", () => {
  it.each(["note", "photo", "issue_observation"] as const)(
    "allows current activity %s without a tent",
    (activityId) => {
      expect(quickLogActivityRequiresTent(activityId)).toBe(false);
    },
  );

  it.each([
    "watering",
    "feeding",
    "environment_check",
    "manual_sensor_snapshot",
    "training",
    "defoliation",
    "harvest",
  ] as const)(
    "requires a tent for current activity %s",
    (activityId) => {
      expect(quickLogActivityRequiresTent(activityId)).toBe(true);
    },
  );

  it.each([null, undefined, "", "future_activity"] as const)(
    "fails closed for unknown current activity %s",
    (activityId) => {
      expect(quickLogActivityRequiresTent(activityId as never)).toBe(true);
    },
  );

  it.each(["note", "photo", "observation"] as const)(
    "allows legacy event %s without a tent",
    (eventType) => {
      expect(legacyQuickLogEventRequiresTent(eventType)).toBe(false);
    },
  );

  it.each([
    "watering",
    "feeding",
    "environment",
    "training",
    "defoliation",
    "harvest",
    null,
    undefined,
    "",
    "future_event",
  ] as const)(
    "requires a tent for legacy event %s",
    (eventType) => {
      expect(legacyQuickLogEventRequiresTent(eventType)).toBe(true);
    },
  );
});
