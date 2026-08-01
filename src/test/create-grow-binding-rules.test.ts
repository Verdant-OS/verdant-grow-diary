import { describe, expect, it } from "vitest";
import {
  CREATE_CHOOSE_SETUP_HREF,
  CREATE_NO_SETUP_START_HREF,
  buildGrowBoundTentInsertPayload,
  filterTentsForResolvedGrow,
  resolveCreateGrowBinding,
  resolvePlantTentBinding,
  resolveSafeInitialPlantTentSelection,
} from "@/lib/createGrowBindingRules";
import { growSetupMessages } from "@/constants/growSetupMessages";

const GROW_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GROW_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const USER = "99999999-9999-9999-9999-999999999999";

const grows = [
  { id: GROW_A, name: "Spring Veg" },
  { id: GROW_B, name: "Autumn Run" },
];

describe("resolveCreateGrowBinding", () => {
  it("returns loading while the grow list is loading", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [],
        growsLoading: true,
        growsError: null,
        activeGrowId: GROW_A,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("returns read_error on failure, never no_setup", () => {
    const state = resolveCreateGrowBinding({
      grows: [],
      growsLoading: false,
      growsError: "network down",
      activeGrowId: null,
    });
    expect(state).toEqual({ kind: "read_error" });
    expect(state.kind).not.toBe("no_setup");
  });

  it("returns no_setup when zero grows load successfully", () => {
    expect(
      resolveCreateGrowBinding({
        grows: [],
        growsLoading: false,
        growsError: null,
        activeGrowId: null,
      }),
    ).toEqual({ kind: "no_setup", startHref: CREATE_NO_SETUP_START_HREF });
    expect(CREATE_NO_SETUP_START_HREF).toBe("/grows?intent=one_tent_activation");
  });

  it("lets a valid requested grow win over active", () => {
    expect(
      resolveCreateGrowBinding({
        grows,
        growsLoading: false,
        growsError: null,
        requestedGrowId: GROW_B,
        activeGrowId: GROW_A,
      }),
    ).toEqual({
      kind: "ready",
      growId: GROW_B,
      setupName: "Autumn Run",
      source: "requested",
    });
  });

  it("blocks an invalid requested grow and never falls back to active", () => {
    const state = resolveCreateGrowBinding({
      grows,
      growsLoading: false,
      growsError: null,
      requestedGrowId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      activeGrowId: GROW_A,
    });
    expect(state).toEqual({
      kind: "requested_setup_unavailable",
      chooseHref: CREATE_CHOOSE_SETUP_HREF,
    });
  });

  it("resolves the active grow when no request exists", () => {
    expect(
      resolveCreateGrowBinding({
        grows,
        growsLoading: false,
        growsError: null,
        activeGrowId: GROW_A,
      }),
    ).toEqual({
      kind: "ready",
      growId: GROW_A,
      setupName: "Spring Veg",
      source: "current",
    });
  });

  it("returns choose_setup when grows exist but active id is stale", () => {
    expect(
      resolveCreateGrowBinding({
        grows,
        growsLoading: false,
        growsError: null,
        activeGrowId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      }),
    ).toEqual({ kind: "choose_setup", chooseHref: CREATE_CHOOSE_SETUP_HREF });
  });

  it("returns choose_setup when grows exist but active id is null", () => {
    expect(
      resolveCreateGrowBinding({
        grows,
        growsLoading: false,
        growsError: null,
        activeGrowId: null,
      }),
    ).toEqual({ kind: "choose_setup", chooseHref: CREATE_CHOOSE_SETUP_HREF });
  });

  it("uses generic setup copy for blank names and never uses the id", () => {
    const state = resolveCreateGrowBinding({
      grows: [{ id: GROW_A, name: "   " }],
      growsLoading: false,
      growsError: null,
      activeGrowId: GROW_A,
    });
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.setupName).toBe(growSetupMessages.genericSetupName);
    expect(state.setupName).not.toBe(GROW_A);
    expect(growSetupMessages.create.addingTo(state.setupName)).not.toContain(GROW_A);
  });

  it("returns the same output for the same input", () => {
    const input = {
      grows,
      growsLoading: false,
      growsError: null as string | null,
      requestedGrowId: GROW_A,
      activeGrowId: GROW_B,
    };
    expect(resolveCreateGrowBinding(input)).toEqual(resolveCreateGrowBinding(input));
  });
});

describe("resolvePlantTentBinding", () => {
  const tents = [
    { id: TENT_A, grow_id: GROW_A },
    { id: TENT_B, grow_id: GROW_B },
    { id: "33333333-3333-3333-3333-333333333333", grow_id: null },
  ];

  it("allows no tent when requireTent is false", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "none",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "no_tent", allowed: true });
  });

  it("blocks no tent when requireTent is true", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: null,
        requireTent: true,
        tents,
      }),
    ).toEqual({ kind: "tent_required" });
  });

  it("passes a matching tent", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_A,
        requireTent: true,
        tents,
      }),
    ).toEqual({ kind: "ready", tentId: TENT_A });
  });

  it("blocks a null-grow tent", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "33333333-3333-3333-3333-333333333333",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "tent_not_in_setup" });
  });

  it("blocks a different-grow tent", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: TENT_B,
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "different_setup" });
  });

  it("blocks a missing tent row", () => {
    expect(
      resolvePlantTentBinding({
        resolvedGrowId: GROW_A,
        selectedTentId: "44444444-4444-4444-4444-444444444444",
        requireTent: false,
        tents,
      }),
    ).toEqual({ kind: "tent_unavailable" });
  });

  it("is stable under reordered tent inputs", () => {
    const a = resolvePlantTentBinding({
      resolvedGrowId: GROW_A,
      selectedTentId: TENT_A,
      requireTent: true,
      tents,
    });
    const b = resolvePlantTentBinding({
      resolvedGrowId: GROW_A,
      selectedTentId: TENT_A,
      requireTent: true,
      tents: [...tents].reverse(),
    });
    expect(a).toEqual(b);
  });
});

describe("resolveSafeInitialPlantTentSelection + filters + tent payload", () => {
  const tents = [
    { id: TENT_A, grow_id: GROW_A },
    { id: TENT_B, grow_id: null },
  ];

  it("retains a compatible default tent and clears unsafe ones", () => {
    expect(
      resolveSafeInitialPlantTentSelection({
        resolvedGrowId: GROW_A,
        defaultTentId: TENT_A,
        tents,
      }),
    ).toEqual({ tentId: TENT_A, conflict: null });

    expect(
      resolveSafeInitialPlantTentSelection({
        resolvedGrowId: GROW_A,
        defaultTentId: TENT_B,
        tents,
      }),
    ).toEqual({ tentId: null, conflict: "tent_not_in_setup" });
  });

  it("filters tents to the resolved grow only", () => {
    expect(filterTentsForResolvedGrow(tents, GROW_A).map((t) => t.id)).toEqual([TENT_A]);
  });

  it("builds a grow-bound tent payload only from ready state", () => {
    const ready = resolveCreateGrowBinding({
      grows,
      growsLoading: false,
      growsError: null,
      activeGrowId: GROW_A,
    });
    const payload = buildGrowBoundTentInsertPayload({
      binding: ready,
      userId: USER,
      name: " Tent 1 ",
      size: "",
      brand: "Gorilla",
      stage: "veg",
    });
    expect(payload).toEqual({
      user_id: USER,
      name: "Tent 1",
      size: null,
      brand: "Gorilla",
      stage: "veg",
      grow_id: GROW_A,
    });

    expect(
      buildGrowBoundTentInsertPayload({
        binding: { kind: "no_setup", startHref: CREATE_NO_SETUP_START_HREF },
        userId: USER,
        name: "Tent 1",
        size: "",
        brand: "",
        stage: "veg",
      }),
    ).toBeNull();
  });
});
