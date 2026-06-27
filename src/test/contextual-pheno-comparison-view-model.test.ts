/**
 * contextual-pheno-comparison-view-model.test
 *
 * Read-only behavioral tests for buildContextualPhenoComparisonView.
 *
 * Asserts:
 *  - 2-plant happy path is deterministic
 *  - supports up to 4 plants
 *  - <2 plants returns too_few_plants
 *  - >4 plants returns too_many_plants
 *  - duplicate plant ids rejected
 *  - count aggregation per plant
 *  - sensor sources stay separated (no merging)
 *  - demo/stale/invalid/unknown produce trustWarnings
 *  - missing context surfaces explicitly
 *  - invalid numeric sensor values are ignored
 *  - no ranking / winner selection appears
 *  - stable output from same input
 *  - tied labels produce stable ordering by plantId then input index
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildContextualPhenoComparisonView,
  CONTEXTUAL_PHENO_COMPARISON_CAVEAT,
  type ContextualPhenoPlantInput,
} from "@/lib/contextualPhenoComparisonViewModel";

function plant(
  id: string,
  overrides: Partial<ContextualPhenoPlantInput> = {},
): ContextualPhenoPlantInput {
  return {
    plantId: id,
    plantLabel: `Plant ${id}`,
    growId: "g1",
    tentId: "t1",
    strain: "Test Strain",
    stage: "veg",
    status: "active",
    diaryCount: 0,
    photoCount: 0,
    wateringCount: 0,
    feedingCount: 0,
    trainingCount: 0,
    alertCount: 0,
    sensorReadings: [],
    comparisonNotes: [],
    ...overrides,
  };
}

describe("buildContextualPhenoComparisonView — guards", () => {
  it("returns too_few_plants for 0 or 1 plants", () => {
    expect(buildContextualPhenoComparisonView([]).error).toBe("too_few_plants");
    expect(
      buildContextualPhenoComparisonView([plant("a")]).error,
    ).toBe("too_few_plants");
  });

  it("returns too_many_plants for 5+ plants", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a"),
      plant("b"),
      plant("c"),
      plant("d"),
      plant("e"),
    ]);
    expect(v.error).toBe("too_many_plants");
    expect(v.ok).toBe(false);
  });

  it("rejects duplicate plant ids", () => {
    const v = buildContextualPhenoComparisonView([plant("a"), plant("a")]);
    expect(v.error).toBe("duplicate_plant_ids");
  });

  it("accepts up to 4 plants", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a"),
      plant("b"),
      plant("c"),
      plant("d"),
    ]);
    expect(v.ok).toBe(true);
    expect(v.plants).toHaveLength(4);
  });

  it("includes the safe caveat string", () => {
    const v = buildContextualPhenoComparisonView([plant("a"), plant("b")]);
    expect(v.caveat).toBe(CONTEXTUAL_PHENO_COMPARISON_CAVEAT);
  });
});

describe("buildContextualPhenoComparisonView — aggregation", () => {
  it("aggregates evidence counts deterministically", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", {
        diaryCount: 3,
        photoCount: 2,
        wateringCount: 4,
        feedingCount: 1,
        trainingCount: 1,
        alertCount: 0,
      }),
      plant("b", {
        diaryCount: 1,
        photoCount: 0,
        wateringCount: 2,
        feedingCount: 2,
      }),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    expect(a.evidenceCounts).toEqual({
      diary: 3,
      photos: 2,
      watering: 4,
      feeding: 1,
      training: 1,
      sensorReadings: 0,
      alerts: 0,
    });
  });

  it("separates sensor sources without merging", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", {
        sensorReadings: [
          { source: "live", capturedAt: "2026-06-27T10:00:00Z", tempF: 75 },
          { source: "manual", capturedAt: "2026-06-27T11:00:00Z", tempF: 76 },
          { source: "csv", capturedAt: "2026-06-26T10:00:00Z", tempF: 74 },
          { source: "demo", capturedAt: "2026-06-25T10:00:00Z", tempF: 999 },
          { source: "stale", capturedAt: "2026-06-24T10:00:00Z" },
          { source: "invalid" },
          { source: "bogus" },
        ],
      }),
      plant("b"),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    expect(a.sourceCounts).toEqual({
      live: 1,
      manual: 1,
      csv: 1,
      demo: 1,
      stale: 1,
      invalid: 1,
      unknown: 1,
    });
    // Aggregate summary preserves the per-source split across plants.
    expect(v.sourceQualitySummary.demo).toBe(1);
    expect(v.sourceQualitySummary.live).toBe(1);
  });

  it("flags demo/stale/invalid/unknown as untrusted via trustWarnings", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", {
        sensorReadings: [
          { source: "demo", tempF: 75 },
          { source: "stale", tempF: 75 },
          { source: "invalid" },
          { source: "weird" },
        ],
      }),
      plant("b"),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    const joined = a.environmentSummary.trustWarnings.join(" | ");
    expect(a.environmentSummary.hasTrustedSensorContext).toBe(false);
    expect(joined).toMatch(/demo/);
    expect(joined).toMatch(/stale/);
    expect(joined).toMatch(/invalid/);
    expect(joined).toMatch(/unknown/);
    // untrusted readings must NOT contribute to averages
    expect(a.environmentSummary.avgTempF).toBeNull();
  });

  it("ignores invalid numeric sensor values", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", {
        sensorReadings: [
          { source: "live", tempF: Number.NaN, rh: Number.POSITIVE_INFINITY },
          { source: "live", tempF: 70, rh: 50 },
        ],
      }),
      plant("b"),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    expect(a.environmentSummary.avgTempF).toBe(70);
    expect(a.environmentSummary.avgRh).toBe(50);
  });

  it("surfaces missing context explicitly", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", { strain: null, stage: null }),
      plant("b"),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    expect(a.missingContext).toEqual(
      expect.arrayContaining([
        "No diary entries.",
        "No photos.",
        "No watering logs.",
        "No feeding logs.",
        "No sensor readings.",
        "Strain unknown.",
        "Stage unknown.",
      ]),
    );
  });

  it("emits cross-plant missing context", () => {
    const v = buildContextualPhenoComparisonView([plant("a"), plant("b")]);
    expect(v.crossPlantMissingContext).toEqual(
      expect.arrayContaining([
        "No photos on any selected plant.",
        "No sensor readings on any selected plant.",
        "No trusted sensor context on any selected plant.",
      ]),
    );
  });
});

describe("buildContextualPhenoComparisonView — determinism", () => {
  it("produces identical output for identical input", () => {
    const inputs = [
      plant("a", { plantLabel: "B" }),
      plant("b", { plantLabel: "A" }),
    ];
    const v1 = buildContextualPhenoComparisonView(inputs);
    const v2 = buildContextualPhenoComparisonView(inputs);
    expect(JSON.stringify(v1)).toBe(JSON.stringify(v2));
  });

  it("orders plants by label, then plantId, then input index", () => {
    const v = buildContextualPhenoComparisonView([
      plant("z", { plantLabel: "Same" }),
      plant("a", { plantLabel: "Same" }),
    ]);
    expect(v.plants.map((p) => p.plantId)).toEqual(["a", "z"]);
  });

  it("does not introduce ranking or winner fields", () => {
    const v = buildContextualPhenoComparisonView([plant("a"), plant("b")]);
    const json = JSON.stringify(v).toLowerCase();
    expect(json).not.toContain("winner");
    expect(json).not.toContain("best pheno");
    expect(json).not.toContain("rank");
  });

  it("preserves grower-supplied comparison notes verbatim without inference", () => {
    const v = buildContextualPhenoComparisonView([
      plant("a", { comparisonNotes: ["Looks frosty", "  ", ""] }),
      plant("b"),
    ]);
    const a = v.plants.find((p) => p.plantId === "a")!;
    expect(a.comparisonNotes).toEqual(["Looks frosty"]);
  });
});

describe("contextual pheno comparison — static safety scan", () => {
  const REPO_ROOT = resolve(__dirname, "..", "..");
  const TARGETS = [
    "src/lib/contextualPhenoComparisonViewModel.ts",
  ] as const;

  const FORBIDDEN: readonly string[] = [
    "functions.invoke",
    ".insert(",
    ".update(",
    ".delete(",
    "upsert(",
    "selection_decisions",
    "materialized view",
    "create policy",
    "alter table",
    "winner",
    "best pheno",
    "automatically select",
    "auto select",
    "guaranteed",
    "definitely",
    "device command",
    "automatically control",
    "set fan",
    "set light",
    "set irrigation",
    "dose nutrients",
  ];

  for (const rel of TARGETS) {
    it(`is clean: ${rel}`, () => {
      const src = readFileSync(resolve(REPO_ROOT, rel), "utf8");
      const lower = src.toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(lower).not.toContain(phrase.toLowerCase());
      }
      // "healthy" must not appear adjacent to untrusted tokens.
      const lines = src.split(/\r?\n/);
      const untrusted = /\b(invalid|stale|demo|unknown|untrusted)\b/i;
      for (const line of lines) {
        if (/\bhealthy\b/i.test(line) && untrusted.test(line)) {
          throw new Error(
            `Forbidden "healthy" near untrusted source token in ${rel}: ${line}`,
          );
        }
      }
      // "certain" as standalone certainty claim (not "uncertain" etc.).
      expect(/\bcertain\b/i.test(src)).toBe(false);
    });
  }
});
