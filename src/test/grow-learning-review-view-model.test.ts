/**
 * Tests for the Grow Learning Review view model — deterministic summary
 * counts (no effectiveness scoring), AND-semantics filters, deterministic
 * sort orders, plant grouping.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROW_LEARNING_FILTERS,
  SUMMARY_METRIC_ORDER,
  filterGrowLearningEpisodes,
  groupEpisodesByPlant,
  sortGrowLearningEpisodes,
  summarizeGrowLearning,
} from "../lib/growLearningReviewViewModel";
import {
  buildPlantMemoryEpisode,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function episode(opts: {
  id: string;
  plantId?: string | null;
  tentId?: string | null;
  targetMetric?: string | null;
  outcome?: string;
  decision?: string;
  usableSensor?: boolean;
  nowMs?: number;
}): PlantMemoryEpisode {
  const action: EpisodeActionInput = {
    id: opts.id,
    grow_id: "grow-1",
    tent_id: opts.tentId ?? "tent-1",
    plant_id: opts.plantId ?? "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: opts.targetMetric ?? "humidity",
    suggested_change: "Lower RH a few points",
    reason: "RH high",
    status: "completed",
    completed_at: iso(0),
  };
  const rows: EpisodeDiaryRowInput[] = [];
  if (opts.outcome) {
    rows.push({
      id: `${opts.id}-out`,
      grow_id: "grow-1",
      tent_id: opts.tentId ?? "tent-1",
      plant_id: opts.plantId ?? "plant-1",
      note: null,
      entry_at: iso(25 * HOUR),
      details: {
        event_type: "action_outcome",
        action_queue_id: opts.id,
        outcome_status: opts.outcome,
        recorded_by: "grower",
        recorded_at: iso(25 * HOUR),
      },
    });
  }
  if (opts.decision) {
    rows.push({
      id: `${opts.id}-dec`,
      grow_id: "grow-1",
      tent_id: opts.tentId ?? "tent-1",
      plant_id: opts.plantId ?? "plant-1",
      note: null,
      entry_at: iso(26 * HOUR),
      details: {
        event_type: "run_learning_decision",
        action_queue_id: opts.id,
        decision: opts.decision,
        recorded_by: "grower",
        recorded_at: iso(26 * HOUR),
      },
    });
  }
  const ep = buildPlantMemoryEpisode({
    action,
    linkedRows: rows,
    sensorEvidence: opts.usableSensor
      ? [
          {
            snapshotId: "s1",
            capturedAt: iso(-HOUR),
            tentId: opts.tentId ?? "tent-1",
            plantId: opts.plantId ?? "plant-1",
            source: "live",
            status: "usable",
            confidence: null,
            window: "before",
            usable: true,
          },
        ]
      : [],
    now: T0 + (opts.nowMs ?? 30 * HOUR),
  });
  if (!ep) throw new Error("expected episode");
  return ep;
}

describe("summarizeGrowLearning", () => {
  it("counts deterministically without any effectiveness scoring", () => {
    const summary = summarizeGrowLearning([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
      episode({ id: "b", outcome: "worsened", decision: "adjust" }),
      episode({ id: "c", outcome: "more_data_needed" }),
      episode({ id: "d" }), // no outcome; default now (30h) is past the 24h due window
    ]);
    expect(summary.completedActions).toBe(4);
    expect(summary.outcomesRecorded).toBe(3);
    expect(summary.improved).toBe(1);
    expect(summary.worsened).toBe(1);
    expect(summary.moreDataNeeded).toBe(1);
    expect(summary.repeatDecisions).toBe(1);
    expect(summary.adjustDecisions).toBe(1);
    expect(summary.followUpsDue).toBe(1);
  });

  it("exposes exactly the 12 spec metrics in order", () => {
    expect(SUMMARY_METRIC_ORDER).toEqual([
      "completedActions",
      "followUpsDue",
      "outcomesRecorded",
      "improved",
      "unchanged",
      "worsened",
      "moreDataNeeded",
      "repeatDecisions",
      "avoidDecisions",
      "adjustDecisions",
      "monitorDecisions",
      "needsReview",
    ]);
  });

  it("never computes an effectiveness/success percentage", () => {
    const summary = summarizeGrowLearning([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/percent|score|rate/i);
  });
});

describe("filterGrowLearningEpisodes — deterministic AND semantics", () => {
  const episodes = [
    episode({ id: "a", plantId: "p1", targetMetric: "humidity", outcome: "improved", decision: "repeat", usableSensor: true }),
    episode({ id: "b", plantId: "p2", targetMetric: "ec", outcome: "worsened", decision: "adjust" }),
  ];

  it("no filters returns everything", () => {
    expect(filterGrowLearningEpisodes(episodes, DEFAULT_GROW_LEARNING_FILTERS)).toHaveLength(2);
  });

  it("filters by plant", () => {
    const result = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      plantId: "p1",
    });
    expect(result.map((e) => e.action.actionQueueId)).toEqual(["a"]);
  });

  it("filters by action category", () => {
    const result = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      actionCategory: "nutrition",
    });
    expect(result.map((e) => e.action.actionQueueId)).toEqual(["b"]);
  });

  it("filters by outcome and decision combined (AND)", () => {
    const result = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      outcomeStatus: "improved",
      nextRunDecision: "repeat",
    });
    expect(result.map((e) => e.action.actionQueueId)).toEqual(["a"]);
  });

  it("filters by evidence completeness", () => {
    const complete = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      evidenceCompleteness: "complete",
    });
    expect(complete.map((e) => e.action.actionQueueId)).toEqual(["a"]);
    const limited = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      evidenceCompleteness: "limited",
    });
    expect(limited.map((e) => e.action.actionQueueId)).toEqual(["b"]);
  });

  it("combined filters that match nothing return an empty array, not all rows", () => {
    const result = filterGrowLearningEpisodes(episodes, {
      ...DEFAULT_GROW_LEARNING_FILTERS,
      plantId: "p1",
      outcomeStatus: "worsened",
    });
    expect(result).toHaveLength(0);
  });
});

describe("sortGrowLearningEpisodes", () => {
  const episodes = [
    episode({ id: "improved", outcome: "improved" }),
    episode({ id: "worsened", outcome: "worsened" }),
    episode({ id: "due", nowMs: 30 * HOUR }),
  ];

  it("chronological orders by completedAt desc", () => {
    const sorted = sortGrowLearningEpisodes(episodes, "chronological");
    expect(sorted).toHaveLength(3);
  });

  it("outcome_first ranks worsened before improved", () => {
    const sorted = sortGrowLearningEpisodes(episodes, "outcome_first");
    const worsenedIdx = sorted.findIndex((e) => e.outcome.status === "worsened");
    const improvedIdx = sorted.findIndex((e) => e.outcome.status === "improved");
    expect(worsenedIdx).toBeLessThan(improvedIdx);
  });

  it("unresolved_first uses the deterministic episode ordering", () => {
    const sorted = sortGrowLearningEpisodes(episodes, "unresolved_first");
    expect(sorted[0].state).not.toBe("closed");
  });
});

describe("groupEpisodesByPlant", () => {
  it("groups deterministically and sorts by plant id", () => {
    const groups = groupEpisodesByPlant([
      episode({ id: "a", plantId: "p2" }),
      episode({ id: "b", plantId: "p1" }),
      episode({ id: "c", plantId: "p1" }),
    ]);
    expect(groups.map((g) => g.plantId)).toEqual(["p1", "p2"]);
    expect(groups[0].episodes).toHaveLength(2);
  });
});
