import { describe, it, expect } from "vitest";
import {
  PHENO_HUNT_PROJECT_GOALS,
  REQUIRED_FIELDS,
  containsForbiddenPhenoHuntCopy,
  defaultCandidateLabel,
  emptyPhenoHuntDraft,
  filterCandidatePlants,
  getMissingRequiredFields,
  isDraftReady,
  normaliseCandidateLabel,
  type CandidatePlant,
  type PhenoHuntDraft,
} from "@/lib/phenoHuntStartPageRules";

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

const fullDraft = (): PhenoHuntDraft => ({
  ...emptyPhenoHuntDraft(),
  huntName: "BB Hunt",
  cultivar: "Blue Berry",
  projectGoal: "keeper_selection",
  startDate: "2026-06-18",
  growId: "g1",
  tentId: "t1",
});

describe("phenoHuntStartPageRules", () => {
  it("detects all required fields when draft is empty", () => {
    const missing = getMissingRequiredFields(emptyPhenoHuntDraft());
    expect(missing.sort()).toEqual([...REQUIRED_FIELDS].sort());
    expect(isDraftReady(emptyPhenoHuntDraft())).toBe(false);
  });

  it("ready when all required fields present", () => {
    expect(getMissingRequiredFields(fullDraft())).toEqual([]);
    expect(isDraftReady(fullDraft())).toBe(true);
  });

  it("optional fields do not block readiness", () => {
    const d = { ...fullDraft(), notes: "", generation: undefined };
    expect(isDraftReady(d)).toBe(true);
  });

  it("project goal list is deterministic and non-empty", () => {
    expect(PHENO_HUNT_PROJECT_GOALS.length).toBeGreaterThan(0);
    expect([...PHENO_HUNT_PROJECT_GOALS]).toEqual([
      "keeper_selection",
      "breeding_candidate",
      "stress_test",
      "yield_test",
      "terpene_aroma_selection",
      "structure_selection",
      "disease_pest_resistance_observation",
      "general_observation",
    ]);
  });

  it("filters candidates by grow", () => {
    const plants = [plant({ id: "a", growId: "g1" }), plant({ id: "b", growId: "g2" })];
    const out = filterCandidatePlants(plants, { growId: "g1", tentId: null });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("filters by tent when tent is selected", () => {
    const plants = [
      plant({ id: "a", tentId: "t1" }),
      plant({ id: "b", tentId: "t2" }),
    ];
    const out = filterCandidatePlants(plants, { growId: "g1", tentId: "t1" });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("rejects plants from another grow", () => {
    const out = filterCandidatePlants([plant({ growId: "other" })], {
      growId: "g1",
      tentId: null,
    });
    expect(out).toEqual([]);
  });

  it("hides archived plants by default", () => {
    const plants = [plant({ id: "a" }), plant({ id: "b", isArchived: true })];
    const out = filterCandidatePlants(plants, { growId: "g1", tentId: null });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("includes archived when opted in", () => {
    const plants = [plant({ id: "a" }), plant({ id: "b", isArchived: true })];
    const out = filterCandidatePlants(plants, {
      growId: "g1",
      tentId: null,
      includeArchived: true,
    });
    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("returns empty when no grow selected", () => {
    expect(
      filterCandidatePlants([plant({})], { growId: null, tentId: null }),
    ).toEqual([]);
  });

  it("default candidate labels are stable", () => {
    expect(defaultCandidateLabel("Blue Berry", 0)).toBe("BB-01");
    expect(defaultCandidateLabel("Blue Berry", 9)).toBe("BB-10");
    expect(defaultCandidateLabel("", 0)).toBe("Plant 1");
  });

  it("normaliseCandidateLabel falls back when empty", () => {
    expect(normaliseCandidateLabel("  ", "BB-01")).toBe("BB-01");
    expect(normaliseCandidateLabel("Custom", "BB-01")).toBe("Custom");
  });

  it("flags forbidden sales / certainty copy", () => {
    expect(containsForbiddenPhenoHuntCopy("Now with marketplace access")).toBe(true);
    expect(containsForbiddenPhenoHuntCopy("Guaranteed keeper every time")).toBe(true);
    expect(containsForbiddenPhenoHuntCopy("genetic certainty assured")).toBe(true);
    expect(containsForbiddenPhenoHuntCopy("seed sales open")).toBe(true);
    expect(
      containsForbiddenPhenoHuntCopy("Private plant selection record"),
    ).toBe(false);
  });
});
