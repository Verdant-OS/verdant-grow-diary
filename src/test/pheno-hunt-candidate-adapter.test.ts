import { describe, it, expect } from "vitest";
import {
  adaptPhenoHuntCandidates,
  type PhenoHuntCandidatePlantRow,
} from "@/lib/phenoHuntCandidateAdapter";
import { buildPhenoComparisonView } from "@/lib/phenoComparisonViewModel";
import { derivePhenoCompareReadinessFromCandidates } from "@/lib/phenoComparisonActionState";


function plant(overrides: Partial<PhenoHuntCandidatePlantRow> = {}): PhenoHuntCandidatePlantRow {
  return {
    id: "p1",
    name: "Plant One",
    candidate_label: null,
    strain: null,
    stage: null,
    grow_id: null,
    tent_id: null,
    photo_url: null,
    is_archived: false,
    ...overrides,
  };
}

describe("adaptPhenoHuntCandidates", () => {
  it("maps a plant row into the comparison view-model input", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [
        plant({
          id: "plant-a",
          name: "Alpha",
          candidate_label: "A #1",
          strain: "Blue Dream",
          stage: "flower",
          grow_id: "grow-1",
          tent_id: "tent-1",
          photo_url: "https://example.invalid/a.jpg",
        }),
      ],
      growNameById: { "grow-1": "Summer Grow" },
      tentNameById: { "tent-1": "Flower Tent" },
    });

    expect(c).toMatchObject({
      candidateId: "plant-a",
      candidateLabel: "A #1",
      plantLabel: "Alpha",
      strain: "Blue Dream",
      stage: "flower",
      growLabel: "Summer Grow",
      tentLabel: "Flower Tent",
      requireEcPh: true,
      requirePpfd: true,
    });
    expect(c.photos).toEqual([{ id: "plant-a-plant-photo", url: "https://example.invalid/a.jpg" }]);
  });

  it("falls back to plant name when candidate_label is missing/blank", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [plant({ name: "Bravo", candidate_label: "  " })],
    });
    expect(c.candidateLabel).toBe("Bravo");
  });

  it("excludes archived plants", () => {
    const out = adaptPhenoHuntCandidates({
      plants: [plant({ id: "keep" }), plant({ id: "drop", is_archived: true })],
    });
    expect(out.map((c) => c.candidateId)).toEqual(["keep"]);
  });

  it("only treats flower stage as requiring EC/pH/PPFD", () => {
    const [veg] = adaptPhenoHuntCandidates({ plants: [plant({ stage: "veg" })] });
    expect(veg.requireEcPh).toBe(false);
    expect(veg.requirePpfd).toBe(false);
    const [flower] = adaptPhenoHuntCandidates({ plants: [plant({ stage: "FLOWER" })] });
    expect(flower.requireEcPh).toBe(true);
  });

  it("emits no photo entry when photo_url is absent", () => {
    const [c] = adaptPhenoHuntCandidates({ plants: [plant({ photo_url: null })] });
    expect(c.photos).toEqual([]);
  });

  it("leaves label null when grow/tent name is not in the lookup", () => {
    const [c] = adaptPhenoHuntCandidates({ plants: [plant({ grow_id: "g", tent_id: "t" })] });
    expect(c.growLabel).toBeNull();
    expect(c.tentLabel).toBeNull();
  });

  it("sorts deterministically by candidate label then id", () => {
    const out = adaptPhenoHuntCandidates({
      plants: [
        plant({ id: "z", candidate_label: "Zeta" }),
        plant({ id: "a", candidate_label: "Alpha" }),
        plant({ id: "m", candidate_label: "Alpha" }),
      ],
    });
    expect(out.map((c) => c.candidateId)).toEqual(["a", "m", "z"]);
  });

  it("handles null/empty/garbage input without throwing", () => {
    expect(adaptPhenoHuntCandidates({ plants: null })).toEqual([]);
    expect(adaptPhenoHuntCandidates({ plants: undefined })).toEqual([]);
    expect(
      adaptPhenoHuntCandidates({ plants: [{ id: "" } as PhenoHuntCandidatePlantRow] }),
    ).toEqual([]);
  });

  it("produces input that feeds buildPhenoComparisonView and honestly flags missing evidence", () => {
    // Two candidates with no logs/sensors → the view-model should render them
    // and flag the missing evidence rather than inventing it.
    const inputs = adaptPhenoHuntCandidates({
      plants: [plant({ id: "a", name: "A" }), plant({ id: "b", name: "B" })],
    });
    const view = buildPhenoComparisonView(inputs);
    expect(view.ok).toBe(true);
    expect(view.candidates).toHaveLength(2);
    // No sensor snapshot and no quick logs were provided → flagged missing.
    const codes = view.candidates.flatMap((c) => c.missing.map((m) => m.code));
    expect(codes).toContain("no_sensor_snapshot");
    expect(codes).toContain("no_diary");
  });

  it("leaves expression undefined when no evidence rows are provided", () => {
    const [c] = adaptPhenoHuntCandidates({ plants: [plant({ id: "p1" })] });
    expect(c.expression).toBeUndefined();
  });

  it("hydrates traits + noseNote from a candidate score row", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [plant({ id: "p1" })],
      scoreByPlantId: {
        p1: { traits: { nose_loudness: 8, vigor: 4 }, note: "  gassy funk  " },
      },
    });
    expect(c.expression?.noseNote).toBe("gassy funk");
    expect(c.expression?.traits).toEqual([
      { key: "nose_loudness", value: 8 },
      { key: "vigor", value: 4 },
    ]);
  });

  it("hydrates smokeTest from a pheno_smoke_tests row (post-harvest + post-cure)", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [plant({ id: "p1" })],
      smokeTestByPlantId: {
        p1: {
          flavorDescriptors: ["gas", "citrus"],
          effectDescriptors: ["heady"],
          smoothness: 4,
          potencyImpression: 5,
          verdict: "Keeper",
        },
      },
    });
    expect(c.expression?.smokeTest).toEqual({
      flavorDescriptors: ["gas", "citrus"],
      effectDescriptors: ["heady"],
      smoothness: 4,
      potencyImpression: 5,
      verdict: "Keeper",
    });
  });

  it("hydrates labResult from a pheno_lab_results row", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [plant({ id: "p1" })],
      labResultByPlantId: {
        p1: {
          thcPct: 24.5,
          cbdPct: 0.1,
          totalCannabinoidsPct: null,
          dominantTerpenes: [{ name: "limonene", pct: 1.2 }],
          source: "coa",
        },
      },
    });
    expect(c.expression?.labResult).toEqual({
      thcPct: 24.5,
      cbdPct: 0.1,
      totalCannabinoidsPct: null,
      dominantTerpenes: [{ name: "limonene", pct: 1.2 }],
      source: "coa",
    });
  });

  it("skips smokeTest scaffolding when the row has no content", () => {
    const [c] = adaptPhenoHuntCandidates({
      plants: [plant({ id: "p1" })],
      smokeTestByPlantId: {
        p1: {
          flavorDescriptors: [],
          effectDescriptors: [],
          smoothness: null,
          potencyImpression: null,
          verdict: null,
        },
      },
    });
    expect(c.expression).toBeUndefined();
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      plants: [plant({ id: "p1" }), plant({ id: "p2", name: "Bravo" })],
      scoreByPlantId: {
        p1: { traits: { vigor: 4, nose_loudness: 7 }, note: "loud" },
      },
    };
    expect(adaptPhenoHuntCandidates(input)).toEqual(adaptPhenoHuntCandidates(input));
  });

  it("hydration is enough to satisfy derivePhenoCompareReadinessFromCandidates → comparison_ready", () => {
    const inputs = adaptPhenoHuntCandidates({
      plants: [plant({ id: "a", name: "A" }), plant({ id: "b", name: "B" })],
      scoreByPlantId: {
        a: { traits: { nose_loudness: 8 }, note: "loud gas" },
        b: { traits: { nose_loudness: 6 }, note: "sweet fruit" },
      },
      smokeTestByPlantId: {
        a: {
          flavorDescriptors: ["gas"],
          effectDescriptors: ["heady"],
          smoothness: 4,
          potencyImpression: 4,
          verdict: "Keeper",
        },
        b: {
          flavorDescriptors: ["citrus"],
          effectDescriptors: ["uplifting"],
          smoothness: 3,
          potencyImpression: 3,
          verdict: "Runner up",
        },
      },
    });
    const state = derivePhenoCompareReadinessFromCandidates("hunt-1", inputs);
    expect(state.readiness).toBe("comparison_ready");
    expect(state.enabled).toBe(true);
  });

  it("candidates with no evidence still resolve to not comparison-ready", () => {
    const inputs = adaptPhenoHuntCandidates({
      plants: [plant({ id: "a", name: "A" }), plant({ id: "b", name: "B" })],
    });
    const state = derivePhenoCompareReadinessFromCandidates("hunt-1", inputs);
    expect(state.readiness).not.toBe("comparison_ready");
    expect(state.enabled).toBe(false);
  });

  it("replication readiness stays a non-blocking undefined signal (documented contract)", () => {
    // Contract: replication readiness (clones / mother assignment) is not
    // persisted today. `derivePhenoCompareReadinessFromCandidates` treats
    // `undefined` as satisfied — post-cure is the deciding gate. If a table
    // starts persisting it, wire it in explicitly rather than silently.
    const inputs = adaptPhenoHuntCandidates({
      plants: [plant({ id: "a" }), plant({ id: "b" })],
      scoreByPlantId: {
        a: { traits: { nose_loudness: 7 }, note: "loud" },
        b: { traits: { nose_loudness: 6 }, note: "sweet" },
      },
      smokeTestByPlantId: {
        a: { flavorDescriptors: ["gas"], effectDescriptors: [], smoothness: null, potencyImpression: null, verdict: "keep" },
        b: { flavorDescriptors: ["citrus"], effectDescriptors: [], smoothness: null, potencyImpression: null, verdict: "keep" },
      },
    });
    expect(derivePhenoCompareReadinessFromCandidates("h", inputs).readiness).toBe(
      "comparison_ready",
    );
  });
});

