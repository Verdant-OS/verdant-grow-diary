import { describe, expect, it } from "vitest";
import {
  normalizePersistedGrowTentId,
  resolveGrowTentSelection,
} from "@/lib/growTentSelectionRules";

const TENT_A = "00000000-0000-4000-8000-00000000000a";
const TENT_B = "00000000-0000-4000-8000-00000000000b";
const TENT_C = "00000000-0000-4000-8000-00000000000c";

describe("growTentSelectionRules", () => {
  it("returns no selection while the authenticated tent list is empty", () => {
    expect(resolveGrowTentSelection({ currentTentId: null, tents: [] })).toBeNull();
    expect(resolveGrowTentSelection({ currentTentId: "t1", tents: null })).toBeNull();
  });

  it("replaces a stale demo t1 selection when real tents arrive asynchronously", () => {
    const beforeRows = resolveGrowTentSelection({
      currentTentId: "t1",
      tents: [],
    });
    const afterRows = resolveGrowTentSelection({
      currentTentId: "t1",
      tents: [{ id: TENT_B }, { id: TENT_A }],
    });

    expect(beforeRows).toBeNull();
    expect(afterRows).toBe(TENT_B);
  });

  it("preserves the current persisted tent when it remains available", () => {
    expect(
      resolveGrowTentSelection({
        currentTentId: TENT_C,
        tents: [{ id: TENT_A }, { id: TENT_C }, { id: TENT_B }],
      }),
    ).toBe(TENT_C);
  });

  it("selects another real tent when the current tent was deleted", () => {
    expect(
      resolveGrowTentSelection({
        currentTentId: TENT_C,
        tents: [{ id: TENT_B }, { id: TENT_A }],
      }),
    ).toBe(TENT_B);
  });

  it("rejects non-UUID placeholders instead of turning them into queries", () => {
    expect(
      resolveGrowTentSelection({
        currentTentId: "t1",
        tents: [{ id: "t1" }, { id: "tent-a" }, { id: "" }],
      }),
    ).toBeNull();

    expect(
      resolveGrowTentSelection({
        currentTentId: "t1",
        tents: [{ id: "t1" }, { id: TENT_B }],
      }),
    ).toBe(TENT_B);
  });

  it("is null-safe for malformed candidates", () => {
    expect(
      resolveGrowTentSelection({
        currentTentId: 42,
        tents: [null, undefined, { id: null }, { id: 42 }, { id: TENT_A }],
      }),
    ).toBe(TENT_A);
  });

  it("uses repository input order for the default selection", () => {
    const ascending = resolveGrowTentSelection({
      tents: [{ id: TENT_A }, { id: TENT_B }, { id: TENT_C }],
    });
    const shuffled = resolveGrowTentSelection({
      tents: [{ id: TENT_C }, { id: TENT_A }, { id: TENT_B }],
    });

    expect(ascending).toBe(TENT_A);
    expect(shuffled).toBe(TENT_C);
  });

  it("keeps the first valid occurrence when repository rows contain duplicates", () => {
    expect(
      resolveGrowTentSelection({
        tents: [{ id: "t1" }, { id: TENT_B }, { id: TENT_A }, { id: TENT_B }],
      }),
    ).toBe(TENT_B);
  });

  it("normalizes valid UUID casing and whitespace deterministically", () => {
    expect(normalizePersistedGrowTentId(`  ${TENT_A.toUpperCase()}  `)).toBe(TENT_A);
    expect(normalizePersistedGrowTentId("t1")).toBeNull();
    expect(normalizePersistedGrowTentId(undefined)).toBeNull();
  });
});
