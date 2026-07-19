import { describe, it, expect } from "vitest";
import { buildFight } from "@/lib/phenoFightViewModel";
import type { ContenderInput } from "@/lib/phenoContendersViewModel";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const toInput = (num: number): ContenderInput => {
  const c = DEMO_CANDIDATES.find((x) => x.candidateNumber === num)!;
  return { id: c.candidateNumber, name: c.name, verdict: c.verdict, aroma: c.aroma, axes: c.loud };
};

const GAS = toInput(3); // Gas Runtz {9,8,7,7,8}
const CAKE = toInput(7); // Sherb Cake {8,9,7,6,8}

describe("phenoFightViewModel", () => {
  it("assigns the per-axis edge (or a tie)", () => {
    const fight = buildFight(GAS, CAKE)!;
    const edge = (key: string) => fight.axes.find((a) => a.key === key)!.edge;
    expect(edge("nose")).toBe("a"); // 9 > 8
    expect(edge("resin")).toBe("b"); // 8 < 9
    expect(edge("structure")).toBe("tie"); // 7 = 7
    expect(edge("yield")).toBe("a"); // 7 > 6
    expect(edge("breeding")).toBe("tie"); // 8 = 8
  });

  it("tallies trait wins per side and ties, with no overall winner", () => {
    const fight = buildFight(GAS, CAKE)!;
    expect(fight.a.axisWins).toBe(2); // nose, yield
    expect(fight.b.axisWins).toBe(1); // resin
    expect(fight.ties).toBe(2); // structure, breeding
    // Ethos: the model never declares a winner.
    expect("winner" in fight).toBe(false);
    expect((fight as unknown as Record<string, unknown>).winner).toBeUndefined();
  });

  it("carries each side's canonical composite and margins", () => {
    const fight = buildFight(GAS, CAKE)!;
    expect(fight.a.score).toBe(80);
    expect(fight.b.score).toBe(78);
    expect(fight.axes.find((a) => a.key === "nose")!.margin).toBe(1);
    expect(fight.axes.find((a) => a.key === "structure")!.margin).toBe(0);
  });

  it("clamps out-of-range axis values before comparing", () => {
    const fight = buildFight(
      {
        id: "hi",
        verdict: "keep",
        axes: { nose: 99, resin: 5, structure: 5, yield: 5, breeding: 5 },
      },
      {
        id: "lo",
        verdict: "keep",
        axes: { nose: 8, resin: 5, structure: 5, yield: 5, breeding: 5 },
      },
    )!;
    expect(fight.axes.find((a) => a.key === "nose")!.aValue).toBe(10);
    expect(fight.axes.find((a) => a.key === "nose")!.edge).toBe("a");
    expect(fight.axes.find((a) => a.key === "resin")!.edge).toBe("tie");
  });

  it("returns null when a side is missing", () => {
    expect(buildFight(GAS, null)).toBeNull();
    expect(buildFight(undefined, CAKE)).toBeNull();
  });
});
