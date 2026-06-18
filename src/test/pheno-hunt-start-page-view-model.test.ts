import { describe, it, expect } from "vitest";
import {
  emptyPhenoHuntDraft,
  type CandidatePlant,
  type PhenoHuntDraft,
} from "@/lib/phenoHuntStartPageRules";
import { buildPhenoHuntStartPageView } from "@/lib/phenoHuntStartPageViewModel";

const plant = (over: Partial<CandidatePlant>): CandidatePlant => ({
  id: "p1",
  name: "Plant 1",
  strain: "Blue Berry",
  stage: "veg",
  growId: "g1",
  tentId: "t1",
  isArchived: false,
  ...over,
});

const baseDraft = (): PhenoHuntDraft => ({
  ...emptyPhenoHuntDraft(),
  huntName: "BB Hunt",
  cultivar: "Blue Berry",
  projectGoal: "keeper_selection",
  startDate: "2026-06-18",
  growId: "g1",
  tentId: "t1",
});

describe("buildPhenoHuntStartPageView", () => {
  it("canSave is false without candidates, true when ready with selections", () => {
    const noCandidates = buildPhenoHuntStartPageView({
      draft: baseDraft(),
      allPlants: [],
      selections: [],
    });
    expect(noCandidates.canSave).toBe(false);
    expect(noCandidates.saveBlockedReason).toBeNull();

    const ready = buildPhenoHuntStartPageView({
      draft: baseDraft(),
      allPlants: [plant({})],
      selections: [{ plantId: "p1", label: "BB-01" }],
    });
    expect(ready.canSave).toBe(true);
  });

  it("returns no-grow empty state when grow missing", () => {
    const v = buildPhenoHuntStartPageView({
      draft: emptyPhenoHuntDraft(),
      allPlants: [plant({})],
      selections: [],
    });
    expect(v.emptyState).toEqual({ kind: "no-grow" });
    expect(v.candidates).toEqual([]);
  });

  it("returns no-tent empty state when tent missing", () => {
    const v = buildPhenoHuntStartPageView({
      draft: { ...emptyPhenoHuntDraft(), growId: "g1" },
      allPlants: [plant({})],
      selections: [],
    });
    expect(v.emptyState).toEqual({ kind: "no-tent" });
  });

  it("returns no-plants-in-tent when none match tent", () => {
    const v = buildPhenoHuntStartPageView({
      draft: baseDraft(),
      allPlants: [plant({ id: "x", tentId: "other" })],
      selections: [],
    });
    expect(v.emptyState).toEqual({ kind: "no-plants-in-tent" });
  });

  it("summary tracks selected candidates", () => {
    const v = buildPhenoHuntStartPageView({
      draft: baseDraft(),
      allPlants: [plant({ id: "a" }), plant({ id: "b", name: "Plant 2" })],
      selections: [{ plantId: "a", label: "BB-01" }],
    });
    expect(v.summary.candidateCount).toBe(1);
    expect(v.summary.candidateLabels).toEqual(["BB-01"]);
    expect(v.summary.goalLabel).toBe("Keeper selection");
  });

  it("missing required fields surface in view", () => {
    const v = buildPhenoHuntStartPageView({
      draft: { ...emptyPhenoHuntDraft(), growId: "g1", tentId: "t1" },
      allPlants: [],
      selections: [],
    });
    expect(v.missingRequired).toContain("huntName");
    expect(v.missingRequired).toContain("cultivar");
    expect(v.missingRequired).toContain("projectGoal");
    expect(v.missingRequired).toContain("startDate");
    expect(v.ready).toBe(false);
  });
});
