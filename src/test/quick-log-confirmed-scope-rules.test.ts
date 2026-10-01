import { describe, expect, it } from "vitest";
import { resolveQuickLogConfirmedScope } from "@/lib/quickLogConfirmedScopeRules";
import { buildQuickLogTimelineNavTarget } from "@/lib/quickLogTimelineNavigationTarget";

const draft = Object.freeze({
  ok: true,
  growId: "draft-grow",
  tentId: "draft-tent",
  plantId: "plant-one",
  targetType: "plant" as const,
  targetId: "plant-one",
});
const emptyScope = {
  growId: null,
  tentId: null,
  plantId: null,
  targetType: null,
  targetId: null,
};

describe("confirmed Quick Log scope", () => {
  it.each([null, undefined, {}])("preserves fresh-save scope without readback: %j", (receipt) => {
    expect(resolveQuickLogConfirmedScope(draft, receipt)).toEqual({
      growId: draft.growId,
      tentId: draft.tentId,
      plantId: draft.plantId,
      targetType: draft.targetType,
      targetId: draft.targetId,
    });
  });

  it("uses the saved grow and tent after a repaired retry", () => {
    expect(
      resolveQuickLogConfirmedScope(draft, {
        persistedGrowId: "saved-grow",
        persistedTentId: "saved-tent",
        persistedPlantId: draft.plantId,
      }),
    ).toEqual({
      growId: "saved-grow",
      tentId: "saved-tent",
      plantId: draft.plantId,
      targetType: "plant",
      targetId: draft.plantId,
    });
  });

  it("preserves an authoritative null tent rather than reusing the draft assignment", () => {
    const scope = resolveQuickLogConfirmedScope(draft, {
      persistedGrowId: "saved-grow",
      persistedTentId: null,
      persistedPlantId: draft.plantId,
    });
    expect(scope.tentId).toBeNull();
    expect(buildQuickLogTimelineNavTarget(scope)?.href).toBe(
      "/timeline?growId=saved-grow&plantId=plant-one",
    );
  });

  it("clears a draft plant when the verified saved entry targets only a tent", () => {
    expect(
      resolveQuickLogConfirmedScope(draft, {
        persistedGrowId: "saved-grow",
        persistedTentId: "saved-tent",
        persistedPlantId: null,
      }),
    ).toEqual({
      growId: "saved-grow",
      tentId: "saved-tent",
      plantId: null,
      targetType: "tent",
      targetId: "saved-tent",
    });
  });

  it("does not invent a target when both verified entity ids are null", () => {
    const scope = resolveQuickLogConfirmedScope(draft, {
      persistedGrowId: "saved-grow",
      persistedTentId: null,
      persistedPlantId: null,
    });
    expect(scope).toEqual({ ...emptyScope, growId: "saved-grow" });
  });

  it("disables navigation when the verified grow is null", () => {
    const scope = resolveQuickLogConfirmedScope(draft, {
      persistedGrowId: null,
      persistedTentId: null,
      persistedPlantId: draft.plantId,
    });
    expect(scope.growId).toBeNull();
    expect(buildQuickLogTimelineNavTarget(scope)).toBeNull();
  });

  it.each([null, undefined])("handles absent draft and receipt without throwing: %j", (missing) => {
    expect(resolveQuickLogConfirmedScope(missing, missing)).toEqual(emptyScope);
  });

  it("uses verified scope even when no draft is available", () => {
    expect(
      resolveQuickLogConfirmedScope(null, {
        persistedGrowId: "saved-grow",
        persistedTentId: "saved-tent",
        persistedPlantId: null,
      }),
    ).toEqual({
      growId: "saved-grow",
      tentId: "saved-tent",
      plantId: null,
      targetType: "tent",
      targetId: "saved-tent",
    });
  });

  it("is deterministic and does not mutate either input", () => {
    const receipt = Object.freeze({
      persistedGrowId: "saved-grow",
      persistedTentId: null,
      persistedPlantId: draft.plantId,
    });
    const before = structuredClone({ draft, receipt });
    expect(resolveQuickLogConfirmedScope(draft, receipt)).toEqual(
      resolveQuickLogConfirmedScope(draft, receipt),
    );
    expect({ draft, receipt }).toEqual(before);
  });
});
