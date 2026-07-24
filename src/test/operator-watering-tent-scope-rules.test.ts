import { describe, expect, it } from "vitest";

import { buildOperatorWateringTentScope } from "@/lib/operatorWateringTentScopeRules";

const GROW_A = "11111111-1111-4111-8111-111111111111";
const GROW_B = "22222222-2222-4222-8222-222222222222";
const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("operator watering tent scope rules", () => {
  it("sanitizes and auto-selects the only valid tent", () => {
    const result = buildOperatorWateringTentScope({
      activeGrowId: `  ${GROW_A.toUpperCase()}  `,
      tents: [
        {
          id: ` ${TENT_A.toUpperCase()} `,
          name: "  Flower\t\n Tent  ",
          growId: GROW_A.toUpperCase(),
        },
      ],
      requestedTentId: null,
    });

    expect(result).toEqual({
      status: "ready",
      options: [{ id: TENT_A, name: "Flower Tent" }],
      selectedTent: { id: TENT_A, name: "Flower Tent" },
    });
  });

  it("requires selection for two tents regardless of repository input order", () => {
    const tents = [
      { id: TENT_B, name: "Vegetative", growId: GROW_A },
      { id: TENT_A, name: "Flower", growId: GROW_A },
    ] as const;

    const forward = buildOperatorWateringTentScope({ activeGrowId: GROW_A, tents });
    const reversed = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents: [...tents].reverse(),
    });

    expect(forward).toEqual(reversed);
    expect(forward).toEqual({
      status: "selection_required",
      options: [
        { id: TENT_A, name: "Flower" },
        { id: TENT_B, name: "Vegetative" },
      ],
      selectedTent: null,
    });
  });

  it("returns ready only with the explicitly matched option when several tents exist", () => {
    const result = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents: [
        { id: TENT_A, name: "Flower", growId: GROW_A },
        { id: TENT_B, name: "Vegetative", growId: GROW_A },
      ],
      requestedTentId: ` ${TENT_B.toUpperCase()} `,
    });

    expect(result.status).toBe("ready");
    expect(result.selectedTent).toEqual({ id: TENT_B, name: "Vegetative" });
  });

  it("fails closed to selection_required for malformed and unavailable requests", () => {
    const tents = [
      { id: TENT_A, name: "Flower", growId: GROW_A },
      { id: TENT_B, name: "Vegetative", growId: GROW_A },
      { id: TENT_C, name: "Foreign", growId: GROW_B },
    ];

    expect(
      buildOperatorWateringTentScope({
        activeGrowId: GROW_A,
        tents,
        requestedTentId: "tent-a",
      }),
    ).toMatchObject({ status: "selection_required", selectedTent: null });

    const foreignRequest = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents,
      requestedTentId: TENT_C,
    });
    expect(foreignRequest).toMatchObject({ status: "selection_required", selectedTent: null });
    expect(foreignRequest.options).not.toContainEqual(expect.objectContaining({ id: TENT_C }));
  });

  it("filters cross-grow and malformed candidates without discarding an unlinked scoped row", () => {
    const result = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents: [
        { id: TENT_A, name: "Scoped tent", growId: null },
        { id: TENT_B, name: "Foreign tent", growId: GROW_B },
        { id: TENT_B, name: "Malformed grow", growId: "grow-a" },
        { id: "tent-c", name: "Malformed id", growId: GROW_A },
        { id: TENT_C, name: " \t\n ", growId: GROW_A },
        null,
        undefined,
      ],
    });

    expect(result).toEqual({
      status: "ready",
      options: [{ id: TENT_A, name: "Scoped tent" }],
      selectedTent: { id: TENT_A, name: "Scoped tent" },
    });
  });

  it("deduplicates ids and resolves name and id ties deterministically", () => {
    const candidates = [
      { id: TENT_B, name: "Same", growId: GROW_A },
      { id: TENT_A, name: "Zulu duplicate", growId: GROW_A },
      { id: TENT_A.toUpperCase(), name: "Same", growId: GROW_A },
    ] as const;

    const forward = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents: candidates,
    });
    const reversed = buildOperatorWateringTentScope({
      activeGrowId: GROW_A,
      tents: [...candidates].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(forward.options).toEqual([
      { id: TENT_A, name: "Same" },
      { id: TENT_B, name: "Same" },
    ]);
    expect(forward.status).toBe("selection_required");
  });

  it("auto-selects a sole admitted tent even when the request is invalid", () => {
    expect(
      buildOperatorWateringTentScope({
        activeGrowId: GROW_A,
        tents: [{ id: TENT_A, name: "Flower", growId: GROW_A }],
        requestedTentId: TENT_C,
      }),
    ).toMatchObject({
      status: "ready",
      selectedTent: { id: TENT_A, name: "Flower" },
    });
  });

  it("returns no_tents for null or invalid active-grow inputs", () => {
    expect(buildOperatorWateringTentScope(null)).toEqual({
      status: "no_tents",
      options: [],
      selectedTent: null,
    });
    expect(
      buildOperatorWateringTentScope({
        activeGrowId: null,
        tents: null,
        requestedTentId: null,
      }),
    ).toEqual({ status: "no_tents", options: [], selectedTent: null });
    expect(
      buildOperatorWateringTentScope({
        activeGrowId: "grow-a",
        tents: [{ id: TENT_A, name: "Flower", growId: null }],
      }),
    ).toEqual({ status: "no_tents", options: [], selectedTent: null });
    expect(
      buildOperatorWateringTentScope({
        activeGrowId: GROW_A,
        tents: { id: TENT_A, name: "not-an-array" },
      } as unknown as Parameters<typeof buildOperatorWateringTentScope>[0]),
    ).toEqual({ status: "no_tents", options: [], selectedTent: null });
  });

  it("does not mutate candidate input and repeats deterministically", () => {
    const tents = Object.freeze([
      Object.freeze({ id: TENT_B, name: "Beta", growId: GROW_A }),
      Object.freeze({ id: TENT_A, name: "Alpha", growId: GROW_A }),
    ]);
    const input = Object.freeze({ activeGrowId: GROW_A, tents, requestedTentId: TENT_A });

    const first = buildOperatorWateringTentScope(input);
    const second = buildOperatorWateringTentScope(input);

    expect(second).toEqual(first);
    expect(tents.map((tent) => tent.id)).toEqual([TENT_B, TENT_A]);
  });
});
