import { describe, it, expect } from "vitest";
import {
  decisionToVerdict,
  traitsToLoudAxes,
  adaptContenders,
  adaptKeepers,
  adaptCureTimelines,
  buildPhenoHuntView,
  LOUD_AXIS_KEYS,
} from "@/lib/phenoHuntViewAdapter";
import { buildContenders } from "@/lib/phenoContendersViewModel";

describe("phenoHuntViewAdapter", () => {
  it("maps keeper decisions to a triage verdict (hold/undecided → maybe, never keep)", () => {
    expect(decisionToVerdict("keep")).toBe("keep");
    expect(decisionToVerdict("cull")).toBe("cull");
    expect(decisionToVerdict("hold")).toBe("maybe");
    expect(decisionToVerdict("undecided")).toBe("maybe");
    expect(decisionToVerdict(null)).toBe("maybe");
    expect(decisionToVerdict("garbage")).toBe("maybe");
  });

  it("reads exactly the five Loud axes and ignores extra live traits", () => {
    const axes = traitsToLoudAxes({
      nose: 9,
      resin: 8,
      structure: 7,
      yield: 7,
      breeding: 8,
      // extra traits the live card also stores — deliberately not folded in:
      flavor: 10,
      potency: 10,
      vigor: 3,
    });
    expect(axes).toEqual({ nose: 9, resin: 8, structure: 7, yield: 7, breeding: 8 });
    expect(LOUD_AXIS_KEYS).toEqual(["nose", "resin", "structure", "yield", "breeding"]);
  });

  it("treats a missing trait as 0 and clamps out-of-range", () => {
    const axes = traitsToLoudAxes({ nose: 99, resin: -2 });
    expect(axes.nose).toBe(10);
    expect(axes.resin).toBe(0);
    expect(axes.structure).toBe(0); // missing → 0, never invented
    expect(traitsToLoudAxes(null)).toEqual({
      nose: 0,
      resin: 0,
      structure: 0,
      yield: 0,
      breeding: 0,
    });
  });

  it("adapts candidates into contender inputs that score through the real board", () => {
    const contenders = adaptContenders([
      {
        candidateNumber: 3,
        name: "Gas Runtz",
        decision: "keep",
        traits: { nose: 9, resin: 8, structure: 7, yield: 7, breeding: 8 },
        aroma: [" diesel ", "gas", ""],
      },
      { candidateNumber: 4, name: "Runtz #4", decision: "cull", traits: { nose: 4 } },
      { candidateNumber: 2, name: "Runtz #2", decision: "hold", traits: { nose: 7 } },
    ]);
    // aroma is trimmed and empties dropped
    expect(contenders[0].aroma).toEqual(["diesel", "gas"]);
    // Runs through the canonical board: culls drop, keeper scores 80, sorted.
    const board = buildContenders(contenders);
    expect(board.culledCount).toBe(1);
    expect(board.contenders[0].name).toBe("Gas Runtz");
    expect(board.contenders[0].score).toBe(80);
  });

  it("adapts keepers and their cure timelines (rounds filtered to the known set)", () => {
    const src = [
      {
        id: "k1",
        name: "Gas Runtz",
        reversed: true,
        reversalMethods: ["colloidal_silver"],
        cloneCount: 4,
        stabilityRunCount: 2,
        rounds: ["veg", "mid_flower", "post_cure", "bogus_round"],
      },
    ];
    const keepers = adaptKeepers(src);
    expect(keepers[0]).toMatchObject({
      id: "k1",
      reversed: true,
      cloneCount: 4,
      stabilityRunCount: 2,
    });
    const timelines = adaptCureTimelines(src);
    expect(timelines[0].rounds).toEqual(["veg", "mid_flower", "post_cure"]); // bogus dropped
    expect(timelines[0].stabilityRunCount).toBe(2);
  });

  it("composes a full bundle and passes crosses/clones through untouched", () => {
    const bundle = buildPhenoHuntView({
      candidates: [{ candidateNumber: 1, name: "A", decision: "keep", traits: { nose: 5 } }],
      keepers: [{ id: "k1", name: "A", stabilityRunCount: 1, rounds: ["post_cure"] }],
      crosses: [{ id: "x1", crossName: "A × B", crossType: "standard_f1", femaleKeeperId: "k1" }],
      clones: [{ id: "c1", parentCloneId: null, cloneLabel: "A — mother" }],
    });
    expect(bundle.contenders).toHaveLength(1);
    expect(bundle.keepers).toHaveLength(1);
    expect(bundle.crosses).toHaveLength(1);
    expect(bundle.clones).toHaveLength(1);
    expect(bundle.cureTimelines).toHaveLength(1);
  });
});
