import { describe, it, expect } from "vitest";
import { buildCureTimeline } from "@/lib/phenoCureTimelineViewModel";
import { DEMO_KEEPERS, DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const keeperInput = (name: string) => {
  const k = DEMO_KEEPERS.find((x) => x.name === name)!;
  const c = DEMO_CANDIDATES.find((x) => x.name === name)!;
  return {
    id: k.id,
    name: k.name,
    rounds: c.rounds,
    stabilityRunCount: k.stabilityRunCount,
    reversed: k.reversed,
    reversalMethods: k.reversalMethods,
  };
};

describe("phenoCureTimelineViewModel", () => {
  it("orders grow rounds, then the cure, then one node per re-grow", () => {
    const t = buildCureTimeline(keeperInput("Gas Runtz"))!; // 5 rounds incl cure, 2 stability runs
    expect(t.stages.map((s) => s.label)).toEqual([
      "Veg",
      "Early flower",
      "Mid flower",
      "Late flower",
      "Cure",
      "Re-grow 1",
      "Re-grow 2",
    ]);
    expect(t.stages.map((s) => s.kind)).toEqual([
      "round",
      "round",
      "round",
      "round",
      "cure",
      "regrow",
      "regrow",
    ]);
  });

  it("marks the cure and re-grows as the decisive part of the line", () => {
    const t = buildCureTimeline(keeperInput("Gas Runtz"))!;
    const decisive = t.stages.filter((s) => s.decisive).map((s) => s.label);
    expect(decisive).toEqual(["Cure", "Re-grow 1", "Re-grow 2"]);
  });

  it("treats a keeper as earned only when cured AND held a re-grow", () => {
    expect(buildCureTimeline(keeperInput("Gas Runtz"))!.earned).toBe(true);
    expect(buildCureTimeline(keeperInput("Sherb Cake"))!.earned).toBe(true);
    // Cured but never re-grown → not yet earned.
    const curedNoRegrow = buildCureTimeline({
      id: "x",
      rounds: ["veg", "mid_flower", "post_cure"],
      stabilityRunCount: 0,
    })!;
    expect(curedNoRegrow.reachedCure).toBe(true);
    expect(curedNoRegrow.earned).toBe(false);
    // Never reached the cure → no Cure node, not earned.
    const noCure = buildCureTimeline({
      id: "y",
      rounds: ["veg", "mid_flower"],
      stabilityRunCount: 3,
    })!;
    expect(noCure.reachedCure).toBe(false);
    expect(noCure.stages.some((s) => s.kind === "cure")).toBe(false);
    expect(noCure.earned).toBe(false);
  });

  it("carries reversal (the pollen milestone)", () => {
    const t = buildCureTimeline(keeperInput("Gas Runtz"))!;
    expect(t.reversed).toBe(true);
    expect(t.reversalMethods).toContain("colloidal_silver");
  });

  it("clamps a negative stability count and is null-safe", () => {
    const t = buildCureTimeline({ id: "z", rounds: ["post_cure"], stabilityRunCount: -4 })!;
    expect(t.stabilityRuns).toBe(0);
    expect(buildCureTimeline(null)).toBeNull();
    expect(buildCureTimeline(undefined)).toBeNull();
  });
});
