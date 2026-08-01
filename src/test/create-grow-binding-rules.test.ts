import { describe, expect, it } from "vitest";
import {
  buildTentInsertPayload,
  evaluatePlantTentBinding,
  resolveCreateGrowBinding,
  resolveInitialTentSelection,
} from "@/lib/createGrowBindingRules";
import {
  CHOOSE_SETUP_HREF,
  ONE_TENT_ACTIVATION_HREF,
} from "@/constants/growSetupMessages";

const GROW_A = "11111111-1111-1111-1111-111111111111";
const GROW_B = "22222222-2222-2222-2222-222222222222";
const TENT_A = "33333333-3333-3333-3333-333333333333";
const TENT_B = "44444444-4444-4444-4444-444444444444";
const USER = "55555555-5555-5555-5555-555555555555";

describe("resolveCreateGrowBinding", () => {
  it("returns loading while grows are loading", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [],
        growsLoading: true,
        growsError: null,
        requestedGrowId: null,
        activeGrowId: null,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("returns read_error on grow read failure, not no_setup", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [],
        growsLoading: false,
        growsError: "network",
        requestedGrowId: null,
        activeGrowId: null,
      }),
    ).toEqual({ kind: "read_error" });
  });

  it("returns no_setup when zero grows exist", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [],
        growsLoading: false,
        growsError: null,
        requestedGrowId: null,
        activeGrowId: null,
      }),
    ).toEqual({ kind: "no_setup", startHref: ONE_TENT_ACTIVATION_HREF });
  });

  it("uses a valid requested grow and never falls back to active", () => {
    const result = resolveCreateGrowBinding({
      grows: [
        { id: GROW_A, name: "Room A" },
        { id: GROW_B, name: "Room B" },
      ],
      growsLoading: false,
      growsError: null,
      requestedGrowId: GROW_B,
      activeGrowId: GROW_A,
    });
    expect(result).toEqual({
      kind: "ready",
      growId: GROW_B,
      setupName: "Room B",
      source: "requested",
    });
  });

  it("blocks invalid requested grow without falling back to active", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [{ id: GROW_A, name: "Room A" }],
        growsLoading: false,
        growsError: null,
        requestedGrowId: GROW_B,
        activeGrowId: GROW_A,
      }),
    ).toEqual({ kind: "requested_setup_unavailable", chooseHref: CHOOSE_SETUP_HREF });
  });

  it("resolves active grow when no request exists", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [{ id: GROW_A, name: "Room A" }],
        growsLoading: false,
        growsError: null,
        requestedGrowId: null,
        activeGrowId: GROW_A,
      }),
    ).toEqual({
      kind: "ready",
      growId: GROW_A,
      setupName: "Room A",
      source: "current",
    });
  });

  it("returns choose_setup when active id is stale with existing grows", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [{ id: GROW_A, name: "Room A" }],
        growsLoading: false,
        growsError: null,
        requestedGrowId: null,
        activeGrowId: GROW_B,
      }),
    ).toEqual({ kind: "choose_setup", chooseHref: CHOOSE_SETUP_HREF });
  });

  it("uses generic setup copy when name is blank and never uses grow id", () => {
    const result = resolveCreateGrowBinding({
      grows: [{ id: GROW_A, name: "   " }],
      growsLoading: false,
      growsError: null,
      requestedGrowId: GROW_A,
      activeGrowId: null,
    });
    expect(result).toMatchObject({ kind: "ready", setupName: "your current setup" });
    if (result.kind === "ready") {
      expect(result.setupName).not.toContain(GROW_A);
    }
  });

  it("returns the same output for the same input", () => {
    const input = {
      grows: [{ id: GROW_A, name: "Room A" }],
      growsLoading: false,
      growsError: null,
      requestedGrowId: null,
      activeGrowId: GROW_A,
    };
    expect(resolveCreateGrowBinding(input)).toEqual(resolveCreateGrowBinding(input));
  });
});

describe("evaluatePlantTentBinding", () => {
  const tents = [
    { id: TENT_A, grow_id: GROW_A },
    { id: TENT_B, grow_id: GROW_B },
    { id: "55555555-5555-5555-5555-555555555555", grow_id: null },
  ];

  it("allows no tent when requireTent is false", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: null,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "no_tent", allowed: true });
  });

  it("blocks no tent when requireTent is true", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "none",
        requireTent: true,
        tents,
      }),
    ).toEqual({ kind: "tent_required" });
  });

  it("passes a matching tent", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_A,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "ready", tentId: TENT_A });
  });

  it("blocks a null-grow tent", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "55555555-5555-5555-5555-555555555555",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "tent_not_in_setup" });
  });

  it("blocks a different-grow tent", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_B,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "different_setup" });
  });

  it("blocks a missing tent row", () => {
    expect(
      evaluatePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "66666666-6666-6666-6666-666666666666",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "tent_unavailable" });
  });

  it("returns the same result when input order changes", () => {
    const reversed = [...tents].reverse();
    const input = {
      resolvedGrowId: GROW_A,
      selectedTentId: TENT_A,
      requireTent: false,
      tents: reversed,
    };
    expect(evaluatePlantTentBinding(input)).toEqual(
      evaluatePlantTentBinding({ ...input, tents }),
    );
  });
});

describe("resolveInitialTentSelection", () => {
  const readyBinding = {
    kind: "ready" as const,
    growId: GROW_A,
    setupName: "Room A",
    source: "current" as const,
  };

  it("clears incompatible default tents and retains conflict state", () => {
    const result = resolveInitialTentSelection({
      binding: readyBinding,
      defaultTentId: TENT_B,
      requireTent: false,
      tents: [
        { id: TENT_A, grow_id: GROW_A },
        { id: TENT_B, grow_id: GROW_B },
      ],
    });
    expect(result.tentId).toBe("none");
    expect(result.conflict).toEqual({ kind: "different_setup" });
  });

  it("retains compatible default tents", () => {
    const result = resolveInitialTentSelection({
      binding: readyBinding,
      defaultTentId: TENT_A,
      requireTent: false,
      tents: [{ id: TENT_A, grow_id: GROW_A }],
    });
    expect(result).toEqual({ tentId: TENT_A, conflict: null });
  });
});

describe("buildTentInsertPayload", () => {
  it("returns null unless binding is ready", () => {
    expect(
      buildTentInsertPayload(
        { kind: "no_setup", startHref: ONE_TENT_ACTIVATION_HREF },
        {
          user_id: USER,
          name: "Tent",
          size: null,
          brand: null,
          stage: "seedling",
        },
      ),
    ).toBeNull();
  });

  it("includes grow_id when binding is ready", () => {
    expect(
      buildTentInsertPayload(
        {
          kind: "ready",
          growId: GROW_A,
          setupName: "Room A",
          source: "current",
        },
        {
          user_id: USER,
          name: "Tent",
          size: null,
          brand: null,
          stage: "seedling",
        },
      ),
    ).toEqual({
      user_id: USER,
      name: "Tent",
      size: null,
      brand: null,
      stage: "seedling",
      grow_id: GROW_A,
    });
  });
});
