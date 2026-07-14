/**
 * Tests for the Outcome Follow-Up Queue view model — deterministic
 * categorization + ordering, no causal language, no AI ranking.
 */
import { describe, expect, it } from "vitest";
import {
  OUTCOME_QUEUE_CATEGORIES,
  buildOutcomeFollowUpQueue,
  categorizeEpisode,
} from "../lib/outcomeFollowUpQueueViewModel";
import {
  buildPlantMemoryEpisode,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function makeEpisode(opts: {
  id: string;
  outcome?: string;
  decision?: string;
  mismatch?: boolean;
  nowMs?: number;
}): PlantMemoryEpisode {
  const action: EpisodeActionInput = {
    id: opts.id,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: "humidity",
    suggested_change: "Lower RH",
    reason: "RH high",
    status: "completed",
    completed_at: iso(0),
  };
  const rows: EpisodeDiaryRowInput[] = [];
  if (opts.outcome) {
    rows.push({
      id: `${opts.id}-out`,
      grow_id: opts.mismatch ? "grow-OTHER" : "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
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
      tent_id: "tent-1",
      plant_id: "plant-1",
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
  const episode = buildPlantMemoryEpisode({
    action,
    linkedRows: rows,
    now: T0 + (opts.nowMs ?? 30 * HOUR),
  });
  if (!episode) throw new Error("expected episode");
  return episode;
}

describe("categorizeEpisode", () => {
  it("maps each state to its queue category", () => {
    expect(categorizeEpisode(makeEpisode({ id: "a", nowMs: 30 * HOUR }))).toBe("due_now");
    expect(categorizeEpisode(makeEpisode({ id: "b", outcome: "more_data_needed" }))).toBe(
      "more_data_needed",
    );
    expect(categorizeEpisode(makeEpisode({ id: "c", outcome: "improved" }))).toBe(
      "decision_pending",
    );
    expect(
      categorizeEpisode(makeEpisode({ id: "d", outcome: "improved", decision: "repeat" })),
    ).toBe("closed");
    expect(categorizeEpisode(makeEpisode({ id: "e", mismatch: true, outcome: "improved" }))).toBe(
      "needs_review",
    );
  });
});

describe("buildOutcomeFollowUpQueue", () => {
  it("groups, counts, and orders deterministically", () => {
    const episodes = [
      makeEpisode({ id: "closed", outcome: "improved", decision: "repeat" }),
      makeEpisode({ id: "due", nowMs: 30 * HOUR }),
      makeEpisode({ id: "pending", outcome: "worsened" }),
      makeEpisode({ id: "review", mismatch: true, outcome: "improved" }),
      makeEpisode({ id: "more", outcome: "more_data_needed" }),
    ];
    const vm = buildOutcomeFollowUpQueue(episodes);

    // Groups render in the fixed spec order (Due now → … → Needs review);
    // comparePlantMemoryEpisodes orders rows WITHIN each category.
    expect(vm.groups[0].category).toBe("due_now");
    expect(vm.groups.at(-1)?.category).toBe("needs_review");
    expect(vm.dueNowCount).toBe(1);
    expect(vm.needsReviewCount).toBe(1);
    // totalOpen excludes closed episodes.
    expect(vm.totalOpen).toBe(4);
    expect(vm.isEmpty).toBe(false);

    // Every non-empty category present exactly once, in canonical order.
    const cats = vm.groups.map((g) => g.category);
    const canonicalIndex = cats.map((c) => OUTCOME_QUEUE_CATEGORIES.indexOf(c));
    expect(canonicalIndex).toEqual([...canonicalIndex].sort((a, b) => a - b));
  });

  it("empty input is empty", () => {
    const vm = buildOutcomeFollowUpQueue([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.groups).toHaveLength(0);
    expect(vm.totalOpen).toBe(0);
  });

  it("every row carries an uncertainty line and a safe CTA (no causal claims)", () => {
    const vm = buildOutcomeFollowUpQueue([
      makeEpisode({ id: "a", outcome: "improved" }),
      makeEpisode({ id: "b", nowMs: 30 * HOUR }),
    ]);
    const allRows = vm.groups.flatMap((g) => g.rows);
    const CAUSAL = /caused|fixed|proved|guaranteed|cured|successful treatment/i;
    for (const row of allRows) {
      expect(row.uncertaintyLine.length).toBeGreaterThan(0);
      expect(row.ctaLabel.length).toBeGreaterThan(0);
      expect(row.actionSummary).not.toMatch(CAUSAL);
      expect(row.uncertaintyLine).not.toMatch(CAUSAL);
    }
  });
});
