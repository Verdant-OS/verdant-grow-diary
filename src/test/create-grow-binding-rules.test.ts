/**
 * Unit tests for the pure create-dialog grow-binding resolver and the
 * plant/tent compatibility evaluator. No React, no Supabase — inputs are
 * plain rows the caller would have loaded through RLS.
 */
import { describe, expect, it } from "vitest";
import {
  CHOOSE_SETUP_HREF,
  GENERIC_SETUP_NAME,
  START_YOUR_ROOM_HREF,
  buildTentInsertPayload,
  evaluatePlantTentBinding,
  resolveCreateGrowBinding,
  type ResolveCreateGrowBindingInput,
} from "@/lib/createGrowBindingRules";

const GROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT_1 = "11111111-1111-4111-8111-111111111111";
const TENT_2 = "22222222-2222-4222-8222-222222222222";
const USER = "99999999-9999-4999-8999-999999999999";

const baseInput: ResolveCreateGrowBindingInput = {
  grows: [{ id: GROW_A, name: "Tent A room" }],
  growsLoading: false,
  growsError: null,
  requestedGrowId: null,
  activeGrowId: GROW_A,
};

describe("resolveCreateGrowBinding", () => {
  it("returns loading while the grow list is loading", () => {
    expect(resolveCreateGrowBinding({ ...baseInput, growsLoading: true })).toEqual({
      kind: "loading",
    });
  });

  it("returns read_error (never no_setup) when the grow read failed", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      grows: [],
      growsError: "network down",
    });
    expect(state.kind).toBe("read_error");
    expect(state.kind).not.toBe("no_setup");
  });

  it("returns no_setup with the existing activation route when zero grows load", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      grows: [],
      activeGrowId: null,
    });
    expect(state).toEqual({ kind: "no_setup", startHref: START_YOUR_ROOM_HREF });
    expect(START_YOUR_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
  });

  it("resolves a valid requested grow ahead of the active grow", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      grows: [
        { id: GROW_A, name: "Active room" },
        { id: GROW_B, name: "Requested room" },
      ],
      requestedGrowId: GROW_B,
      activeGrowId: GROW_A,
    });
    expect(state).toEqual({
      kind: "ready",
      growId: GROW_B,
      setupName: "Requested room",
      source: "requested",
    });
  });

  it("blocks an invalid requested grow and never falls back to the active grow", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      requestedGrowId: GROW_B,
      activeGrowId: GROW_A,
    });
    expect(state).toEqual({
      kind: "requested_setup_unavailable",
      chooseHref: CHOOSE_SETUP_HREF,
    });
  });

  it("resolves the active grow when no explicit request exists", () => {
    const state = resolveCreateGrowBinding(baseInput);
    expect(state).toEqual({
      kind: "ready",
      growId: GROW_A,
      setupName: "Tent A room",
      source: "current",
    });
  });

  it("returns choose_setup when grows exist but the active id is stale", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      activeGrowId: GROW_B,
    });
    expect(state).toEqual({ kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF });
  });

  it("returns choose_setup when grows exist but the active id is null", () => {
    const state = resolveCreateGrowBinding({ ...baseInput, activeGrowId: null });
    expect(state).toEqual({ kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF });
  });

  it("never picks the first grow as an implicit fallback", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      grows: [{ id: GROW_B, name: "First in list" }, { id: GROW_A, name: "Second" }],
      activeGrowId: null,
    });
    expect(state.kind).toBe("choose_setup");
  });

  it("uses generic copy for blank setup names and never the id", () => {
    for (const name of [null, undefined, "", "   "]) {
      const state = resolveCreateGrowBinding({
        ...baseInput,
        grows: [{ id: GROW_A, name }],
      });
      expect(state).toEqual({
        kind: "ready",
        growId: GROW_A,
        setupName: GENERIC_SETUP_NAME,
        source: "current",
      });
      if (state.kind === "ready") {
        expect(state.setupName).not.toContain(GROW_A);
      }
    }
  });

  it("is deterministic: same input returns the same output", () => {
    const input: ResolveCreateGrowBindingInput = {
      ...baseInput,
      grows: [
        { id: GROW_A, name: "Room A" },
        { id: GROW_B, name: "Room B" },
      ],
      requestedGrowId: GROW_B,
    };
    const first = resolveCreateGrowBinding(input);
    const second = resolveCreateGrowBinding(input);
    expect(second).toEqual(first);
  });

  it("tolerates null/undefined rows without throwing", () => {
    const state = resolveCreateGrowBinding({
      ...baseInput,
      grows: [null, undefined, { id: null }, { id: GROW_A, name: "Real" }],
    });
    expect(state).toEqual({
      kind: "ready",
      growId: GROW_A,
      setupName: "Real",
      source: "current",
    });
  });
});

describe("evaluatePlantTentBinding", () => {
  const tents = [
    { id: TENT_1, grow_id: GROW_A },
    { id: TENT_2, grow_id: GROW_B },
  ];

  it("allows no tent only when requireTent is false", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: null,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "no_tent", allowed: true });
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "none",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "no_tent", allowed: true });
  });

  it("blocks a missing selection when requireTent is true", () => {
    for (const selectedTentId of [null, undefined, "", "none"]) {
      expect(
        evaluatePlantTentBinding({
          resolvedGrowId: GROW_A,
          selectedTentId,
          requireTent: true,
          tents,
        }),
      ).toEqual({ kind: "tent_required" });
    }
  });

  it("passes a tent whose grow matches the resolved grow", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_1,
        requireTent: true,
        tents,
      }),
    ).toEqual({ kind: "ready", tentId: TENT_1 });
  });

  it("blocks a tent with a null/blank grow binding", () => {
    for (const grow_id of [null, undefined, "", "  "]) {
      expect(
        evaluatePlantTentBinding({
          resolvedGrowId: GROW_A,
          selectedTentId: TENT_1,
          requireTent: false,
          tents: [{ id: TENT_1, grow_id }],
        }),
      ).toEqual({ kind: "tent_not_in_setup" });
    }
  });

  it("blocks a tent that belongs to a different grow", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_2,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "different_setup" });
  });

  it("blocks a selected tent that is missing from the loaded rows", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_1,
        requireTent: false,
        tents: [],
      }),
    ).toEqual({ kind: "tent_unavailable" });
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_1,
        requireTent: false,
        tents: null,
      }),
    ).toEqual({ kind: "tent_unavailable" });
  });

  it("returns the same result when tent rows are reordered", () => {
    const forward = evaluatePlantTentBinding({
      resolvedGrowId: GROW_A,
      selectedTentId: TENT_1,
      requireTent: true,
      tents,
    });
    const reversed = evaluatePlantTentBinding({
      resolvedGrowId: GROW_A,
      selectedTentId: TENT_1,
      requireTent: true,
      tents: [...tents].reverse(),
    });
    expect(reversed).toEqual(forward);
  });
});

describe("buildTentInsertPayload", () => {
  const draft = { name: "  Tent #1  ", size: "4x4", brand: null, stage: "seedling" };

  it("builds a grow-bound payload only from a ready binding", () => {
    const result = buildTentInsertPayload(
      { kind: "ready", growId: GROW_A, setupName: "Room", source: "current" },
      USER,
      draft,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.grow_id).toBe(GROW_A);
      expect(result.payload.user_id).toBe(USER);
      expect(result.payload.name).toBe("Tent #1");
    }
  });

  it("refuses to build a payload from every non-ready state", () => {
    const states = [
      { kind: "loading" } as const,
      { kind: "read_error" } as const,
      { kind: "no_setup", startHref: START_YOUR_ROOM_HREF } as const,
      { kind: "requested_setup_unavailable", chooseHref: CHOOSE_SETUP_HREF } as const,
      { kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF } as const,
    ];
    for (const state of states) {
      const result = buildTentInsertPayload(state, USER, draft);
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe(state.kind);
    }
  });
});
