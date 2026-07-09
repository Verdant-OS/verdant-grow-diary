import { describe, it, expect } from "vitest";
import {
  PHENO_SEX_OBSERVATIONS,
  PHENO_SEX_OBSERVATION_CAVEAT,
  DEFAULT_SEX_OBSERVATION,
  normalizeSexObservation,
  sexObservationLabel,
  buildSexObservationView,
  summarizeSexObservations,
} from "@/lib/phenoSexObservationModel";

describe("normalizeSexObservation", () => {
  it("accepts canonical values and common grower shorthands", () => {
    expect(normalizeSexObservation("female")).toBe("female");
    expect(normalizeSexObservation("F")).toBe("female");
    expect(normalizeSexObservation("fem")).toBe("female");
    expect(normalizeSexObservation(" M ")).toBe("male");
    expect(normalizeSexObservation("hermie")).toBe("hermaphrodite");
    expect(normalizeSexObservation("intersex")).toBe("hermaphrodite");
    expect(normalizeSexObservation("unsexed")).toBe("unknown");
  });
  it("defaults anything unrecognized to unknown (never guesses a sex)", () => {
    for (const v of ["", "boy", "girl", "xy", null, undefined, 1, {}]) {
      expect(normalizeSexObservation(v as unknown)).toBe("unknown");
    }
  });
  it("exposes exactly female/male/hermaphrodite/unknown, default unknown", () => {
    expect([...PHENO_SEX_OBSERVATIONS]).toEqual(["female", "male", "hermaphrodite", "unknown"]);
    expect(DEFAULT_SEX_OBSERVATION).toBe("unknown");
  });
});

describe("sexObservationLabel", () => {
  it("maps each observation to a human label", () => {
    expect(sexObservationLabel("female")).toBe("Female");
    expect(sexObservationLabel("male")).toBe("Male");
    expect(sexObservationLabel("hermaphrodite")).toBe("Hermaphrodite");
    expect(sexObservationLabel("unknown")).toBe("Unknown");
  });
});

describe("buildSexObservationView", () => {
  it("normalizes sex, keeps note/observedAt, and marks recorded state", () => {
    const v = buildSexObservationView({
      candidateId: "p1",
      candidateLabel: "BD #1",
      sex: "FEM",
      observedAt: "2026-02-20T00:00:00Z",
      note: "pistils at week 3",
    });
    expect(v).toMatchObject({
      candidateId: "p1",
      candidateLabel: "BD #1",
      sex: "female",
      sexLabel: "Female",
      observedAt: "2026-02-20T00:00:00Z",
      note: "pistils at week 3",
      isRecorded: true,
    });
  });
  it("treats unknown as not recorded; falls back to candidateId for a blank label", () => {
    const v = buildSexObservationView({ candidateId: "abc", candidateLabel: "  " });
    expect(v.sex).toBe("unknown");
    expect(v.isRecorded).toBe(false);
    expect(v.candidateLabel).toBe("abc");
  });
});

describe("summarizeSexObservations", () => {
  it("tallies observations and preserves input order (never ranks)", () => {
    const summary = summarizeSexObservations([
      { candidateId: "c1", sex: "female" },
      { candidateId: "c2", sex: "male" },
      { candidateId: "c3", sex: "female" },
      { candidateId: "c4" }, // unknown
      { candidateId: "c5", sex: "hermie" },
    ]);
    expect(summary.candidates.map((c) => c.candidateId)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(summary.tally).toEqual({ female: 2, male: 1, hermaphrodite: 1, unknown: 1 });
    expect(summary.recordedCount).toBe(4);
    expect(summary.unknownCount).toBe(1);
  });

  it("always carries the no-inference caveat", () => {
    const summary = summarizeSexObservations([{ candidateId: "c1", sex: "female" }]);
    expect(summary.caveat).toBe(PHENO_SEX_OBSERVATION_CAVEAT);
    expect(summary.caveat.toLowerCase()).toContain("does not detect or predict");
    // The model exposes no detect/predict/infer affordance — sex is recorded data.
    expect(Object.keys(summary)).not.toContain("predict");
    expect(Object.keys(summary)).not.toContain("detect");
  });

  it("skips garbage rows and handles null/undefined input", () => {
    expect(summarizeSexObservations(null).candidates).toEqual([]);
    expect(summarizeSexObservations(undefined).tally).toEqual({
      female: 0,
      male: 0,
      hermaphrodite: 0,
      unknown: 0,
    });
    const summary = summarizeSexObservations([
      { candidateId: "a", sex: "female" },
      { candidateId: "" } as never,
    ]);
    expect(summary.candidates.map((c) => c.candidateId)).toEqual(["a"]);
  });
});
