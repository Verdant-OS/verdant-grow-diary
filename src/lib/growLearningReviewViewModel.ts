/**
 * Grow Learning Review view model — deterministic summary counts and
 * filtering over Plant Memory Episodes for one grow. Pure.
 *
 * SAFETY: only counts. No effectiveness score, no success percentage, no
 * "best intervention" ranking, no AI recommendation score.
 */
import { comparePlantMemoryEpisodes, type PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";
import { categorizeAction, type PlaybookActionCategory } from "@/lib/nextRunPlaybookRules";

export interface GrowLearningSummary {
  readonly completedActions: number;
  readonly followUpsDue: number;
  readonly outcomesRecorded: number;
  readonly improved: number;
  readonly unchanged: number;
  readonly worsened: number;
  readonly moreDataNeeded: number;
  readonly repeatDecisions: number;
  readonly avoidDecisions: number;
  readonly adjustDecisions: number;
  readonly monitorDecisions: number;
  readonly needsReview: number;
}

export function summarizeGrowLearning(
  episodes: readonly PlantMemoryEpisode[],
): GrowLearningSummary {
  const summary: { -readonly [K in keyof GrowLearningSummary]: number } = {
    completedActions: episodes.length,
    followUpsDue: 0,
    outcomesRecorded: 0,
    improved: 0,
    unchanged: 0,
    worsened: 0,
    moreDataNeeded: 0,
    repeatDecisions: 0,
    avoidDecisions: 0,
    adjustDecisions: 0,
    monitorDecisions: 0,
    needsReview: 0,
  };
  for (const episode of episodes) {
    if (episode.state === "follow_up_due") summary.followUpsDue += 1;
    if (episode.state === "needs_review") summary.needsReview += 1;
    if (episode.outcome.status) {
      summary.outcomesRecorded += 1;
      if (episode.outcome.status === "improved") summary.improved += 1;
      else if (episode.outcome.status === "unchanged") summary.unchanged += 1;
      else if (episode.outcome.status === "worsened") summary.worsened += 1;
      else if (episode.outcome.status === "more_data_needed") summary.moreDataNeeded += 1;
    }
    if (episode.learning.decision === "repeat") summary.repeatDecisions += 1;
    else if (episode.learning.decision === "avoid") summary.avoidDecisions += 1;
    else if (episode.learning.decision === "adjust") summary.adjustDecisions += 1;
    else if (episode.learning.decision === "monitor") summary.monitorDecisions += 1;
  }
  return summary;
}

export const SUMMARY_METRIC_LABELS: Record<keyof GrowLearningSummary, string> = {
  completedActions: "Completed actions",
  followUpsDue: "Follow-ups due",
  outcomesRecorded: "Outcomes recorded",
  improved: "Improved",
  unchanged: "Unchanged",
  worsened: "Worsened",
  moreDataNeeded: "More data needed",
  repeatDecisions: "Repeat decisions",
  avoidDecisions: "Avoid decisions",
  adjustDecisions: "Adjust decisions",
  monitorDecisions: "Monitor decisions",
  needsReview: "Needs review",
};

export const SUMMARY_METRIC_ORDER: ReadonlyArray<keyof GrowLearningSummary> = [
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
];

// ── Filters ──────────────────────────────────────────────────────────────

export interface GrowLearningFilters {
  readonly plantId: string | null;
  readonly tentId: string | null;
  readonly actionCategory: PlaybookActionCategory | null;
  readonly outcomeStatus: string | null;
  readonly nextRunDecision: string | null;
  /** "any" | "complete" | "limited" */
  readonly evidenceCompleteness: "any" | "complete" | "limited";
}

export const DEFAULT_GROW_LEARNING_FILTERS: GrowLearningFilters = {
  plantId: null,
  tentId: null,
  actionCategory: null,
  outcomeStatus: null,
  nextRunDecision: null,
  evidenceCompleteness: "any",
};

/** Deterministic AND-semantics filter. Pure; no AI. */
export function filterGrowLearningEpisodes(
  episodes: readonly PlantMemoryEpisode[],
  filters: GrowLearningFilters,
): PlantMemoryEpisode[] {
  return episodes.filter((episode) => {
    if (filters.plantId && episode.plantId !== filters.plantId) return false;
    if (filters.tentId && episode.tentId !== filters.tentId) return false;
    if (
      filters.actionCategory &&
      categorizeAction({
        targetMetric: episode.action.targetMetric,
        reason: episode.action.reason,
        actionType: episode.action.actionType,
      }) !== filters.actionCategory
    ) {
      return false;
    }
    if (filters.outcomeStatus && episode.outcome.status !== filters.outcomeStatus) return false;
    if (filters.nextRunDecision && episode.learning.decision !== filters.nextRunDecision) {
      return false;
    }
    if (filters.evidenceCompleteness !== "any") {
      const hasEvidence =
        episode.evidence.sensorSnapshots.some((s) => s.usable) ||
        episode.evidence.photos.length > 0;
      if (filters.evidenceCompleteness === "complete" && !hasEvidence) return false;
      if (filters.evidenceCompleteness === "limited" && hasEvidence) return false;
    }
    return true;
  });
}

// ── Episode list ordering ───────────────────────────────────────────────

export type GrowLearningSortOrder = "chronological" | "outcome_first" | "unresolved_first";

const OUTCOME_PRIORITY: Record<string, number> = {
  worsened: 0,
  more_data_needed: 1,
  unchanged: 2,
  improved: 3,
};

export function sortGrowLearningEpisodes(
  episodes: readonly PlantMemoryEpisode[],
  order: GrowLearningSortOrder,
): PlantMemoryEpisode[] {
  const sorted = [...episodes];
  if (order === "chronological") {
    sorted.sort(
      (a, b) =>
        b.action.completedAt.localeCompare(a.action.completedAt) ||
        a.episodeKey.localeCompare(b.episodeKey),
    );
    return sorted;
  }
  if (order === "outcome_first") {
    sorted.sort((a, b) => {
      const pa = a.outcome.status ? (OUTCOME_PRIORITY[a.outcome.status] ?? 4) : 5;
      const pb = b.outcome.status ? (OUTCOME_PRIORITY[b.outcome.status] ?? 4) : 5;
      return pa - pb || comparePlantMemoryEpisodes(a, b);
    });
    return sorted;
  }
  // unresolved_first: deterministic ordering already leads with
  // needs_review/follow_up_due/decision-missing before closed episodes.
  sorted.sort(comparePlantMemoryEpisodes);
  return sorted;
}

/** Group episodes by plant (used for the plant-grouped review mode). */
export function groupEpisodesByPlant(
  episodes: readonly PlantMemoryEpisode[],
): ReadonlyArray<{ plantId: string | null; episodes: readonly PlantMemoryEpisode[] }> {
  const byPlant = new Map<string | null, PlantMemoryEpisode[]>();
  for (const episode of episodes) {
    const key = episode.plantId;
    const bucket = byPlant.get(key);
    if (bucket) bucket.push(episode);
    else byPlant.set(key, [episode]);
  }
  return [...byPlant.entries()]
    .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""))
    .map(([plantId, list]) => ({ plantId, episodes: list }));
}
