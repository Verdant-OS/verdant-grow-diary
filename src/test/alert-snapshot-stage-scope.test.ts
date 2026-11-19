/**
 * Friction item 1 (field-notebook walk, 2026-11-19): a reading from one tent
 * is judged by that tent's stage and its plants, never by plants in another
 * tent of the same grow. Pure; resolves through the real precedence helper.
 */
import { describe, expect, it } from "vitest";
import { resolveSnapshotStageScope } from "@/lib/alertSnapshotStageScopeRules";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";
import { resolveGrowStagePlants } from "@/lib/alertPlantStageScopeRules";

const TENTS = [
  { id: "tent-a", stage: "seedling" },
  { id: "tent-b", stage: "seedling" },
];

function resolvedFor(
  snapshotTentId: string | null,
  plants: Parameters<typeof resolveGrowStagePlants>[0],
) {
  const scope = resolveSnapshotStageScope({
    snapshotTentId,
    tents: TENTS,
    plants: resolveGrowStagePlants(plants, "g1", TENTS),
  });
  return resolveAlertContextStage({
    growStage: "seedling",
    tentStages: scope.tentStages,
    plantStages: scope.plantStages ?? null,
  }).normalizedStage;
}

describe("resolveSnapshotStageScope", () => {
  const MIXED = [
    { grow_id: "g1", tent_id: "tent-a", stage: "flower" },
    { grow_id: "g1", tent_id: "tent-b", stage: "veg" },
  ];

  it("walk repro: a Flower plant's tent reading is judged as Flower, not seedling", () => {
    // Grow-wide, the two plants disagree, abstain, and seedling governs.
    expect(resolvedFor(null, MIXED)).toBe("seedling");
    expect(resolvedFor("tent-a", MIXED)).toBe("flower");
    expect(resolvedFor("tent-b", MIXED)).toBe("veg");
  });

  it("a plant in another tent never votes", () => {
    const scope = resolveSnapshotStageScope({
      snapshotTentId: "tent-b",
      tents: TENTS,
      plants: [{ tent_id: "tent-a", stage: "flower" }],
    });
    expect(scope).toEqual({ tentStages: ["seedling"], plantStages: [], scope: "tent" });
  });

  it("a grow plant with no tent keeps its vote", () => {
    const scope = resolveSnapshotStageScope({
      snapshotTentId: "tent-a",
      tents: TENTS,
      plants: [{ tent_id: null, stage: "flower" }],
    });
    expect(scope.plantStages).toEqual(["flower"]);
  });

  it("no tent on the snapshot, or a tent outside the grow, stays grow-wide", () => {
    const plants = [{ tent_id: "tent-a", stage: "flower" }];
    for (const id of [null, undefined, "", "tent-z"]) {
      expect(resolveSnapshotStageScope({ snapshotTentId: id, tents: TENTS, plants })).toEqual({
        tentStages: ["seedling", "seedling"],
        plantStages: ["flower"],
        scope: "grow",
      });
    }
  });

  it("passes a pending (null) or absent (undefined) plant read through", () => {
    expect(
      resolveSnapshotStageScope({ snapshotTentId: "tent-a", tents: TENTS, plants: null })
        .plantStages,
    ).toBeNull();
    expect(
      resolveSnapshotStageScope({ snapshotTentId: "tent-a", tents: TENTS, plants: undefined })
        .plantStages,
    ).toBeUndefined();
  });
});
