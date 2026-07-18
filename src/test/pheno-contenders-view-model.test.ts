import { describe, it, expect } from "vitest";
import {
  buildContenders,
  contenderScore,
  CONTENDER_AXES,
  type ContenderInput,
} from "@/lib/phenoContendersViewModel";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

/** The demo pack, shaped for the contenders board. */
const DEMO_INPUT: ContenderInput[] = DEMO_CANDIDATES.map((c) => ({
  id: c.candidateNumber,
  name: c.name,
  verdict: c.verdict,
  aroma: c.aroma,
  axes: c.loud,
}));

describe("phenoContendersViewModel", () => {
  it("drops culls from the board and counts them", () => {
    const board = buildContenders(DEMO_INPUT);
    const culls = DEMO_CANDIDATES.filter((c) => c.verdict === "cull").length;
    expect(board.culledCount).toBe(culls);
    expect(board.contenders.every((r) => r.verdict !== "cull")).toBe(true);
    expect(board.contenders).toHaveLength(DEMO_CANDIDATES.length - culls);
  });

  it("sorts contenders by composite score, descending, with 1-based ranks", () => {
    const board = buildContenders(DEMO_INPUT);
    const scores = board.contenders.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(board.contenders.map((r) => r.rank)).toEqual(board.contenders.map((_, i) => i + 1));
    // Both keepers should surface at the top of the shortlist.
    expect(board.contenders[0].name).toBe("Gas Runtz");
    expect(board.contenders[1].name).toBe("Sherb Cake");
  });

  it("computes the canonical Loud composite (0–100)", () => {
    const board = buildContenders(DEMO_INPUT);
    const gas = board.contenders.find((r) => r.name === "Gas Runtz")!;
    const cake = board.contenders.find((r) => r.name === "Sherb Cake")!;
    expect(gas.score).toBe(80); // 9*3 + 8*2.5 + 7*1.5 + 7*1.5 + 8*1.5
    expect(cake.score).toBe(78); // 8*3 + 9*2.5 + 7*1.5 + 6*1.5 + 8*1.5
    expect(contenderScore({ nose: 10, resin: 10, structure: 10, yield: 10, breeding: 10 })).toBe(
      100,
    );
    expect(contenderScore({ nose: 0, resin: 0, structure: 0, yield: 0, breeding: 0 })).toBe(0);
  });

  it("flags the axis leader, and flags ALL of a tie (honest)", () => {
    const board = buildContenders(DEMO_INPUT);
    const leadersFor = (key: string) =>
      board.contenders.filter((r) => r.axes.find((a) => a.key === key)!.leader).map((r) => r.name);
    expect(leadersFor("nose")).toEqual(["Gas Runtz"]); // 9 is unique
    expect(leadersFor("resin")).toEqual(["Sherb Cake"]); // 9 is unique
    // Yield: Gas Runtz, Runtz #5 and Runtz #8 all hit 7 — a three-way tie.
    expect(leadersFor("yield").sort()).toEqual(["Gas Runtz", "Runtz #5", "Runtz #8"]);
  });

  it("clamps axis values into 0–10 before scoring", () => {
    const board = buildContenders([
      {
        id: "hi",
        verdict: "maybe",
        axes: { nose: 99, resin: 10, structure: 10, yield: 10, breeding: 10 },
      },
      {
        id: "lo",
        verdict: "maybe",
        axes: { nose: -5, resin: 0, structure: 0, yield: 0, breeding: 0 },
      },
    ]);
    const hi = board.contenders.find((r) => r.id === "hi")!;
    const lo = board.contenders.find((r) => r.id === "lo")!;
    expect(hi.axes.find((a) => a.key === "nose")!.value).toBe(10);
    expect(hi.score).toBe(100);
    expect(lo.axes.find((a) => a.key === "nose")!.value).toBe(0);
    expect(lo.score).toBe(0);
  });

  it("exposes the five canonical axes with weights summing to 100", () => {
    expect(CONTENDER_AXES.map((a) => a.key)).toEqual([
      "nose",
      "resin",
      "structure",
      "yield",
      "breeding",
    ]);
    expect(CONTENDER_AXES.reduce((s, a) => s + a.weightPct, 0)).toBe(100);
  });

  it("is calm on empty / nullish input", () => {
    expect(buildContenders([]).contenders).toHaveLength(0);
    expect(buildContenders(null).culledCount).toBe(0);
    expect(buildContenders(undefined).maxScore).toBe(0);
  });
});
