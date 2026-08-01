import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  plantEligibleForGrow,
  resolvePhenoCandidateBinding,
  buildPhenoHuntCandidateOptions,
  phenoHuntEmptyCopy,
} from "@/lib/phenoHuntCandidateRules";

const ROOT = resolve(__dirname, "../..");

describe("phenoHuntCandidateRules", () => {
  const tents = ["t1", "t2"];

  it("accepts plant with direct grow_id even without tent", () => {
    expect(
      plantEligibleForGrow({
        plantGrowId: "g1",
        plantTentId: null,
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(true);
    expect(
      resolvePhenoCandidateBinding({
        plantGrowId: "g1",
        plantTentId: null,
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe("grow_id");
  });

  it("accepts plant linked only via tent grow (null plant.grow_id)", () => {
    expect(
      plantEligibleForGrow({
        plantGrowId: null,
        plantTentId: "t1",
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(true);
    expect(
      resolvePhenoCandidateBinding({
        plantGrowId: null,
        plantTentId: "t1",
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe("tent_grow");
  });

  it("rejects plants outside grow and tents", () => {
    expect(
      plantEligibleForGrow({
        plantGrowId: "other",
        plantTentId: "t99",
        growId: "g1",
        tentIdsInGrow: tents,
      }),
    ).toBe(false);
  });

  it("merges and dedupes candidates; tent filter works", () => {
    const plants = [
      { id: "p1", name: "A", grow_id: "g1", tent_id: null, strain: null },
      { id: "p2", name: "B", grow_id: null, tent_id: "t1", strain: "OG" },
      { id: "p2", name: "B", grow_id: null, tent_id: "t1", strain: "OG" }, // dup
      { id: "p3", name: "C", grow_id: "g1", tent_id: "t2", strain: null },
      { id: "p4", name: "Archived", grow_id: "g1", tent_id: null, is_archived: true },
    ];
    const all = buildPhenoHuntCandidateOptions({
      growId: "g1",
      tentIdsInGrow: tents,
      plants,
    });
    expect(all.map((c) => c.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(all.find((c) => c.id === "p1")?.binding).toBe("grow_id");
    expect(all.find((c) => c.id === "p2")?.missingDirectGrowId).toBe(true);

    const tentOnly = buildPhenoHuntCandidateOptions({
      growId: "g1",
      tentIdsInGrow: tents,
      plants,
      filterTentId: "t1",
    });
    expect(tentOnly.map((c) => c.id)).toEqual(["p2"]);
  });

  it("empty copy distinguishes tent filter vs grow empty", () => {
    expect(phenoHuntEmptyCopy({ candidateCount: 0 }).headline).toMatch(/No plants in this grow/);
    expect(
      phenoHuntEmptyCopy({
        candidateCount: 0,
        filterTentId: "t1",
        growPlantCountIgnoringTent: 3,
      }).headline,
    ).toMatch(/No plants in this tent/);
  });
});

describe("PhenoHuntNew wiring", () => {
  const PAGE = readFileSync(resolve(ROOT, "src/pages/PhenoHuntNew.tsx"), "utf8");
  const LOADER = readFileSync(resolve(ROOT, "src/lib/phenoHuntCandidateLoader.ts"), "utf8");

  it("uses the dual-binding loader", () => {
    expect(PAGE).toMatch(/loadPhenoHuntCandidates/);
    expect(LOADER).toMatch(/\.eq\("grow_id", growId\)/);
    expect(LOADER).toMatch(/\.in\("tent_id", tentIdsInGrow\)/);
  });

  it("keeps save and toggle test ids", () => {
    expect(PAGE).toMatch(/ph-save-btn/);
    expect(PAGE).toMatch(/ph-toggle-\$/);
  });
});
