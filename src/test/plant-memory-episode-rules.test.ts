/**
 * Pure-rule tests for the Plant Memory Episode model (One-Tent Learning
 * Loop V1). Deterministic: injected `now`, no network, no Date.now.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_FOLLOWUP_GRACE_MS,
  EPISODE_AFTER_WINDOW_MS,
  EPISODE_BEFORE_WINDOW_MS,
  EPISODE_FOLLOW_UP_DUE_MS,
  LEARNING_RATIONALE_MAX_LENGTH,
  NEXT_RUN_DECISIONS,
  RUN_LEARNING_DECISION_EVENT_TYPE,
  buildPlantMemoryEpisode,
  buildRunLearningDecisionDraft,
  classifyEvidenceWindow,
  comparePlantMemoryEpisodes,
  learningDecisionMatches,
  linkRowsToAction,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

function action(overrides: Partial<EpisodeActionInput> = {}): EpisodeActionInput {
  return {
    id: "act-1",
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
    ...overrides,
  };
}

function diaryRow(overrides: Partial<EpisodeDiaryRowInput> & { details?: Record<string, unknown> | null }): EpisodeDiaryRowInput {
  return {
    id: "row-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    note: null,
    entry_at: iso(HOUR),
    details: null,
    ...overrides,
  };
}

function followupRow(overrides: Partial<EpisodeDiaryRowInput> = {}): EpisodeDiaryRowInput {
  return diaryRow({
    id: "fu-1",
    entry_at: iso(60_000),
    details: { event_type: "action_followup", action_queue_id: "act-1" },
    ...overrides,
  });
}

function outcomeRow(
  status: string,
  overrides: Partial<EpisodeDiaryRowInput> = {},
  detailOverrides: Record<string, unknown> = {},
): EpisodeDiaryRowInput {
  return diaryRow({
    id: "out-1",
    entry_at: iso(25 * HOUR),
    details: {
      event_type: "action_outcome",
      action_queue_id: "act-1",
      outcome_status: status,
      recorded_by: "grower",
      recorded_at: iso(25 * HOUR),
      ...detailOverrides,
    },
    ...overrides,
  });
}

function decisionRow(
  decision: string,
  overrides: Partial<EpisodeDiaryRowInput> = {},
  detailOverrides: Record<string, unknown> = {},
): EpisodeDiaryRowInput {
  return diaryRow({
    id: "dec-1",
    entry_at: iso(26 * HOUR),
    details: {
      event_type: RUN_LEARNING_DECISION_EVENT_TYPE,
      action_queue_id: "act-1",
      decision,
      rationale: "worked well under similar RH",
      recorded_by: "grower",
      recorded_at: iso(26 * HOUR),
      ...detailOverrides,
    },
    ...overrides,
  });
}

function build(
  rows: EpisodeDiaryRowInput[],
  nowOffsetMs: number,
  actionOverrides: Partial<EpisodeActionInput> = {},
): PlantMemoryEpisode {
  const episode = buildPlantMemoryEpisode({
    action: action(actionOverrides),
    linkedRows: rows,
    now: T0 + nowOffsetMs,
  });
  if (!episode) throw new Error("expected an episode");
  return episode;
}

describe("state machine", () => {
  it("completed action with no follow-up and now < due window → action_completed", () => {
    const ep = build([], 2 * HOUR);
    expect(ep.state).toBe("action_completed");
    expect(ep.warnings.some((w) => w.code === "missing_follow_up")).toBe(true);
  });

  it("no outcome past the due window → follow_up_due (auto reminder note does not satisfy it)", () => {
    const ep = build([followupRow()], 25 * HOUR);
    expect(ep.state).toBe("follow_up_due");
  });

  it("follow-up written within the auto grace is not a grower check", () => {
    const ep = build([followupRow({ entry_at: iso(AUTO_FOLLOWUP_GRACE_MS - 1) })], 2 * HOUR);
    expect(ep.state).toBe("action_completed");
  });

  it("a later real follow-up note (before due) → follow_up_recorded", () => {
    const ep = build([followupRow({ entry_at: iso(3 * HOUR) })], 5 * HOUR);
    expect(ep.state).toBe("follow_up_recorded");
  });

  it.each(["improved", "unchanged", "worsened"] as const)(
    "%s outcome without decision → learning_decision_pending",
    (status) => {
      const ep = build([outcomeRow(status)], 26 * HOUR);
      expect(ep.state).toBe("learning_decision_pending");
      expect(ep.outcome.status).toBe(status);
      expect(ep.outcome.recordedBy).toBe("grower");
    },
  );

  it("more_data_needed outcome → outcome_recorded (not decision-pending)", () => {
    const ep = build([outcomeRow("more_data_needed")], 26 * HOUR);
    expect(ep.state).toBe("outcome_recorded");
  });

  it("outcome + decision → closed", () => {
    const ep = build([outcomeRow("improved"), decisionRow("repeat")], 27 * HOUR);
    expect(ep.state).toBe("closed");
    expect(ep.learning.decision).toBe("repeat");
    expect(ep.learning.recordedBy).toBe("grower");
  });

  it("explicit monitor decision closes the episode too", () => {
    const ep = build([outcomeRow("improved"), decisionRow("monitor")], 27 * HOUR);
    expect(ep.state).toBe("closed");
    expect(ep.learning.decision).toBe("monitor");
  });

  it("non-completed or completed_at-less actions produce no episode", () => {
    expect(
      buildPlantMemoryEpisode({ action: action({ status: "approved" }), linkedRows: [], now: T0 }),
    ).toBeNull();
    expect(
      buildPlantMemoryEpisode({ action: action({ completed_at: null }), linkedRows: [], now: T0 }),
    ).toBeNull();
  });
});

describe("needs_review triggers (references must agree; nothing silently chosen)", () => {
  it("outcome before action completion", () => {
    const ep = build(
      [outcomeRow("improved", { entry_at: iso(-HOUR) }, { recorded_at: iso(-HOUR) })],
      26 * HOUR,
    );
    expect(ep.state).toBe("needs_review");
    expect(ep.warnings.some((w) => w.code === "outcome_before_completion")).toBe(true);
  });

  it("mismatched grow", () => {
    const ep = build([outcomeRow("improved", { grow_id: "grow-OTHER" })], 26 * HOUR);
    expect(ep.state).toBe("needs_review");
    expect(ep.warnings.some((w) => w.code === "grow_mismatch")).toBe(true);
  });

  it("mismatched plant", () => {
    const ep = build([outcomeRow("improved", { plant_id: "plant-OTHER" })], 26 * HOUR);
    expect(ep.warnings.some((w) => w.code === "plant_mismatch")).toBe(true);
    expect(ep.state).toBe("needs_review");
  });

  it("mismatched tent", () => {
    const ep = build([followupRow({ tent_id: "tent-OTHER" })], 2 * HOUR);
    expect(ep.warnings.some((w) => w.code === "tent_mismatch")).toBe(true);
    expect(ep.state).toBe("needs_review");
  });

  it("duplicate outcomes: neither is chosen; state is needs_review", () => {
    const ep = build(
      [outcomeRow("improved"), outcomeRow("worsened", { id: "out-2" })],
      26 * HOUR,
    );
    expect(ep.state).toBe("needs_review");
    expect(ep.outcome.status).toBeNull();
    expect(ep.warnings.some((w) => w.code === "duplicate_outcomes")).toBe(true);
  });

  it("duplicate learning decisions: neither is chosen", () => {
    const ep = build(
      [outcomeRow("improved"), decisionRow("repeat"), decisionRow("avoid", { id: "dec-2" })],
      27 * HOUR,
    );
    expect(ep.state).toBe("needs_review");
    expect(ep.learning.decision).toBeNull();
    expect(ep.warnings.some((w) => w.code === "duplicate_learning_decisions")).toBe(true);
  });

  it("decision without outcome", () => {
    const ep = build([decisionRow("repeat")], 27 * HOUR);
    expect(ep.state).toBe("needs_review");
    expect(ep.warnings.some((w) => w.code === "decision_without_outcome")).toBe(true);
  });

  it("unknown decision value is not adopted", () => {
    const ep = build([outcomeRow("improved"), decisionRow("double_down")], 27 * HOUR);
    expect(ep.learning.decision).toBeNull();
    // The row exists but its decision is unknown → treated as decision-less.
    expect(ep.state).toBe("learning_decision_pending");
  });

  it("future completed_at → needs_review", () => {
    const ep = build([], 0, { completed_at: iso(7 * 60 * 1000) });
    expect(ep.warnings.some((w) => w.code === "future_timestamp")).toBe(true);
    expect(ep.state).toBe("needs_review");
  });

  it("future outcome recorded_at → needs_review", () => {
    const ep = build(
      [outcomeRow("improved", {}, { recorded_at: iso(48 * HOUR) })],
      26 * HOUR,
    );
    expect(ep.warnings.some((w) => w.code === "future_timestamp")).toBe(true);
  });

  it("invalid timestamps → needs_review", () => {
    const ep = build([outcomeRow("improved", {}, { recorded_at: "not-a-date" })], 26 * HOUR);
    expect(ep.warnings.some((w) => w.code === "invalid_timestamp")).toBe(true);
    expect(ep.state).toBe("needs_review");
  });

  it("null-safe rows: junk details never crash or link", () => {
    const junk = diaryRow({ id: "junk", details: null });
    const junk2 = diaryRow({ id: "junk2", details: { event_type: 42 } as never });
    const ep = build([junk, junk2], 2 * HOUR);
    expect(ep.followUp.entryId).toBeNull();
    expect(ep.outcome.entryId).toBeNull();
  });

  it("cross-tent sensor snapshot is excluded and surfaced", () => {
    const episode = buildPlantMemoryEpisode({
      action: action(),
      linkedRows: [],
      sensorEvidence: [
        {
          snapshotId: "s1",
          capturedAt: iso(-HOUR),
          tentId: "tent-OTHER",
          plantId: null,
          source: "live",
          status: "usable",
          confidence: null,
          window: "before",
          usable: true,
        },
      ],
      now: T0 + 2 * HOUR,
    });
    expect(episode?.evidence.sensorSnapshots).toHaveLength(0);
    expect(episode?.warnings.some((w) => w.code === "snapshot_tent_mismatch")).toBe(true);
  });
});

describe("linkage is explicit-id only", () => {
  it("rows for other actions are never linked", () => {
    const other = outcomeRow("improved", { id: "other" }, { action_queue_id: "act-999" });
    const { outcomes } = linkRowsToAction([other], "act-1");
    expect(outcomes).toHaveLength(0);
  });

  it("free-text notes without details are never linked", () => {
    const textOnly = diaryRow({ note: "checked the humidity after the fan fix", details: null });
    const linked = linkRowsToAction([textOnly], "act-1");
    expect(linked.followUps.length + linked.outcomes.length + linked.decisions.length).toBe(0);
  });
});

describe("evidence windows are time buckets, not causal claims", () => {
  it("classifies before/after/later and excludes out-of-window", () => {
    expect(classifyEvidenceWindow(T0 - HOUR, T0)).toBe("before");
    expect(classifyEvidenceWindow(T0 - EPISODE_BEFORE_WINDOW_MS - 1, T0)).toBeNull();
    expect(classifyEvidenceWindow(T0 + HOUR, T0)).toBe("after");
    expect(classifyEvidenceWindow(T0 + EPISODE_AFTER_WINDOW_MS + 1, T0)).toBe("later");
    expect(
      classifyEvidenceWindow(T0 + EPISODE_FOLLOW_UP_DUE_MS + EPISODE_AFTER_WINDOW_MS + 1, T0),
    ).toBeNull();
  });

  it("no usable evidence → evidence_limited info warning (non-blocking)", () => {
    const ep = build([], 2 * HOUR);
    const warning = ep.warnings.find((w) => w.code === "evidence_limited");
    expect(warning?.severity).toBe("info");
    expect(ep.state).not.toBe("needs_review");
  });
});

describe("deterministic ordering", () => {
  it("orders needs_review, overdue, worsened-first, more-data, decision-pending, closed", () => {
    const overdue = build([], 30 * HOUR, { id: "a-overdue" });
    const worsened = build([outcomeRow("worsened", {}, { action_queue_id: "a-worse" })], 30 * HOUR, { id: "a-worse" });
    const moreData = build([outcomeRow("more_data_needed", {}, { action_queue_id: "a-more" })], 30 * HOUR, { id: "a-more" });
    const pending = build([outcomeRow("improved", {}, { action_queue_id: "a-pend" })], 30 * HOUR, { id: "a-pend" });
    const closed = build(
      [outcomeRow("improved", {}, { action_queue_id: "a-closed" }), decisionRow("repeat", {}, { action_queue_id: "a-closed" })],
      30 * HOUR,
      { id: "a-closed" },
    );
    const review = build([decisionRow("repeat", {}, { action_queue_id: "a-review" })], 30 * HOUR, { id: "a-review" });

    const sorted = [closed, pending, moreData, worsened, overdue, review].sort(
      comparePlantMemoryEpisodes,
    );
    expect(sorted.map((e) => e.state)).toEqual([
      "needs_review",
      "follow_up_due",
      "outcome_recorded",
      "learning_decision_pending",
      "learning_decision_pending",
      "closed",
    ]);
    // worsened outcome ranks before improved within the same state class
    expect(sorted[3].outcome.status).toBe("worsened");
  });

  it("sorting is stable and total (episodeKey tiebreak)", () => {
    const a = build([], 2 * HOUR, { id: "a-1" });
    const b = build([], 2 * HOUR, { id: "a-2" });
    expect(comparePlantMemoryEpisodes(a, b)).not.toBe(0);
    expect(Math.sign(comparePlantMemoryEpisodes(a, b))).toBe(
      -Math.sign(comparePlantMemoryEpisodes(b, a)),
    );
  });
});

describe("run_learning_decision draft", () => {
  const closedEpisode = () => build([outcomeRow("improved")], 26 * HOUR);

  it("builds a draft with explicit references and WITHOUT user_id", () => {
    const result = buildRunLearningDecisionDraft(closedEpisode(), {
      decision: "repeat",
      rationale: "  same RH target next run  ",
      recordedAt: iso(27 * HOUR),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.details.action_queue_id).toBe("act-1");
    expect(result.draft.details.action_outcome_entry_id).toBe("out-1");
    expect(result.draft.details.decision).toBe("repeat");
    expect(result.draft.details.rationale).toBe("same RH target next run");
    expect(result.draft.details.recorded_by).toBe("grower");
    expect(Object.keys(result.draft)).not.toContain("user_id");
    expect(Object.keys(result.draft.details)).not.toContain("user_id");
    // Careful copy: grower decision, no causal claim.
    expect(result.draft.note).toContain("Grower decision");
    expect(result.draft.note).toContain("not claiming");
  });

  it("requires an existing grower-recorded outcome", () => {
    const noOutcome = build([], 26 * HOUR);
    expect(
      buildRunLearningDecisionDraft(noOutcome, {
        decision: "repeat",
        rationale: null,
        recordedAt: iso(27 * HOUR),
      }),
    ).toMatchObject({ ok: false, reason: "missing_outcome" });

    const notGrower = build(
      [outcomeRow("improved", {}, { recorded_by: "ai" })],
      26 * HOUR,
    );
    expect(
      buildRunLearningDecisionDraft(notGrower, {
        decision: "repeat",
        rationale: null,
        recordedAt: iso(27 * HOUR),
      }),
    ).toMatchObject({ ok: false, reason: "outcome_not_grower_recorded" });
  });

  it("rejects unknown decisions", () => {
    expect(
      buildRunLearningDecisionDraft(closedEpisode(), {
        decision: "always_do_this",
        rationale: "x",
        recordedAt: iso(27 * HOUR),
      }),
    ).toMatchObject({ ok: false, reason: "invalid_decision" });
  });

  it.each(["avoid", "adjust"] as const)("requires rationale for %s", (decision) => {
    expect(
      buildRunLearningDecisionDraft(closedEpisode(), {
        decision,
        rationale: "   ",
        recordedAt: iso(27 * HOUR),
      }),
    ).toMatchObject({ ok: false, reason: "rationale_required" });
  });

  it.each(["repeat", "monitor"] as const)("rationale optional for %s", (decision) => {
    const result = buildRunLearningDecisionDraft(closedEpisode(), {
      decision,
      rationale: null,
      recordedAt: iso(27 * HOUR),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.details.rationale).toBeNull();
  });

  it("caps rationale length at the grower-note limit", () => {
    expect(
      buildRunLearningDecisionDraft(closedEpisode(), {
        decision: "repeat",
        rationale: "x".repeat(LEARNING_RATIONALE_MAX_LENGTH + 1),
        recordedAt: iso(27 * HOUR),
      }),
    ).toMatchObject({ ok: false, reason: "rationale_too_long" });
  });

  it("rejects invalid recordedAt", () => {
    expect(
      buildRunLearningDecisionDraft(closedEpisode(), {
        decision: "repeat",
        rationale: null,
        recordedAt: "yesterday-ish",
      }),
    ).toMatchObject({ ok: false, reason: "invalid_recorded_at" });
  });

  it("exposes exactly the four decisions", () => {
    expect(NEXT_RUN_DECISIONS).toEqual(["repeat", "avoid", "adjust", "monitor"]);
  });
});

describe("learningDecisionMatches (idempotency matcher)", () => {
  it("matches only the exact event type + action id", () => {
    const row = { details: { event_type: RUN_LEARNING_DECISION_EVENT_TYPE, action_queue_id: "act-1" } };
    expect(learningDecisionMatches(row, "act-1")).toBe(true);
    expect(learningDecisionMatches(row, "act-2")).toBe(false);
    expect(
      learningDecisionMatches({ details: { event_type: "action_outcome", action_queue_id: "act-1" } }, "act-1"),
    ).toBe(false);
    expect(learningDecisionMatches(null, "act-1")).toBe(false);
    expect(learningDecisionMatches({ details: null }, "act-1")).toBe(false);
  });
});
