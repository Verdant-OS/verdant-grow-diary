/**
 * Post-Action Outcome Analysis — deterministic confidence model.
 */
import { describe, it, expect } from "vitest";
import {
  CONFIDENCE_CAPS,
  confidenceLevelForScore,
  scoreActionOutcomeConfidence,
} from "@/lib/actionOutcomeConfidenceRules";
import { compareAllMetrics } from "@/lib/actionOutcomeAnalysisEngine";
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

function bundleWith(input: {
  pre: NormalizedOutcomeMetric[];
  post: NormalizedOutcomeMetric[];
  postElapsedHours?: number;
  followUp?: boolean;
  missing?: string[];
  targets?: boolean;
}): ActionOutcomeEvidenceBundle {
  return {
    action: {
      actionQueueId: "aq-1",
      status: "completed",
      completedAt: "2026-07-10T12:00:00.000Z",
      growId: "grow-1",
      tentId: TENT,
      plantId: null,
      actionType: "airflow",
      targetMetric: null,
      suggestedChange: null,
      reason: "hot tent",
    },
    followUp: input.followUp
      ? {
          actionQueueId: "aq-1",
          outcome: "improved",
          observedAt: "2026-07-11T12:00:00.000Z",
          note: null,
        }
      : null,
    preAction: {
      start: "2026-07-09T12:00:00.000Z",
      end: "2026-07-10T12:00:00.000Z",
      elapsedHours: 24,
      metrics: input.pre,
      diaryEvidence: [],
      quality: "medium",
    },
    postAction: {
      start: "2026-07-10T12:00:00.000Z",
      end: "2026-07-11T12:00:00.000Z",
      elapsedHours: input.postElapsedHours ?? 24,
      metrics: input.post,
      diaryEvidence: [],
      quality: "medium",
    },
    growTargets:
      input.targets === false
        ? null
        : { growId: "grow-1", bands: { temperature_f: { min: 68, max: 82 } } },
    recentDiaryEvidence: [],
    missingInformation: input.missing ?? [],
  };
}

function score(
  bundle: ActionOutcomeEvidenceBundle,
  extra?: {
    criticalTelemetryInvalid?: boolean;
    demoOnlyEvidence?: boolean;
  },
) {
  return scoreActionOutcomeConfidence({
    bundle,
    comparisons: compareAllMetrics(bundle),
    criticalTelemetryInvalid: extra?.criticalTelemetryInvalid ?? false,
    demoOnlyEvidence: extra?.demoOnlyEvidence ?? false,
  });
}

function manySamples(source: NormalizedOutcomeMetric["source"], window: "pre" | "post") {
  const day = window === "pre" ? "2026-07-10" : "2026-07-11";
  return [
    sample("temperature_f", 90, `${day}T00:00:00.000Z`, source),
    sample("temperature_f", 89, `${day}T02:00:00.000Z`, source),
    sample("temperature_f", 91, `${day}T04:00:00.000Z`, source),
    sample("temperature_f", 88, `${day}T06:00:00.000Z`, source),
    sample("temperature_f", 90, `${day}T08:00:00.000Z`, source),
  ];
}

describe("confidence scoring", () => {
  it("complete high-quality evidence can score high (≥70)", () => {
    const r = score(
      bundleWith({
        pre: manySamples("live", "pre"),
        post: manySamples("live", "post"),
        followUp: true,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.level).toBe("high");
  });

  it("manual-only evidence obeys the 70 cap", () => {
    const r = score(
      bundleWith({
        pre: manySamples("manual", "pre"),
        post: manySamples("manual", "post"),
        followUp: true,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(CONFIDENCE_CAPS.manualOnly);
    expect(r.appliedCaps).toContain("manual_only_evidence");
  });

  it("csv-only evidence obeys the 65 cap", () => {
    const r = score(
      bundleWith({
        pre: manySamples("csv", "pre"),
        post: manySamples("csv", "post"),
        followUp: true,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(CONFIDENCE_CAPS.csvOnly);
    expect(r.appliedCaps).toContain("csv_only_evidence");
  });

  it("demo-only evidence scores exactly zero", () => {
    const r = score(bundleWith({ pre: [], post: [] }), { demoOnlyEvidence: true });
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
  });

  it("no follow-up + short post-window obeys the 40 cap", () => {
    const r = score(
      bundleWith({
        pre: manySamples("live", "pre"),
        post: manySamples("live", "post"),
        postElapsedHours: 1,
        followUp: false,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(CONFIDENCE_CAPS.noFollowUpShortWindow);
    expect(r.appliedCaps).toContain("no_follow_up_short_window");
  });

  it("one pre + one post reading obeys the 40 cap", () => {
    const r = score(
      bundleWith({
        pre: [sample("temperature_f", 90, "2026-07-10T00:00:00.000Z")],
        post: [sample("temperature_f", 80, "2026-07-11T00:00:00.000Z")],
        followUp: true,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(CONFIDENCE_CAPS.singlePairOfReadings);
    expect(r.appliedCaps).toContain("single_pair_of_readings");
  });

  it("invalid critical telemetry obeys the 50 cap", () => {
    const r = score(
      bundleWith({
        pre: manySamples("live", "pre"),
        post: manySamples("live", "post"),
        followUp: true,
      }),
      { criticalTelemetryInvalid: true },
    );
    expect(r.score).toBeLessThanOrEqual(CONFIDENCE_CAPS.invalidCriticalTelemetry);
  });

  it("missing data lowers the score", () => {
    const complete = score(
      bundleWith({
        pre: manySamples("live", "pre"),
        post: manySamples("live", "post"),
        followUp: true,
      }),
    );
    const missing = score(
      bundleWith({
        pre: manySamples("live", "pre"),
        post: manySamples("live", "post"),
        followUp: true,
        missing: ["a", "b", "c"],
      }),
    );
    expect(missing.score).toBeLessThan(complete.score);
  });

  it("score stays within 0–100 for extreme inputs", () => {
    const low = score(bundleWith({ pre: [], post: [], missing: Array(50).fill("x") }));
    expect(low.score).toBeGreaterThanOrEqual(0);
    const high = score(
      bundleWith({
        pre: [...manySamples("live", "pre"), ...manySamples("manual", "pre")],
        post: [...manySamples("live", "post"), ...manySamples("manual", "post")],
        followUp: true,
      }),
    );
    expect(high.score).toBeLessThanOrEqual(100);
  });

  it("same input returns the same score (determinism)", () => {
    const bundle = bundleWith({
      pre: manySamples("live", "pre"),
      post: manySamples("live", "post"),
      followUp: true,
    });
    expect(score(bundle)).toEqual(score(bundle));
  });

  it("bands map scores to levels correctly", () => {
    expect(confidenceLevelForScore(0)).toBe("low");
    expect(confidenceLevelForScore(39)).toBe("low");
    expect(confidenceLevelForScore(40)).toBe("medium");
    expect(confidenceLevelForScore(69)).toBe("medium");
    expect(confidenceLevelForScore(70)).toBe("high");
    expect(confidenceLevelForScore(100)).toBe("high");
  });
});
