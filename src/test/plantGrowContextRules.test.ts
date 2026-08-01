import { describe, it, expect } from "vitest";
import {
  getEffectivePlantGrowId,
  canRepairPlantGrowContextFromTent,
  buildPlantGrowContextRepairPayload,
  canAssignPlantToActiveGrow,
  buildPlantAssignToActiveGrowPayload,
  resolvePlantGrowRescue,
  validatePlantGrowContextForMerge,
  findPlantsMissingGrowContext,
} from "@/lib/plantGrowContextRules";

const tents = [
  { id: "tent-a", grow_id: "grow-1" },
  { id: "tent-b", grow_id: "grow-2" },
  { id: "tent-orphan", grow_id: null },
];

describe("plantGrowContextRules", () => {
  it("returns plant.grow_id when present", () => {
    expect(getEffectivePlantGrowId({ id: "p1", grow_id: "grow-9", tent_id: "tent-a" }, tents)).toBe(
      "grow-9",
    );
  });

  it("derives grow id from assigned tent when plant.grow_id is missing", () => {
    expect(getEffectivePlantGrowId({ id: "p1", grow_id: null, tent_id: "tent-a" }, tents)).toBe(
      "grow-1",
    );
  });

  it("returns null when neither plant.grow_id nor tent is available", () => {
    expect(getEffectivePlantGrowId({ id: "p1" }, tents)).toBeNull();
    expect(
      getEffectivePlantGrowId({ id: "p1", grow_id: null, tent_id: "tent-orphan" }, tents),
    ).toBeNull();
  });

  it("can repair only when tent has grow context and plant.grow_id is null", () => {
    expect(canRepairPlantGrowContextFromTent({ id: "p1", tent_id: "tent-a" }, tents)).toBe(true);
    expect(
      canRepairPlantGrowContextFromTent({ id: "p1", grow_id: "g", tent_id: "tent-a" }, tents),
    ).toBe(false);
    expect(canRepairPlantGrowContextFromTent({ id: "p1", tent_id: "tent-orphan" }, tents)).toBe(
      false,
    );
    expect(canRepairPlantGrowContextFromTent({ id: "p1" }, tents)).toBe(false);
  });

  it("repair payload only updates grow_id and nothing else", () => {
    const payload = buildPlantGrowContextRepairPayload({ id: "p1", tent_id: "tent-a" }, tents);
    expect(payload).toEqual({ grow_id: "grow-1" });
    expect(Object.keys(payload!)).toEqual(["grow_id"]);
  });

  it("repair payload is null when repair is not safe", () => {
    expect(buildPlantGrowContextRepairPayload({ id: "p1" }, tents)).toBeNull();
    expect(
      buildPlantGrowContextRepairPayload({ id: "p1", tent_id: "tent-orphan" }, tents),
    ).toBeNull();
  });

  it("can assign to active grow when plant has no grow and tent cannot repair", () => {
    expect(canAssignPlantToActiveGrow({ id: "p1" }, "grow-active", tents)).toBe(true);
    expect(
      canAssignPlantToActiveGrow({ id: "p1", tent_id: "tent-orphan" }, "grow-active", tents),
    ).toBe(true);
    expect(canAssignPlantToActiveGrow({ id: "p1", grow_id: "g" }, "grow-active", tents)).toBe(
      false,
    );
    expect(canAssignPlantToActiveGrow({ id: "p1" }, null, tents)).toBe(false);
  });

  it("prefers tent repair over active-grow assign when both possible", () => {
    expect(canAssignPlantToActiveGrow({ id: "p1", tent_id: "tent-a" }, "grow-active", tents)).toBe(
      false,
    );
    expect(
      buildPlantAssignToActiveGrowPayload({ id: "p1", tent_id: "tent-a" }, "grow-active", tents),
    ).toBeNull();
  });

  it("active-grow payload only updates grow_id", () => {
    const payload = buildPlantAssignToActiveGrowPayload({ id: "p1" }, "grow-active", tents);
    expect(payload).toEqual({ grow_id: "grow-active" });
    expect(Object.keys(payload!)).toEqual(["grow_id"]);
  });

  it("resolvePlantGrowRescue: already_ok when grow_id present", () => {
    const v = resolvePlantGrowRescue({
      plant: { id: "p1", grow_id: "g1" },
      activeGrowId: "g2",
    });
    expect(v.kind).toBe("already_ok");
    expect(v.payload).toBeNull();
  });

  it("resolvePlantGrowRescue: repair_from_tent when tent has grow", () => {
    const v = resolvePlantGrowRescue({
      plant: { id: "p1", tent_id: "tent-a" },
      tents,
      activeGrowId: "grow-active",
      activeGrowName: "Active",
      tentGrowName: "Grow One",
    });
    expect(v.kind).toBe("repair_from_tent");
    expect(v.payload).toEqual({ grow_id: "grow-1" });
    expect(v.ctaLabel).toMatch(/tent's grow/i);
  });

  it("resolvePlantGrowRescue: assign_active_grow when no tent grow", () => {
    const v = resolvePlantGrowRescue({
      plant: { id: "p1" },
      tents,
      activeGrowId: "grow-active",
      activeGrowName: "Active Setup",
    });
    expect(v.kind).toBe("assign_active_grow");
    expect(v.payload).toEqual({ grow_id: "grow-active" });
    expect(v.ctaLabel).toMatch(/Active Setup/);
  });

  it("resolvePlantGrowRescue: needs_grow when nothing available", () => {
    const v = resolvePlantGrowRescue({
      plant: { id: "p1" },
      tents,
      activeGrowId: null,
    });
    expect(v.kind).toBe("needs_grow");
    expect(v.payload).toBeNull();
    expect(v.secondaryHref).toBe("/grows");
  });

  it("merge validation allows same effective grow id", () => {
    const v = validatePlantGrowContextForMerge(
      { id: "s", tent_id: "tent-a" },
      { id: "t", grow_id: "grow-1" },
      tents,
    );
    expect(v.ok).toBe(true);
    expect(v.sourceEffectiveGrowId).toBe("grow-1");
    expect(v.targetEffectiveGrowId).toBe("grow-1");
  });

  it("merge validation blocks different effective grow ids", () => {
    const v = validatePlantGrowContextForMerge(
      { id: "s", tent_id: "tent-a" },
      { id: "t", tent_id: "tent-b" },
      tents,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/same grow/i);
  });

  it("merge validation blocks missing source grow context with friendly message", () => {
    const v = validatePlantGrowContextForMerge({ id: "s" }, { id: "t", grow_id: "grow-1" }, tents);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/missing grow context/i);
  });

  it("merge validation blocks missing target grow context", () => {
    const v = validatePlantGrowContextForMerge({ id: "s", grow_id: "grow-1" }, { id: "t" }, tents);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/target.*missing grow context/i);
  });

  it("merge validation requires a target", () => {
    const v = validatePlantGrowContextForMerge({ id: "s", grow_id: "grow-1" }, null, tents);
    expect(v.ok).toBe(false);
  });

  it("findPlantsMissingGrowContext returns plants without grow_id", () => {
    const missing = findPlantsMissingGrowContext([
      { id: "a", grow_id: "g" },
      { id: "b", grow_id: null },
      { id: "c" },
    ]);
    expect(missing.map((p) => p.id)).toEqual(["b", "c"]);
  });
});
