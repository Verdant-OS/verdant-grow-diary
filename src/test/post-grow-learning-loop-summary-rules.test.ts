/**
 * Tests for the bounded post-grow learning-loop summary — export-safe
 * (no ids/tokens), no causal language, no effectiveness scoring, bounded.
 */
import { describe, expect, it } from "vitest";
import {
  LEARNING_SECTION_ITEM_CAP,
  buildPostGrowLearningLoopSummary,
} from "../lib/postGrowLearningLoopSummaryRules";
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
  outcome?: string;
  decision?: string;
  mismatch?: boolean;
}): PlantMemoryEpisode {
  const action: EpisodeActionInput = {
    id: opts.id,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: "humidity",
    suggested_change: "Lower RH a few points",
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
        rationale: "consistent under similar RH",
        recorded_by: "grower",
        recorded_at: iso(26 * HOUR),
      },
    });
  }
  const ep = buildPlantMemoryEpisode({ action, linkedRows: rows, now: T0 + 30 * HOUR });
  if (!ep) throw new Error("expected episode");
  return ep;
}

describe("buildPostGrowLearningLoopSummary", () => {
  it("empty when nothing grower-confirmed", () => {
    const summary = buildPostGrowLearningLoopSummary([]);
    expect(summary.isEmpty).toBe(true);
  });

  it("sections confirmed decisions by the grower's actual choice", () => {
    const summary = buildPostGrowLearningLoopSummary([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
      episode({ id: "b", outcome: "worsened", decision: "avoid" }),
      episode({ id: "c", outcome: "unchanged", decision: "adjust" }),
      episode({ id: "d", outcome: "improved", decision: "monitor" }),
      episode({ id: "e", outcome: "more_data_needed" }),
    ]);
    expect(summary.repeat).toHaveLength(1);
    expect(summary.avoid).toHaveLength(1);
    expect(summary.adjust).toHaveLength(1);
    // monitor + unresolved both fall into open questions
    expect(summary.openQuestions.length).toBeGreaterThanOrEqual(2);
    expect(summary.isEmpty).toBe(false);
  });

  it("output is export-safe: no ids, tokens, or event_type strings leak", () => {
    const summary = buildPostGrowLearningLoopSummary([
      episode({ id: "act-secret-123", outcome: "improved", decision: "repeat" }),
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("act-secret-123");
    expect(text).not.toContain("action_queue_id");
    expect(text).not.toContain("run_learning_decision");
    expect(text).not.toMatch(/episode:/);
  });

  it("carries no causal language or effectiveness score", () => {
    const summary = buildPostGrowLearningLoopSummary([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
    ]);
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/\b(caused|fixed|proved|guaranteed|cured|best|worst)\b/i);
    expect(text).not.toMatch(/effectiveness|success rate|%\s*confiden/i);
    expect(summary.caveat).toMatch(/does not attribute the run's result to any single action/i);
  });

  it("needs_review episodes are excluded and noted in evidence-quality notes", () => {
    const summary = buildPostGrowLearningLoopSummary([
      episode({ id: "a", outcome: "improved", decision: "repeat", mismatch: true }),
    ]);
    expect(summary.repeat).toHaveLength(0);
    expect(summary.evidenceQualityNotes.join(" ")).toMatch(/need review/i);
  });

  it("bounds each section to the cap", () => {
    const many = Array.from({ length: LEARNING_SECTION_ITEM_CAP + 5 }, (_, i) =>
      episode({ id: `a${i}`, outcome: "improved", decision: "repeat" }),
    );
    const summary = buildPostGrowLearningLoopSummary(many);
    expect(summary.repeat).toHaveLength(LEARNING_SECTION_ITEM_CAP);
  });
});
