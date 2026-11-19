/**
 * Friction item 1 (field-notebook walk, 2026-11-19): a reading from one tent
 * is judged by that tent's stage and its plants, never by plants in another
 * tent of the same grow. Pure; resolves through the real precedence helper.
 */
import { describe, expect, it } from "vitest";
import { resolveSnapshotStageScope } from "@/lib/alertSnapshotStageScopeRules";
import { resolveAlertContextStage } from "@/lib/alertStageResolution";
import {
  resolveGrowStagePlants,
  resolveSelectedTentPlantStages,
  resolveSelectedTentStagePlants,
} from "@/lib/alertPlantStageScopeRules";

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

describe("Dashboard and Alerts persist with the same stage (Codex on #3021)", () => {
  // Codex's case: a seedling grow, two seedling tents, a Flower plant in tent
  // A and a Veg plant in tent B, and one reading from tent A. Both pages
  // persist through usePersistEnvironmentAlerts; they must agree on the stage
  // or the same reading opens an above-range alert on one page and a
  // below-range alert on the other.
  const DASHBOARD_PLANTS = [
    { growId: "g1", tentId: "tent-a", stage: "flower", isArchived: false },
    { growId: "g1", tentId: "tent-b", stage: "veg", isArchived: false },
  ];
  const ALERTS_PLANTS = DASHBOARD_PLANTS.map((p) => ({
    grow_id: p.growId,
    tent_id: p.tentId,
    stage: p.stage,
  }));

  function alertsPageStage(snapshotTentId: string | null) {
    const scope = resolveSnapshotStageScope({
      snapshotTentId,
      tents: TENTS,
      plants: resolveGrowStagePlants(ALERTS_PLANTS, "g1", TENTS),
    });
    return resolveAlertContextStage({
      growStage: "seedling",
      tentStages: scope.tentStages,
      plantStages: scope.plantStages ?? null,
    }).normalizedStage;
  }

  // Mirrors Dashboard.tsx: the "all" selection is every grow tent.
  function dashboardStage(snapshotTentId: string | null, selectedTentIds: string[]) {
    const stageContextTents = TENTS.filter((t) => selectedTentIds.includes(t.id));
    const scope = resolveSnapshotStageScope({
      snapshotTentId,
      tents: stageContextTents,
      plants: resolveSelectedTentStagePlants(DASHBOARD_PLANTS, "g1", TENTS, selectedTentIds),
    });
    return resolveAlertContextStage({
      growStage: "seedling",
      tentStages: scope.tentStages,
      plantStages: scope.plantStages,
    }).normalizedStage;
  }

  it("a tent-A reading resolves to Flower on both pages, with all tents selected", () => {
    expect(alertsPageStage("tent-a")).toBe("flower");
    expect(dashboardStage("tent-a", ["tent-a", "tent-b"])).toBe("flower");
  });

  it("a tent-B reading resolves to Veg on both pages", () => {
    expect(alertsPageStage("tent-b")).toBe("veg");
    expect(dashboardStage("tent-b", ["tent-a", "tent-b"])).toBe("veg");
  });

  it("a reading that spans tents keeps the selection-wide stage on both pages", () => {
    expect(alertsPageStage(null)).toBe("seedling");
    expect(dashboardStage(null, ["tent-a", "tent-b"])).toBe("seedling");
  });

  it("a single-tent selection is unchanged: its tent and plants decide", () => {
    expect(dashboardStage("tent-a", ["tent-a"])).toBe("flower");
    expect(dashboardStage(null, ["tent-b"])).toBe("veg");
  });

  it("resolveSelectedTentStagePlants keeps the stages resolveSelectedTentPlantStages returns", () => {
    const ids = ["tent-a", "tent-b"];
    expect(
      resolveSelectedTentStagePlants(DASHBOARD_PLANTS, "g1", TENTS, ids).map((p) => p.stage),
    ).toEqual(resolveSelectedTentPlantStages(DASHBOARD_PLANTS, "g1", TENTS, ids));
  });
});
