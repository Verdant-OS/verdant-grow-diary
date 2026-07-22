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
  phenoSnapshotFromSensorSnapshot,
  type RealPhenoCandidatePlant,
  type RealPhenoActivityRow,
} from "@/lib/phenoComparisonRealInput";
import { buildPhenoComparisonViewModel } from "@/lib/phenoComparisonViewModel";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

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

  it("attaches the tent snapshot and photo when provided", () => {
    const input = buildRealPhenoComparisonInput({
      huntName: "H",
      growName: "Run A",
      tentNameById: { t1: "Flower Tent" },
      candidates: [
        plant({ id: "p1", candidate_label: "#1", tent_id: "t1" }),
        plant({ id: "p2", candidate_label: "#2", tent_id: "t9" }),
      ],
      activityByPlant: {},
      photoUrlByPlant: { p1: "https://example.test/signed/photo1.jpg" },
      snapshotByTent: {
        t1: {
          source: "manual",
          capturedAt: "2026-07-20T10:00:00Z",
          temp: 24.5,
          rh: 55,
          vpd: 1.1,
        },
      },
    });
    expect(input.candidates[0].photoUrl).toBe(
      "https://example.test/signed/photo1.jpg",
    );
    expect(input.candidates[0].snapshot?.source).toBe("manual");
    expect(input.candidates[0].snapshot?.temp).toBe(24.5);
    // Candidate in an unmapped tent gets no snapshot — honest gap, not a copy.
    expect(input.candidates[1].snapshot ?? null).toBeNull();
    expect(input.candidates[1].photoUrl ?? null).toBeNull();
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
      // Snapshot is explicitly null (not fabricated) when no tent snapshot
      // was provided — the engine renders the honest no-snapshot flag.
      expect(c.snapshot ?? null).toBeNull();
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

describe("phenoSnapshotFromSensorSnapshot — canonical snapshot bridge", () => {
  function snap(over: Partial<SensorSnapshot>): SensorSnapshot {
    return {
      source: "manual",
      ts: "2026-07-20T10:00:00Z",
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
      csvVendor: null,
      ...over,
    } as SensorSnapshot;
  }

  it("maps source/capturedAt/metrics through", () => {
    const out = phenoSnapshotFromSensorSnapshot(snap({}));
    expect(out).toEqual({
      source: "manual",
      capturedAt: "2026-07-20T10:00:00Z",
      temp: 24,
      rh: 55,
      vpd: 1.1,
      ppfd: null,
    });
  });

  it("maps sim → demo so simulated data is never presented as real", () => {
    expect(phenoSnapshotFromSensorSnapshot(snap({ source: "sim" }))?.source).toBe(
      "demo",
    );
  });

  it("maps unavailable/missing to null (honest no-snapshot flag)", () => {
    expect(
      phenoSnapshotFromSensorSnapshot(snap({ source: "unavailable" })),
    ).toBeNull();
    expect(phenoSnapshotFromSensorSnapshot(null)).toBeNull();
    expect(phenoSnapshotFromSensorSnapshot(undefined)).toBeNull();
  });
});
