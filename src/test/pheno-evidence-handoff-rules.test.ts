import { describe, it, expect } from "vitest";
import { resolvePhenoEvidenceHandoff } from "@/lib/phenoEvidenceHandoffRules";
import type { QuickLogTargetPlant, QuickLogTargetTent } from "@/lib/quickLogTargetIntegrityRules";

const PREFILL = {
  huntId: "hunt-1",
  plantId: "plant-a",
  plantName: "Alpha",
  growId: "grow-1",
  tentId: null as string | null,
  goalId: "structure",
  configuredGoals: ["structure", "vigor", "aroma"],
};

const plant = (partial: Partial<QuickLogTargetPlant> & { id: string }): QuickLogTargetPlant => ({
  id: partial.id,
  grow_id: partial.grow_id ?? null,
  tent_id: partial.tent_id ?? null,
  is_archived: partial.is_archived ?? false,
  archived_at: partial.archived_at ?? null,
  merged_into_plant_id: partial.merged_into_plant_id ?? null,
});

const tent = (partial: Partial<QuickLogTargetTent> & { id: string }): QuickLogTargetTent => ({
  id: partial.id,
  grow_id: partial.grow_id ?? null,
  is_archived: partial.is_archived ?? false,
  archived_at: partial.archived_at ?? null,
});

describe("resolvePhenoEvidenceHandoff", () => {
  it("stays pending while the catalog loads (no active-grow guess)", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "pending",
      plants: [],
      tents: [],
      prefillInput: PREFILL,
    });
    expect(d.kind).toBe("pending");
  });

  it("catalog error offers retry and is not labeled missing setup", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "error",
      plants: null,
      tents: null,
      prefillInput: PREFILL,
    });
    expect(d.kind).toBe("catalog_error");
    if (d.kind !== "catalog_error") return;
    expect(d.cta.kind).toBe("retry_catalog");
    expect(d.description.toLowerCase()).toMatch(/retry/);
    expect(d.description.toLowerCase()).not.toMatch(/assign this plant to a tent first/);
  });

  it("blocks tentless plants without opening a ready handoff", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "ready",
      plants: [plant({ id: "plant-a", grow_id: "grow-1", tent_id: null })],
      tents: [tent({ id: "tent-1", grow_id: "grow-1" })],
      prefillInput: PREFILL,
    });
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") return;
    expect(d.reason).toBe("plant_tent_unassigned");
    expect(d.cta.kind).toBe("assign_tent");
    expect(d.cta.href).toBe("/plants/plant-a");
  });

  it("blocks archived tent as unavailable (not invent another tent)", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "ready",
      plants: [plant({ id: "plant-a", grow_id: "grow-1", tent_id: "tent-1" })],
      // Active catalog omits archived tents → tent_not_found
      tents: [],
      prefillInput: { ...PREFILL, tentId: "tent-1" },
    });
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") return;
    expect(d.reason).toBe("tent_not_found");
    expect(d.cta.kind).toBe("open_plant");
  });

  it("blocks tent/grow mismatch without active-grow fallback", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "ready",
      plants: [plant({ id: "plant-a", grow_id: "grow-1", tent_id: "tent-1" })],
      tents: [tent({ id: "tent-1", grow_id: "grow-OTHER" })],
      prefillInput: PREFILL,
    });
    expect(d.kind).toBe("blocked");
    if (d.kind !== "blocked") return;
    expect(d.reason).toBe("tent_grow_mismatch");
  });

  it("opens ready handoff with exact stored plant/grow/tent identity", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "ready",
      plants: [plant({ id: "plant-a", grow_id: "grow-1", tent_id: "tent-1" })],
      tents: [tent({ id: "tent-1", grow_id: "grow-1" })],
      // Hunt-level tent hint intentionally wrong/null — stored plant wins.
      prefillInput: { ...PREFILL, growId: "grow-1", tentId: null, goalId: "aroma" },
    });
    expect(d.kind).toBe("ready");
    if (d.kind !== "ready") return;
    expect(d.target).toEqual({
      plantId: "plant-a",
      growId: "grow-1",
      tentId: "tent-1",
    });
    expect(d.prefill).toMatchObject({
      plantId: "plant-a",
      growId: "grow-1",
      tentId: "tent-1",
      phenoHuntId: "hunt-1",
      phenoEvidenceGoal: "aroma",
      source: "pheno-evidence-goal",
      eventType: "observation",
      suggestSnapshot: true,
    });
  });

  it("fails closed when the clicked goal is not configured", () => {
    const d = resolvePhenoEvidenceHandoff({
      catalogStatus: "ready",
      plants: [plant({ id: "plant-a", grow_id: "grow-1", tent_id: "tent-1" })],
      tents: [tent({ id: "tent-1", grow_id: "grow-1" })],
      prefillInput: { ...PREFILL, goalId: "trichomes", configuredGoals: ["structure"] },
    });
    expect(d.kind).toBe("goal_unavailable");
  });
});
