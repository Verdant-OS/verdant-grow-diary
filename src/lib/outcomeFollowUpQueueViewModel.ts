/**
 * Outcome Follow-Up Queue view model — pure categorization + ordering of
 * Plant Memory Episodes into a grower-facing review queue.
 *
 * SAFETY: deterministic only. No AI ranking, no causal language, no
 * effectiveness scoring. Ordering comes from comparePlantMemoryEpisodes
 * (overdue → worsened → more-data → decision-missing → closed), with
 * needs_review surfaced in its own category.
 */
import {
  comparePlantMemoryEpisodes,
  type PlantMemoryEpisode,
} from "@/lib/plantMemoryEpisodeRules";
import {
  EPISODE_CTA_LABELS,
  episodeUncertaintyLine,
  primaryEpisodeCta,
  summarizeEpisodeEvidence,
  type SafeEpisodeCta,
} from "@/lib/plantMemoryEpisodeViewModel";

export const OUTCOME_QUEUE_CATEGORIES = [
  "due_now",
  "more_data_needed",
  "decision_pending",
  "closed",
  "needs_review",
] as const;
export type OutcomeQueueCategory = (typeof OUTCOME_QUEUE_CATEGORIES)[number];

export const OUTCOME_QUEUE_CATEGORY_LABELS: Record<OutcomeQueueCategory, string> = {
  due_now: "Due now",
  more_data_needed: "More data needed",
  decision_pending: "Outcome recorded — decision pending",
  closed: "Closed learning episodes",
  needs_review: "Needs review",
};

export function categorizeEpisode(episode: PlantMemoryEpisode): OutcomeQueueCategory {
  switch (episode.state) {
    case "needs_review":
      return "needs_review";
    case "outcome_recorded":
      return "more_data_needed";
    case "learning_decision_pending":
      return "decision_pending";
    case "closed":
      return "closed";
    case "follow_up_due":
    case "follow_up_recorded":
    case "action_completed":
    default:
      return "due_now";
  }
}

export interface OutcomeQueueRow {
  readonly episodeKey: string;
  readonly actionQueueId: string;
  readonly category: OutcomeQueueCategory;
  readonly actionSummary: string;
  readonly plantTentContext: string;
  readonly completedAt: string;
  readonly stateLabel: string;
  readonly outcomeStatusLabel: string | null;
  readonly evidenceSummary: string;
  readonly uncertaintyLine: string;
  readonly cta: SafeEpisodeCta;
  readonly ctaLabel: string;
  readonly needsReview: boolean;
}

export interface OutcomeQueueGroup {
  readonly category: OutcomeQueueCategory;
  readonly label: string;
  readonly rows: readonly OutcomeQueueRow[];
}

export interface OutcomeQueueViewModel {
  readonly groups: readonly OutcomeQueueGroup[];
  readonly totalOpen: number;
  readonly dueNowCount: number;
  readonly needsReviewCount: number;
  readonly isEmpty: boolean;
}

const STATE_LABELS: Record<PlantMemoryEpisode["state"], string> = {
  action_completed: "Completed — follow-up not due yet",
  follow_up_due: "Follow-up due",
  follow_up_recorded: "Follow-up recorded",
  outcome_recorded: "More data needed",
  learning_decision_pending: "Outcome recorded — decision pending",
  closed: "Closed",
  needs_review: "Needs review",
};

const OUTCOME_LABELS: Record<string, string> = {
  improved: "Improved (grower-recorded)",
  unchanged: "Unchanged (grower-recorded)",
  worsened: "Worsened (grower-recorded)",
  more_data_needed: "More data needed (grower-recorded)",
};

function actionSummary(episode: PlantMemoryEpisode): string {
  const metric = episode.action.targetMetric;
  const change = episode.action.suggestedChange;
  if (metric && change) return `${change} (${metric})`;
  if (change) return change;
  if (metric) return `Action on ${metric}`;
  return "Completed action";
}

function plantTentContext(episode: PlantMemoryEpisode): string {
  const parts: string[] = [];
  if (episode.plantId) parts.push("Plant-scoped");
  if (episode.tentId) parts.push("Tent-scoped");
  return parts.length > 0 ? parts.join(" · ") : "Grow-scoped";
}

export function buildOutcomeQueueRow(episode: PlantMemoryEpisode): OutcomeQueueRow {
  const category = categorizeEpisode(episode);
  return {
    episodeKey: episode.episodeKey,
    actionQueueId: episode.action.actionQueueId,
    category,
    actionSummary: actionSummary(episode),
    plantTentContext: plantTentContext(episode),
    completedAt: episode.action.completedAt,
    stateLabel: STATE_LABELS[episode.state],
    outcomeStatusLabel: episode.outcome.status ? OUTCOME_LABELS[episode.outcome.status] : null,
    evidenceSummary: summarizeEpisodeEvidence(episode).label,
    uncertaintyLine: episodeUncertaintyLine(episode),
    cta: primaryEpisodeCta(episode),
    ctaLabel: EPISODE_CTA_LABELS[primaryEpisodeCta(episode)],
    needsReview: episode.state === "needs_review",
  };
}

export function buildOutcomeFollowUpQueue(
  episodes: readonly PlantMemoryEpisode[],
): OutcomeQueueViewModel {
  const sorted = [...episodes].sort(comparePlantMemoryEpisodes);
  const byCategory = new Map<OutcomeQueueCategory, OutcomeQueueRow[]>();
  for (const category of OUTCOME_QUEUE_CATEGORIES) byCategory.set(category, []);
  for (const episode of sorted) {
    const row = buildOutcomeQueueRow(episode);
    byCategory.get(row.category)!.push(row);
  }
  const groups: OutcomeQueueGroup[] = OUTCOME_QUEUE_CATEGORIES.map((category) => ({
    category,
    label: OUTCOME_QUEUE_CATEGORY_LABELS[category],
    rows: byCategory.get(category)!,
  })).filter((group) => group.rows.length > 0);

  const dueNowCount = byCategory.get("due_now")!.length;
  const needsReviewCount = byCategory.get("needs_review")!.length;
  const closedCount = byCategory.get("closed")!.length;
  const totalOpen = sorted.length - closedCount;

  return {
    groups,
    totalOpen,
    dueNowCount,
    needsReviewCount,
    isEmpty: sorted.length === 0,
  };
}
