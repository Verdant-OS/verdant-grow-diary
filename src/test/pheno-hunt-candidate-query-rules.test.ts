import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPhenoHuntCandidateOrFilter,
  plantMatchesPhenoHuntCandidate,
  PHENO_HUNT_EMPTY_CANDIDATES,
} from "@/lib/phenoHuntCandidateQueryRules";

const ROOT = resolve(__dirname, "../..");

describe("buildPhenoHuntCandidateOrFilter", () => {
  it("grow scope: plant.grow_id OR tent membership", () => {
    expect(
      buildPhenoHuntCandidateOrFilter({
        growId: "g1",
        tentIdsInGrow: ["t1", "t2"],
      }),
    ).toBe("grow_id.eq.g1,tent_id.in.(t1,t2)");
  });

  it("grow scope with no tents: grow_id only", () => {
    expect(
      buildPhenoHuntCandidateOrFilter({
        growId: "g1",
        tentIdsInGrow: [],
      }),
    ).toBe("grow_id.eq.g1");
  });

  it("tent scope includes tent plants and grow-bound tentless plants", () => {
    expect(
      buildPhenoHuntCandidateOrFilter({
        growId: "g1",
        tentIdsInGrow: ["t1"],
        tentScopeId: "t1",
      }),
    ).toBe("tent_id.eq.t1,and(grow_id.eq.g1,tent_id.is.null)");
  });

  it("null when growId missing", () => {
    expect(buildPhenoHuntCandidateOrFilter({ growId: "", tentIdsInGrow: [] })).toBeNull();
  });
});

describe("plantMatchesPhenoHuntCandidate", () => {
  const tents = ["t1"];

  it("matches direct grow_id", () => {
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: "g1",
        plantTentId: null,
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(true);
  });

  it("matches tent rollup with null plant grow_id", () => {
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: null,
        plantTentId: "t1",
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(true);
  });

  it("rejects plants outside grow and tents", () => {
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: null,
        plantTentId: "other",
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(false);
  });

  it("tent scope: includes tent plant and grow-bound tentless", () => {
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: null,
        plantTentId: "t1",
        growId: "g1",
        tentIdsInGrow: tents,
        tentScopeId: "t1",
      }),
    ).toBe(true);
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: "g1",
        plantTentId: null,
        growId: "g1",
        tentIdsInGrow: tents,
        tentScopeId: "t1",
      }),
    ).toBe(true);
    expect(
      plantMatchesPhenoHuntCandidate({
        plantGrowId: "g1",
        plantTentId: "t2",
        growId: "g1",
        tentIdsInGrow: tents,
        tentScopeId: "t1",
      }),
    ).toBe(false);
  });
});

describe("PhenoHuntNew wiring", () => {
  const PAGE = readFileSync(resolve(ROOT, "src/pages/PhenoHuntNew.tsx"), "utf8");

  it("uses dual-binding candidate filter helper", () => {
    expect(PAGE).toMatch(/buildPhenoHuntCandidateOrFilter/);
    expect(PAGE).not.toMatch(/buildGrowScopedPlantsOrFilter/);
  });

  it("surfaces plant query errors instead of silent empty lists", () => {
    expect(PAGE).toMatch(/plantsRes\.error/);
  });

  it("empty state offers plants + start room + lineage", () => {
    expect(PAGE).toMatch(/ph-empty-cta/);
    expect(PAGE).toMatch(/ph-empty-start-room/);
    expect(PAGE).toMatch(/ph-empty-lineage/);
    expect(PAGE).toMatch(/PHENO_HUNT_EMPTY_CANDIDATES/);
  });
});
