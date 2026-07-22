/**
 * buildRealPhenoComparisonInput — pure mapper unit tests.
 *
 * Verifies real hunt/candidate/activity rows map onto the PhenoComparisonInput
 * the shared engine consumes: never flagged as demo, deterministic candidate
 * order, null-safe field mapping, and honest omission of the structured fields
 * that have no store yet.
 */
import { describe, it, expect } from "vitest";
import {
  buildRealPhenoComparisonInput,
  type RealPhenoCandidatePlant,
  type RealPhenoActivityRow,
} from "@/lib/phenoComparisonRealInput";
import { buildPhenoComparisonViewModel } from "@/lib/phenoComparisonViewModel";

function plant(over: Partial<RealPhenoCandidatePlant> & { id: string }): RealPhenoCandidatePlant {
  return {
    candidate_label: null,
    name: null,
    strain: null,
    stage: null,
    grow_id: "g1",
    tent_id: null,
    ...over,
  };
}

describe("buildRealPhenoComparisonInput", () => {
  it("never marks a real comparison as demo/sample data", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "Blue Dream Hunt",
      growName: "Run A",
      tentNameById: {},
      candidates: [plant({ id: "p1", candidate_label: "#1" })],
      activityByPlant: {},
    });
    expect(input.isDemo).toBe(false);
    expect(input.huntName).toBe("Blue Dream Hunt");
  });

  it("orders candidates by numeric label (#1 < #2 < #10), not input order", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [
        plant({ id: "p10", candidate_label: "#10" }),
        plant({ id: "p2", candidate_label: "#2" }),
        plant({ id: "p1", candidate_label: "#1" }),
      ],
      activityByPlant: {},
    });
    expect(input.candidates.map((c) => c.candidateLabel)).toEqual(["#1", "#2", "#10"]);
  });

  it("resolves tent names from the map and leaves unknown tents null", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: { t1: "Flower Tent" },
      candidates: [
        plant({ id: "p1", candidate_label: "#1", tent_id: "t1" }),
        plant({ id: "p2", candidate_label: "#2", tent_id: "t9" }),
      ],
      activityByPlant: {},
    });
    expect(input.candidates[0].tentName).toBe("Flower Tent");
    expect(input.candidates[1].tentName).toBeNull();
    expect(input.candidates.every((c) => c.growName === "Run A")).toBe(true);
  });

  it("maps recent activity into quick logs + timeline events (capped)", () => {
    const activity: RealPhenoActivityRow[] = [
      { id: "e1", at: "2026-07-01T10:00:00Z", kind: "watering", note: "1L" },
      { id: "e2", at: "2026-06-30T10:00:00Z", kind: "observation", note: "healthy" },
    ];
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [plant({ id: "p1", candidate_label: "#1" })],
      activityByPlant: { p1: activity },
      maxActivityPerCandidate: 1,
    });
    expect(input.candidates[0].quickLogs).toHaveLength(1);
    expect(input.candidates[0].quickLogs?.[0].kind).toBe("watering");
    expect(input.candidates[0].timelineEvents).toHaveLength(1);
  });

  it("falls back to a positional candidate label when none is stored", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [plant({ id: "p1", candidate_label: null, name: "Plant A" })],
      activityByPlant: {},
    });
    expect(input.candidates[0].candidateLabel).toBe("#1");
    expect(input.candidates[0].plantName).toBe("Plant A");
  });

  it("omits structured phenotype/postCure/snapshot so the engine flags honest gaps", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: {},
      candidates: [
        plant({ id: "p1", candidate_label: "#1", tent_id: "t1" }),
        plant({ id: "p2", candidate_label: "#2", tent_id: "t1" }),
      ],
      activityByPlant: {},
    });
    for (const c of input.candidates) {
      expect(c.phenotype).toBeUndefined();
      expect(c.postCure).toBeUndefined();
      expect(c.snapshot).toBeUndefined();
    }
    // The shared engine must accept this input and surface evidence-gap caveats
    // (thin phenotype, no sensor snapshot) rather than inventing data.
    const vm = buildPhenoComparisonViewModel(input);
    expect(vm.isDemo).toBe(false);
    expect(vm.candidateCount).toBe(2);
    const codes = vm.candidates[0].selectionCaveats.map((c) => c.code);
    expect(codes).toContain("thin_phenotype");
  });
});
