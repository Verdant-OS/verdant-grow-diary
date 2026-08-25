/**
 * Loud-axis bridge — the contract between what the workspace/ingest WRITE into
 * pheno_candidate_scores.traits (expression vocabulary: nose_loudness 0–10,
 * quality axes 1–5) and what the shortlist surfaces READ (five Loud axes 0–10).
 *
 * Regression for the live trait-key mismatch: the adapter used to read the
 * keys nose/resin/yield/breeding, which no write path produces, so every
 * workspace-scored candidate rendered four of five axes as 0 and the composite
 * ranked real scores against fabricated zeros. A missing trait must stay
 * MISSING (null) — never a 0 — all the way through the contenders board and
 * fight night.
 */
import { describe, expect, it } from "vitest";
import { traitsToLoudAxes, adaptContenders } from "@/lib/phenoHuntViewAdapter";
import { buildContenders, contenderScore } from "@/lib/phenoContendersViewModel";
import { buildFight } from "@/lib/phenoFightViewModel";

describe("traitsToLoudAxes — canonical expression vocabulary bridge", () => {
  it("maps workspace-written keys (nose_loudness / trichome_coverage / yield_impression) onto the Loud axes", () => {
    const axes = traitsToLoudAxes({
      nose_loudness: 9,
      vigor: 2,
      structure: 3,
      bud_density: 4,
      trichome_coverage: 5,
      stretch: 2,
      yield_impression: 4,
    });
    expect(axes.nose).toBe(9); // 0–10, direct
    expect(axes.resin).toBe(10); // trichome_coverage 5/5 → 10/10
    expect(axes.structure).toBe(5); // 3/5 → 5/10
    expect(axes.yield).toBe(7.5); // 4/5 → 7.5/10
    expect(axes.breeding).toBeNull(); // no workspace axis writes breeding
  });

  it("maps PhenoID-ingest keys (nose_loudness + resin/structure/yield/breeding 1–5)", () => {
    const axes = traitsToLoudAxes({
      nose_loudness: 7,
      resin: 3,
      structure: 5,
      yield: 1,
      breeding: 4,
    });
    expect(axes.nose).toBe(7);
    expect(axes.resin).toBe(5);
    expect(axes.structure).toBe(10);
    expect(axes.yield).toBe(0); // 1/5 is the scale floor → 0/10, a REAL low score
    expect(axes.breeding).toBe(7.5);
  });

  it("keeps missing traits missing — null, never 0", () => {
    const axes = traitsToLoudAxes({});
    expect(axes.nose).toBeNull();
    expect(axes.resin).toBeNull();
    expect(axes.structure).toBeNull();
    expect(axes.yield).toBeNull();
    expect(axes.breeding).toBeNull();
  });

  it("keeps null/absent traits missing when only some axes are scored", () => {
    const axes = traitsToLoudAxes({ nose_loudness: 6 });
    expect(axes.nose).toBe(6);
    expect(axes.resin).toBeNull();
    expect(axes.breeding).toBeNull();
  });
});

describe("contenders board — missingness stays visible", () => {
  it("computes a renormalized partial composite over the scored axes only", () => {
    // nose 8 (weight 30) + structure 5 (weight 15), rest unscored:
    // (8*30 + 5*15) / (30+15) * 10 = 70
    const score = contenderScore({
      nose: 8,
      resin: null,
      structure: 5,
      yield: null,
      breeding: null,
    });
    expect(score).toBe(70);
  });

  it("returns null (not 0) when no axis is scored", () => {
    expect(
      contenderScore({ nose: null, resin: null, structure: null, yield: null, breeding: null }),
    ).toBeNull();
  });

  it("lists unscored candidates after scored ones with no rank and no fabricated 0 score", () => {
    const board = buildContenders([
      {
        id: "scored",
        name: "Scored",
        verdict: "maybe",
        axes: { nose: 5, resin: 5, structure: 5, yield: 5, breeding: 5 },
      },
      {
        id: "unscored",
        name: "Unscored",
        verdict: "maybe",
        axes: { nose: null, resin: null, structure: null, yield: null, breeding: null },
      },
    ]);
    expect(board.contenders.map((c) => c.id)).toEqual(["scored", "unscored"]);
    const unscored = board.contenders[1];
    expect(unscored.score).toBeNull();
    expect(unscored.rank).toBeNull();
    expect(unscored.scoredAxisCount).toBe(0);
    const scored = board.contenders[0];
    expect(scored.score).toBe(50);
    expect(scored.rank).toBe(1);
    expect(scored.scoredAxisCount).toBe(5);
  });

  it("flags a partially scored candidate and never marks a missing axis as leader", () => {
    const board = buildContenders([
      {
        id: "partial",
        name: "Partial",
        verdict: "maybe",
        axes: { nose: 9, resin: null, structure: null, yield: null, breeding: null },
      },
      {
        id: "full",
        name: "Full",
        verdict: "maybe",
        axes: { nose: 3, resin: 4, structure: 4, yield: 4, breeding: 4 },
      },
    ]);
    const partial = board.contenders.find((c) => c.id === "partial");
    expect(partial).toBeDefined();
    expect(partial!.scoredAxisCount).toBe(1);
    const missingAxis = partial!.axes.find((a) => a.key === "resin");
    expect(missingAxis?.value).toBeNull();
    expect(missingAxis?.leader).toBe(false);
  });

  it("adaptContenders carries workspace-vocabulary traits through to non-zero board values", () => {
    const [input] = adaptContenders([
      {
        candidateNumber: 1,
        name: "Runtz #1",
        decision: "hold",
        traits: { nose_loudness: 8, trichome_coverage: 4, structure: 4, yield_impression: 3 },
      },
    ]);
    const board = buildContenders([input]);
    const row = board.contenders[0];
    expect(row.score).not.toBeNull();
    // With the old broken key read, nose/resin/yield were 0 and the composite
    // collapsed toward zero; the bridge must keep it in a real range.
    expect(row.score!).toBeGreaterThan(50);
    expect(row.axes.find((a) => a.key === "breeding")?.value).toBeNull();
  });
});

describe("fight night — a missing axis is unknown, not a 10-0 loss", () => {
  it("marks an axis with a missing side as unknown and excludes it from the tally", () => {
    const fight = buildFight(
      {
        id: "a",
        name: "A",
        verdict: "keep",
        axes: { nose: 8, resin: 8, structure: 8, yield: 8, breeding: null },
      },
      {
        id: "b",
        name: "B",
        verdict: "keep",
        axes: { nose: 7, resin: null, structure: 9, yield: 8, breeding: null },
      },
    );
    expect(fight).not.toBeNull();
    const resin = fight!.axes.find((a) => a.key === "resin");
    expect(resin?.edge).toBe("unknown");
    expect(resin?.bValue).toBeNull();
    const breeding = fight!.axes.find((a) => a.key === "breeding");
    expect(breeding?.edge).toBe("unknown");
    // Tally: nose → a, structure → b, yield → tie. Unknown axes count nowhere.
    expect(fight!.a.axisWins).toBe(1);
    expect(fight!.b.axisWins).toBe(1);
    expect(fight!.ties).toBe(1);
    expect(fight!.unknownAxes).toBe(2);
  });
});
