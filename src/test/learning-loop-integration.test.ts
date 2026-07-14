/**
 * Integration test for the One-Tent Learning Loop V1 pure pipeline:
 *
 *   completed action → episode → follow-up queue → outcome → learning
 *   decision → plant episode → grow learning review → next-run playbook →
 *   post-grow PDF learning section
 *
 * Exercises the real adapter + pure builders end-to-end with in-memory
 * fixtures. No network, no production. The only DB touchpoint (the service)
 * is covered separately by the gate/static tests; here we drive the pure
 * composition that the service feeds.
 */
import { describe, expect, it } from "vitest";
import { buildPlantMemoryEpisodes } from "../lib/plantMemoryEpisodeAdapter";
import {
  buildRunLearningDecisionDraft,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
} from "../lib/plantMemoryEpisodeRules";
import { buildOutcomeFollowUpQueue } from "../lib/outcomeFollowUpQueueViewModel";
import { buildNextRunPlaybook } from "../lib/nextRunPlaybookRules";
import { summarizeGrowLearning } from "../lib/growLearningReviewViewModel";
import { buildPostGrowLearningLoopSummary } from "../lib/postGrowLearningLoopSummaryRules";
import { buildPostGrowReportPdfModel } from "../lib/postGrowReportViewModel";
import { buildPostGrowReportPdfHtml } from "../lib/postGrowPdfExport";
import type { PostGrowLearningReportViewModel } from "../lib/postGrowLearningReportRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

const ACTION: EpisodeActionInput = {
  id: "act-int-1",
  grow_id: "grow-int",
  tent_id: "tent-int",
  plant_id: "plant-int",
  source: "ai_suggestion",
  action_type: "environment",
  target_metric: "humidity",
  suggested_change: "Lower RH by venting more",
  reason: "RH high overnight",
  status: "completed",
  completed_at: iso(0),
};

function detailRow(
  id: string,
  details: Record<string, unknown>,
  entryOffset: number,
): EpisodeDiaryRowInput {
  return {
    id,
    grow_id: "grow-int",
    tent_id: "tent-int",
    plant_id: "plant-int",
    note: null,
    entry_at: iso(entryOffset),
    details,
  };
}

describe("learning loop — full pipeline composition", () => {
  it("drives a completed action all the way to a closed episode and a PDF learning section", () => {
    // 1) Completed action, follow-up written, past due window, no outcome yet.
    let diaryRows: EpisodeDiaryRowInput[] = [
      detailRow(
        "fu-1",
        { event_type: "action_followup", action_queue_id: ACTION.id },
        3 * HOUR,
      ),
    ];

    // now = 30h after completion → follow-up is due.
    let episodes = buildPlantMemoryEpisodes({
      actions: [ACTION],
      diaryRows,
      now: T0 + 30 * HOUR,
    });
    expect(episodes).toHaveLength(1);

    // 2) Follow-up review queue surfaces it under "due now".
    let queue = buildOutcomeFollowUpQueue(episodes);
    expect(queue.dueNowCount).toBe(1);
    expect(queue.groups[0].rows[0].cta).toBe("record_response");

    // 3) Grower records the outcome (improved).
    diaryRows = [
      ...diaryRows,
      detailRow(
        "out-1",
        {
          event_type: "action_outcome",
          action_queue_id: ACTION.id,
          outcome_status: "improved",
          recorded_by: "grower",
          recorded_at: iso(25 * HOUR),
        },
        25 * HOUR,
      ),
    ];
    episodes = buildPlantMemoryEpisodes({ actions: [ACTION], diaryRows, now: T0 + 30 * HOUR });
    expect(episodes[0].state).toBe("learning_decision_pending");

    // Queue now asks for a decision.
    queue = buildOutcomeFollowUpQueue(episodes);
    const pending = queue.groups.flatMap((g) => g.rows).find((r) => r.cta === "choose_decision");
    expect(pending).toBeDefined();

    // 4) Grower chooses a next-run decision — improved does NOT auto-become repeat.
    const draftResult = buildRunLearningDecisionDraft(episodes[0], {
      decision: "monitor",
      rationale: null,
      recordedAt: iso(26 * HOUR),
    });
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    // The persisted draft omits user_id.
    expect(Object.keys(draftResult.draft)).not.toContain("user_id");

    // Simulate persistence: the decision becomes a diary row.
    diaryRows = [
      ...diaryRows,
      detailRow("dec-1", { ...draftResult.draft.details }, 26 * HOUR),
    ];
    episodes = buildPlantMemoryEpisodes({ actions: [ACTION], diaryRows, now: T0 + 30 * HOUR });

    // 5) Plant/grow episode is now closed.
    expect(episodes[0].state).toBe("closed");
    expect(episodes[0].learning.decision).toBe("monitor");

    // 6) Grow learning summary counts it deterministically (no scoring).
    const summary = summarizeGrowLearning(episodes);
    expect(summary.completedActions).toBe(1);
    expect(summary.improved).toBe(1);
    expect(summary.monitorDecisions).toBe(1);

    // 7) Next-run playbook files it under Monitor (not Repeat — grower chose).
    const playbook = buildNextRunPlaybook(episodes);
    expect(playbook.groups.map((g) => g.section)).toEqual(["monitor"]);

    // 8) Post-grow PDF renders a bounded, id-free learning section.
    const loopSummary = buildPostGrowLearningLoopSummary(episodes);
    const vm = minimalPdfVm();
    const model = buildPostGrowReportPdfModel(vm, { learningSummary: loopSummary });
    const html = buildPostGrowReportPdfHtml(model);

    expect(html).toContain("Learning loop");
    // A monitor decision is an open question (evidence not strong enough for a
    // firm repeat/avoid), so it appears under that heading, not as a decision.
    expect(html).toContain("Open questions / more data needed");
    expect(html).toContain("Lower RH by venting more");
    // No internal ids leak into the export.
    expect(html).not.toContain("act-int-1");
    expect(html).not.toContain("episode:");
    expect(html).not.toContain("dec-1");
    // No causal/effectiveness claims.
    expect(html).not.toMatch(/\b(caused|fixed the plant|guaranteed|effectiveness score)\b/i);
  });

  it("a worsened outcome the grower marks 'adjust' never appears under Avoid", () => {
    const diaryRows: EpisodeDiaryRowInput[] = [
      detailRow(
        "out-w",
        {
          event_type: "action_outcome",
          action_queue_id: ACTION.id,
          outcome_status: "worsened",
          recorded_by: "grower",
          recorded_at: iso(25 * HOUR),
        },
        25 * HOUR,
      ),
      detailRow(
        "dec-w",
        {
          event_type: "run_learning_decision",
          action_queue_id: ACTION.id,
          action_outcome_entry_id: "out-w",
          followup_entry_id: null,
          decision: "adjust",
          rationale: "try a smaller change next time",
          recorded_by: "grower",
          recorded_at: iso(26 * HOUR),
        },
        26 * HOUR,
      ),
    ];
    const episodes = buildPlantMemoryEpisodes({ actions: [ACTION], diaryRows, now: T0 + 30 * HOUR });
    const playbook = buildNextRunPlaybook(episodes);
    expect(playbook.groups.map((g) => g.section)).toEqual(["adjust"]);
    expect(playbook.groups.find((g) => g.section === "avoid")).toBeUndefined();
  });
});

/** A minimal fully-specified PostGrowLearningReportViewModel for the PDF model. */
function minimalPdfVm(): PostGrowLearningReportViewModel {
  return {
    header: {
      growName: "Integration Grow",
      startedAt: iso(-10 * 24 * HOUR),
      harvestedAt: iso(0),
      archived: false,
    },
    executiveSummary: ["Run completed."],
    dataCompleteness: { label: "Partial", score: 50, missing: [] },
    environment: [],
    postHarvest: { yieldGrams: null, weightLossPct: null, rhStabilized: null, points: [] },
    photos: [],
    actionEffectiveness: { completedActions: 1, outcomeNotes: 1, observations: [] },
    lesson: { text: "" },
    sensorReadingSources: [],
  } as unknown as PostGrowLearningReportViewModel;
}
