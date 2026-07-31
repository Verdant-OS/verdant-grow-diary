import { describe, expect, it } from "vitest";
import {
  buildOreozGelonadeDiaryView,
  buildPhenotypicObservationQuickLogPrefill,
  matchOreozGelonadeCultivar,
  normalizeEditableTraitRecord,
  normalizeGrowthHabitNote,
} from "@/lib/oreozGelonadeDiaryRules";

const plants = [
  {
    id: "oreoz-b",
    name: "Oreoz B",
    strain: "Oreos",
    candidate_label: "O-2",
    pheno_hunt_id: "hunt-o",
    grow_id: "grow-1",
    tent_id: "tent-1",
    stage: "flower",
  },
  {
    id: "gelonade-a",
    name: "Gelonade A",
    strain: " Gelonade ",
    candidate_label: "G-1",
    pheno_hunt_id: "hunt-g",
    grow_id: "grow-1",
    tent_id: "tent-1",
    stage: "vegetative",
  },
  {
    id: "oreoz-a",
    name: "Oreoz A",
    strain: "Oreo Cookies",
    candidate_label: "O-1",
    pheno_hunt_id: "hunt-o",
    grow_id: null,
    tent_id: null,
    stage: null,
  },
  { id: "other", name: "Other", strain: "Blue Dream" },
] as const;

const scores = {
  "oreoz-b": {
    plantId: "oreoz-b",
    huntId: "hunt-o",
    traits: { vigor: 5, structure: 4, unknown: 5 },
    note: "  compact and branchy  ",
    updatedAt: "2026-07-30T10:00:00.000Z",
  },
  "oreoz-a": {
    plantId: "oreoz-a",
    huntId: "old-hunt",
    traits: { vigor: 1 },
    note: "stale score from another hunt",
    updatedAt: "2026-07-29T10:00:00.000Z",
  },
  "gelonade-a": {
    plantId: "gelonade-a",
    huntId: "hunt-g",
    traits: { vigor: 3, structure: 4.5, resilience: 4 },
    note: "taller, wider spacing",
    updatedAt: "2026-07-30T11:00:00.000Z",
  },
} as const;

describe("Oreoz/Gelonade diary view rules", () => {
  it.each([
    ["Oreoz", "oreoz"],
    ["OREOS", "oreoz"],
    ["Oreo-Cookies", "oreoz"],
    [" Gelonade ", "gelonade"],
    ["Blue Dream", null],
    [null, null],
  ])("matches the closed cultivar aliases: %s", (value, expected) => {
    expect(matchOreozGelonadeCultivar(value)).toBe(expected);
  });

  it("groups matching plants deterministically and excludes unrelated cultivars", () => {
    const view = buildOreozGelonadeDiaryView(plants, scores);
    expect(view.plants.map((plant) => plant.id)).toEqual(["oreoz-a", "oreoz-b", "gelonade-a"]);
    expect(view.byCultivar.oreoz.map((plant) => plant.id)).toEqual(["oreoz-a", "oreoz-b"]);
    expect(view.byCultivar.gelonade.map((plant) => plant.id)).toEqual(["gelonade-a"]);
  });

  it("fails stale-hunt and invalid scores closed instead of presenting them as evidence", () => {
    const view = buildOreozGelonadeDiaryView(plants, scores);
    const oreozA = view.plants.find((plant) => plant.id === "oreoz-a");
    const gelonade = view.plants.find((plant) => plant.id === "gelonade-a");
    expect(oreozA?.traits).toEqual({});
    expect(oreozA?.growthHabitNote).toBeNull();
    expect(gelonade?.traits).toEqual({ vigor: 3, resilience: 4 });
  });

  it("summarizes each trait without ranking plants or declaring a winner", () => {
    const view = buildOreozGelonadeDiaryView(plants, scores);
    const vigor = view.traitComparisons.find((trait) => trait.key === "vigor");
    expect(vigor).toMatchObject({
      oreoz: { observedCount: 1, average: 5, minimum: 5, maximum: 5 },
      gelonade: { observedCount: 1, average: 3, minimum: 3, maximum: 3 },
    });
    expect(vigor?.difference).toMatch(/in your current subjective/i);
    expect(vigor?.difference).toMatch(/not a general cultivar claim/i);
    expect(JSON.stringify(view)).not.toMatch(/\bwinner\b|\bbest\b|keeper selected/i);
  });

  it("keeps missing evidence explicit on either or both sides", () => {
    const view = buildOreozGelonadeDiaryView(plants, scores);
    const aroma = view.traitComparisons.find((trait) => trait.key === "aroma");
    const resilience = view.traitComparisons.find((trait) => trait.key === "resilience");
    expect(aroma?.difference).toMatch(/no aroma scores/i);
    expect(resilience?.difference).toMatch(/only Gelonade/i);
  });

  it("normalizes only valid 1–5 integer trait scores and bounded notes", () => {
    expect(
      normalizeEditableTraitRecord({
        vigor: 1,
        structure: 5,
        aroma: 0,
        flavor: 6,
        resilience: 2.5,
        unknown: 4,
      }),
    ).toEqual({ vigor: 1, structure: 5 });
    expect(normalizeGrowthHabitNote("  branchy  ")).toBe("branchy");
    expect(normalizeGrowthHabitNote("x".repeat(2100))).toHaveLength(2000);
    expect(normalizeGrowthHabitNote("   ")).toBeNull();
  });

  it("builds a manual-save Quick Log prefill only when grow and tent context exist", () => {
    const view = buildOreozGelonadeDiaryView(plants, scores);
    const ready = view.plants.find((plant) => plant.id === "oreoz-b");
    const unassigned = view.plants.find((plant) => plant.id === "oreoz-a");
    expect(buildPhenotypicObservationQuickLogPrefill(ready)).toMatchObject({
      plantId: "oreoz-b",
      growId: "grow-1",
      tentId: "tent-1",
      eventType: "observation",
      suggestSnapshot: true,
      source: "oreoz-gelonade-diary",
    });
    expect(buildPhenotypicObservationQuickLogPrefill(unassigned)).toBeNull();
  });

  it("is deterministic across repeated calls", () => {
    expect(buildOreozGelonadeDiaryView(plants, scores)).toEqual(
      buildOreozGelonadeDiaryView(plants, scores),
    );
  });
});
