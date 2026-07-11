/**
 * Post-Action Outcome Analysis — metric comparison, classification,
 * grower/system agreement, and learning guidance.
 */
import { describe, it, expect } from "vitest";
import {
  METRIC_TOLERANCES,
  agreementSummaryCopy,
  aggregateMetricSamples,
  assessOutcomeAgreement,
  classifyOutcome,
  compareAllMetrics,
  compareMetric,
  deriveLearningGuidance,
  deterministicMedian,
} from "@/lib/actionOutcomeAnalysisEngine";
import type {
  ActionOutcomeEvidenceBundle,
  NormalizedOutcomeMetric,
  OutcomeMetricName,
} from "@/lib/actionOutcomeAnalysisTypes";

const TENT = "tent-1";

function sample(
  metric: OutcomeMetricName,
  value: number,
  capturedAt: string,
  source: NormalizedOutcomeMetric["source"] = "live",
): NormalizedOutcomeMetric {
  return { metric, value, capturedAt, source, confidence: "ok", tentId: TENT, plantId: null };
}

const TARGETS = {
  growId: "grow-1",
  bands: {
    temperature_f: { min: 68, max: 82 },
    humidity_pct: { min: 40, max: 60 },
    vpd_kpa: { min: 0.8, max: 1.6 },
  },
} as const;

function bundleWith(input: {
  pre: NormalizedOutcomeMetric[];
  post: NormalizedOutcomeMetric[];
  postElapsedHours?: number;
  targets?: typeof TARGETS | null;
  followUpOutcome?: "improved" | "unchanged" | "declined" | "too_soon" | "unclear" | null;
}): ActionOutcomeEvidenceBundle {
  return {
    action: {
      actionQueueId: "aq-1",
      status: "completed",
      completedAt: "2026-07-10T12:00:00.000Z",
      growId: "grow-1",
      tentId: TENT,
      plantId: null,
      actionType: "environment_adjustment",
      targetMetric: "vpd_kpa",
      suggestedChange: "Increase airflow",
      reason: "VPD above target",
    },
    followUp:
      input.followUpOutcome === undefined
        ? null
        : {
            actionQueueId: "aq-1",
            outcome: input.followUpOutcome,
            observedAt: "2026-07-11T12:00:00.000Z",
            note: null,
          },
    preAction: {
      start: "2026-07-09T12:00:00.000Z",
      end: "2026-07-10T12:00:00.000Z",
      elapsedHours: 24,
      metrics: input.pre,
      diaryEvidence: [],
      quality: input.pre.length > 0 ? "medium" : "unusable",
    },
    postAction: {
      start: "2026-07-10T12:00:00.000Z",
      end: "2026-07-11T12:00:00.000Z",
      elapsedHours: input.postElapsedHours ?? 24,
      metrics: input.post,
      diaryEvidence: [],
      quality: input.post.length > 0 ? "medium" : "unusable",
    },
    growTargets:
      input.targets === undefined ? { ...TARGETS, bands: { ...TARGETS.bands } } : input.targets,
    recentDiaryEvidence: [],
    missingInformation: [],
  };
}

describe("deterministic aggregates", () => {
  it("median is deterministic for odd and even sample counts", () => {
    expect(deterministicMedian([3, 1, 2])).toBe(2);
    expect(deterministicMedian([4, 1, 3, 2])).toBe(2.5);
    expect(deterministicMedian([])).toBeNull();
  });

  it("aggregates expose median/min/max/count/first/last", () => {
    const agg = aggregateMetricSamples([
      sample("vpd_kpa", 1.9, "2026-07-10T02:00:00.000Z"),
      sample("vpd_kpa", 1.7, "2026-07-10T01:00:00.000Z"),
      sample("vpd_kpa", 2.1, "2026-07-10T03:00:00.000Z"),
    ]);
    expect(agg).toEqual({
      median: 1.9,
      min: 1.7,
      max: 2.1,
      sampleCount: 3,
      firstValue: 1.7,
      lastValue: 2.1,
    });
  });
});

describe("metric comparison", () => {
  it("closer-to-target temperature is improved", () => {
    const c = compareMetric({
      metric: "temperature_f",
      preSamples: [sample("temperature_f", 90, "2026-07-10T00:00:00.000Z")],
      postSamples: [sample("temperature_f", 83, "2026-07-11T00:00:00.000Z")],
      targets: { ...TARGETS, bands: { ...TARGETS.bands } },
    });
    expect(c.direction).toBe("improved");
    expect(c.preTargetDistance).toBe(8);
    expect(c.postTargetDistance).toBe(1);
  });

  it("farther-from-target temperature is declined", () => {
    const c = compareMetric({
      metric: "temperature_f",
      preSamples: [sample("temperature_f", 83, "2026-07-10T00:00:00.000Z")],
      postSamples: [sample("temperature_f", 90, "2026-07-11T00:00:00.000Z")],
      targets: { ...TARGETS, bands: { ...TARGETS.bands } },
    });
    expect(c.direction).toBe("declined");
  });

  it("within-tolerance change is unchanged (tiny floats are not improvement)", () => {
    const c = compareMetric({
      metric: "temperature_f",
      preSamples: [sample("temperature_f", 83.0, "2026-07-10T00:00:00.000Z")],
      postSamples: [sample("temperature_f", 82.9, "2026-07-11T00:00:00.000Z")],
      targets: { ...TARGETS, bands: { ...TARGETS.bands } },
    });
    expect(c.direction).toBe("unchanged");
    expect(METRIC_TOLERANCES.temperature_f).toBeGreaterThan(0.1);
  });

  it("missing pre or post evidence is not comparable", () => {
    const noPre = compareMetric({
      metric: "vpd_kpa",
      preSamples: [],
      postSamples: [sample("vpd_kpa", 1.2, "2026-07-11T00:00:00.000Z")],
      targets: null,
    });
    expect(noPre.direction).toBe("not_comparable");
    const noPost = compareMetric({
      metric: "vpd_kpa",
      preSamples: [sample("vpd_kpa", 1.2, "2026-07-10T00:00:00.000Z")],
      postSamples: [],
      targets: null,
    });
    expect(noPost.direction).toBe("not_comparable");
  });

  it("one-sample comparisons are low quality; stable multi-sample live evidence is high", () => {
    const single = compareMetric({
      metric: "vpd_kpa",
      preSamples: [sample("vpd_kpa", 1.9, "2026-07-10T00:00:00.000Z")],
      postSamples: [sample("vpd_kpa", 1.4, "2026-07-11T00:00:00.000Z")],
      targets: { ...TARGETS, bands: { ...TARGETS.bands } },
    });
    expect(single.evidenceQuality).toBe("low");
    const multi = compareMetric({
      metric: "vpd_kpa",
      preSamples: [
        sample("vpd_kpa", 1.9, "2026-07-10T00:00:00.000Z"),
        sample("vpd_kpa", 1.85, "2026-07-10T04:00:00.000Z"),
        sample("vpd_kpa", 1.95, "2026-07-10T08:00:00.000Z"),
      ],
      postSamples: [
        sample("vpd_kpa", 1.4, "2026-07-11T00:00:00.000Z"),
        sample("vpd_kpa", 1.35, "2026-07-11T04:00:00.000Z"),
        sample("vpd_kpa", 1.45, "2026-07-11T08:00:00.000Z"),
      ],
      targets: { ...TARGETS, bands: { ...TARGETS.bands } },
    });
    expect(multi.evidenceQuality).toBe("high");
  });

  it("no-target shifts beyond tolerance are not_comparable (direction needs a target)", () => {
    const c = compareMetric({
      metric: "co2_ppm",
      preSamples: [sample("co2_ppm", 800, "2026-07-10T00:00:00.000Z")],
      postSamples: [sample("co2_ppm", 1200, "2026-07-11T00:00:00.000Z")],
      targets: null,
    });
    expect(c.direction).toBe("not_comparable");
  });

  it("compareAllMetrics emits stable lexical metric ordering, input-order independent", () => {
    const pre = [
      sample("vpd_kpa", 1.9, "2026-07-10T00:00:00.000Z"),
      sample("temperature_f", 90, "2026-07-10T00:00:00.000Z"),
      sample("humidity_pct", 30, "2026-07-10T00:00:00.000Z"),
    ];
    const post = [
      sample("humidity_pct", 45, "2026-07-11T00:00:00.000Z"),
      sample("temperature_f", 80, "2026-07-11T00:00:00.000Z"),
      sample("vpd_kpa", 1.4, "2026-07-11T00:00:00.000Z"),
    ];
    const a = compareAllMetrics(bundleWith({ pre, post }));
    const b = compareAllMetrics(bundleWith({ pre: [...pre].reverse(), post: [...post].reverse() }));
    expect(a.map((c) => c.metric)).toEqual(["humidity_pct", "temperature_f", "vpd_kpa"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("overall classification", () => {
  const improvedBundle = () =>
    bundleWith({
      pre: [
        sample("temperature_f", 90, "2026-07-10T00:00:00.000Z"),
        sample("vpd_kpa", 1.9, "2026-07-10T01:00:00.000Z"),
      ],
      post: [
        sample("temperature_f", 80, "2026-07-11T00:00:00.000Z"),
        sample("vpd_kpa", 1.4, "2026-07-11T01:00:00.000Z"),
      ],
    });

  it("sufficient positive evidence produces improved", () => {
    const b = improvedBundle();
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe("improved");
  });

  it("sufficient negative evidence produces declined; critical decline surfaces", () => {
    const b = bundleWith({
      pre: [sample("temperature_f", 80, "2026-07-10T00:00:00.000Z")],
      post: [sample("temperature_f", 92, "2026-07-11T00:00:00.000Z")],
    });
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe("declined");
  });

  it("meaningful improvements and declines coexisting produce mixed", () => {
    const b = bundleWith({
      pre: [
        sample("temperature_f", 90, "2026-07-10T00:00:00.000Z"),
        sample("humidity_pct", 50, "2026-07-10T01:00:00.000Z"),
      ],
      post: [
        sample("temperature_f", 80, "2026-07-11T00:00:00.000Z"),
        sample("humidity_pct", 70, "2026-07-11T01:00:00.000Z"),
      ],
    });
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe("mixed");
  });

  it("stable evidence produces unchanged", () => {
    const b = bundleWith({
      pre: [sample("temperature_f", 80, "2026-07-10T00:00:00.000Z")],
      post: [sample("temperature_f", 80.5, "2026-07-11T00:00:00.000Z")],
    });
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe("unchanged");
  });

  it("missing evidence produces insufficient_evidence", () => {
    const b = bundleWith({
      pre: [],
      post: [sample("temperature_f", 80, "2026-07-11T00:00:00.000Z")],
    });
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe(
      "insufficient_evidence",
    );
  });

  it("a too-short post window produces insufficient_evidence", () => {
    const b = bundleWith({
      pre: [sample("temperature_f", 90, "2026-07-10T00:00:00.000Z")],
      post: [sample("temperature_f", 80, "2026-07-10T12:30:00.000Z")],
      postElapsedHours: 0.5,
    });
    expect(classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) })).toBe(
      "insufficient_evidence",
    );
  });

  it("same evidence produces identical classification (determinism)", () => {
    const b = improvedBundle();
    const first = classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) });
    const second = classifyOutcome({ bundle: b, comparisons: compareAllMetrics(b) });
    expect(first).toBe(second);
  });
});

describe("grower/system agreement", () => {
  it.each([
    ["improved", "improved", "agrees"],
    ["declined", "declined", "agrees"],
    ["too_soon", "insufficient_evidence", "agrees"],
    ["unclear", "insufficient_evidence", "agrees"],
    ["improved", "mixed", "partially_agrees"],
    ["improved", "declined", "conflicts"],
    ["declined", "improved", "conflicts"],
    ["improved", "insufficient_evidence", "not_comparable"],
  ] as const)("grower %s / system %s → %s", (grower, system, expected) => {
    expect(assessOutcomeAgreement({ growerOutcome: grower, systemClassification: system })).toBe(
      expected,
    );
  });

  it("missing grower outcome returns no_grower_outcome", () => {
    expect(assessOutcomeAgreement({ growerOutcome: null, systemClassification: "improved" })).toBe(
      "no_grower_outcome",
    );
  });

  it("conflict copy is respectful and cautious — never blames the grower", () => {
    const copy = agreementSummaryCopy({
      agreement: "conflicts",
      growerOutcome: "improved",
      systemClassification: "declined",
    });
    expect(copy).toMatch(/more evidence/i);
    expect(copy).not.toMatch(/wrong|mistake|incorrect/i);
  });

  it("the grower outcome is never mutated by agreement assessment", () => {
    const followUp = {
      actionQueueId: "aq-1",
      outcome: "improved" as const,
      observedAt: null,
      note: null,
    };
    const frozen = Object.freeze(followUp);
    expect(() =>
      assessOutcomeAgreement({ growerOutcome: frozen.outcome, systemClassification: "declined" }),
    ).not.toThrow();
    expect(frozen.outcome).toBe("improved");
  });
});

describe("learning guidance", () => {
  const comparisons = () =>
    compareAllMetrics(
      bundleWith({
        pre: [sample("temperature_f", 90, "2026-07-10T00:00:00.000Z")],
        post: [sample("temperature_f", 80, "2026-07-11T00:00:00.000Z")],
      }),
    );

  it("improved + high confidence may populate repeatNextRun", () => {
    const g = deriveLearningGuidance({
      classification: "improved",
      confidenceLevel: "high",
      action: { actionType: "airflow", suggestedChange: "Increase airflow", reason: "hot" },
      comparisons: comparisons(),
    });
    expect(g.repeatNextRun.join(" ")).toMatch(/reasonable to try it again/);
  });

  it("insufficient evidence never recommends repeating the action", () => {
    const g = deriveLearningGuidance({
      classification: "insufficient_evidence",
      confidenceLevel: "low",
      action: { actionType: "airflow", suggestedChange: null, reason: "hot" },
      comparisons: [],
    });
    expect(g.repeatNextRun.join(" ")).not.toMatch(/try it again/);
    expect(g.repeatNextRun).toContain("Collect another follow-up snapshot.");
  });

  it("mixed evidence recommends more observation, not action", () => {
    const g = deriveLearningGuidance({
      classification: "mixed",
      confidenceLevel: "medium",
      action: { actionType: "airflow", suggestedChange: null, reason: "hot" },
      comparisons: comparisons(),
    });
    expect(g.repeatNextRun).toContain("Collect another follow-up snapshot.");
    expect(g.cautions).toContain("Do not make additional large changes yet.");
  });

  it("declined evidence produces conservative caution and may populate avoidNextRun", () => {
    const declinedComparisons = compareAllMetrics(
      bundleWith({
        pre: [sample("temperature_f", 80, "2026-07-10T00:00:00.000Z")],
        post: [sample("temperature_f", 92, "2026-07-11T00:00:00.000Z")],
      }),
    );
    const g = deriveLearningGuidance({
      classification: "declined",
      confidenceLevel: "medium",
      action: { actionType: "airflow", suggestedChange: null, reason: "hot" },
      comparisons: declinedComparisons,
    });
    expect(g.avoidNextRun.length).toBeGreaterThanOrEqual(1);
    expect(g.avoidNextRun.join(" ")).toMatch(/review it carefully/);
  });

  it("avoid list stays empty without strong evidence", () => {
    const g = deriveLearningGuidance({
      classification: "declined",
      confidenceLevel: "low",
      action: { actionType: "airflow", suggestedChange: null, reason: "hot" },
      comparisons: [],
    });
    expect(g.avoidNextRun).toEqual([]);
  });

  it("no aggressive nutrient advice from environment-only evidence", () => {
    const g = deriveLearningGuidance({
      classification: "improved",
      confidenceLevel: "high",
      action: {
        actionType: "nutrient_adjustment",
        suggestedChange: "Increase feed EC",
        reason: "pale leaves",
      },
      comparisons: comparisons(), // air-environment metrics only
    });
    expect(g.repeatNextRun.join(" ")).not.toMatch(/reasonable to try it again/);
    expect(g.cautions.join(" ")).toMatch(/root-zone or reservoir evidence/);
  });

  it("guidance copy contains no equipment commands or automation language", () => {
    for (const classification of [
      "improved",
      "declined",
      "mixed",
      "unchanged",
      "insufficient_evidence",
    ] as const) {
      const g = deriveLearningGuidance({
        classification,
        confidenceLevel: "high",
        action: { actionType: "airflow", suggestedChange: null, reason: "hot" },
        comparisons: comparisons(),
      });
      const all = [...g.repeatNextRun, ...g.avoidNextRun, ...g.cautions].join(" ").toLowerCase();
      expect(all).not.toMatch(
        /turn (on|off)|activate|execute|automatic|device command|schedule the/,
      );
    }
  });
});
