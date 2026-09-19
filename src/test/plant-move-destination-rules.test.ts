import { describe, expect, it } from "vitest";
import {
  buildOtherGrowMoveDestinations,
  withoutDisclosedMoveDestinations,
} from "@/lib/plantMoveDestinationRules";

const plant = { growId: "a", currentTentId: "current", huntStatus: "linked" as const };
const tents = [
  { id: "current", name: "Current", grow_id: "a" },
  { id: "same", name: "Same", grow_id: "a" },
  { id: "male", name: "Male Tent", grow_id: "b", grow_name: "Banana Cough" },
  { id: "archived", name: "Retired", grow_id: "b", is_archived: true },
];

describe("other-grow move destination disclosure", () => {
  it("keeps only active other-grow tents and disables them while hunt-linked", () => {
    expect(buildOtherGrowMoveDestinations(tents, plant)).toEqual([
      {
        id: "male",
        label: "Male Tent — Banana Cough",
        disabled: true,
        reason: "Untag from the Pheno Hunt first to move to this grow.",
      },
    ]);
  });
  it("removes the hunt block when the caller confirms the explicit untag succeeded", () => {
    expect(buildOtherGrowMoveDestinations(tents, { ...plant, huntStatus: "clear" })).toEqual([
      {
        id: "male",
        label: "Male Tent — Banana Cough",
        disabled: false,
        reason: null,
      },
    ]);
  });
  it("does not claim a hunt link when its read is unresolved", () => {
    expect(
      buildOtherGrowMoveDestinations(tents, { ...plant, huntStatus: "unresolved" })[0],
    ).toMatchObject({
      disabled: true,
      reason: "Pheno Hunt status is unavailable. Read it before moving to another grow.",
    });
  });
  it.each([null, undefined])("accepts %s tents and plant", (value) => {
    expect(buildOtherGrowMoveDestinations(value, plant)).toEqual([]);
    expect(buildOtherGrowMoveDestinations(tents, value)).toEqual([]);
  });
  it("labels an unreadable grow name honestly without inventing a grow", () => {
    expect(
      buildOtherGrowMoveDestinations([{ id: "male", name: "Male Tent", grow_id: "b" }], plant)[0],
    ).toMatchObject({ label: "Male Tent — Grow name unavailable", disabled: true });
  });
  it("does not classify a missing destination grow as a known cross-grow move", () => {
    expect(
      buildOtherGrowMoveDestinations([{ id: "unknown", name: "Unknown", grow_id: null }], plant),
    ).toEqual([]);
  });
  it("treats a grow-less hunt-linked plant moving into a grow as blocked", () => {
    expect(buildOtherGrowMoveDestinations([tents[2]], { ...plant, growId: null })[0].disabled).toBe(
      true,
    );
  });
  it("keeps ordering deterministic and does not mutate input", () => {
    const frozen = Object.freeze(tents.map((tent) => Object.freeze({ ...tent })));
    const first = buildOtherGrowMoveDestinations(frozen, plant);
    expect(buildOtherGrowMoveDestinations(frozen, plant)).toEqual(first);
    expect(frozen.map((tent) => tent.id)).toEqual(["current", "same", "male", "archived"]);
  });
});

describe("withoutDisclosedMoveDestinations", () => {
  it("omits tents that already appear as disclosed other-grow destinations", () => {
    const sameGrowTents = [
      { id: "current", name: "Current" },
      { id: "male", name: "Male Tent" },
      { id: "other", name: "Other" },
    ];
    const destinations = buildOtherGrowMoveDestinations(tents, plant);

    expect(withoutDisclosedMoveDestinations(sameGrowTents, destinations)).toEqual([
      { id: "current", name: "Current" },
      { id: "other", name: "Other" },
    ]);
  });

  it("returns the input list unchanged when no destinations are disclosed", () => {
    const sameGrowTents = [{ id: "current", name: "Current" }];
    expect(withoutDisclosedMoveDestinations(sameGrowTents, [])).toEqual(sameGrowTents);
  });

  it("does not mutate the input tent array", () => {
    const sameGrowTents = Object.freeze([
      Object.freeze({ id: "current", name: "Current" }),
      Object.freeze({ id: "male", name: "Male Tent" }),
    ]);
    const destinations = buildOtherGrowMoveDestinations(tents, plant);

    withoutDisclosedMoveDestinations(sameGrowTents, destinations);

    expect(sameGrowTents.map((tent) => tent.id)).toEqual(["current", "male"]);
  });

  it("leaves no duplicate tent id across disabled other-grow and enabled same-grow lists", () => {
    const destinations = buildOtherGrowMoveDestinations(tents, plant);
    const enabledSameGrow = withoutDisclosedMoveDestinations(
      [
        { id: "current", name: "Current" },
        { id: "same", name: "Same" },
        { id: "male", name: "Male Tent" },
      ],
      destinations,
    );

    const selectableIds = [...destinations.map((d) => d.id), ...enabledSameGrow.map((t) => t.id)];
    expect(new Set(selectableIds).size).toBe(selectableIds.length);
    expect(enabledSameGrow.some((tent) => tent.id === "male")).toBe(false);
  });
});
