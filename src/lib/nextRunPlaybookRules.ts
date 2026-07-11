/**
 * Next Run Playbook — pure rules deriving a grower-approved playbook from
 * EXPLICIT learning decisions only. Pure and deterministic.
 *
 * SAFETY:
 *  - No automatic promotion. improved→repeat and worsened→avoid are NEVER
 *    inferred; the playbook groups by the grower's actual recorded decision,
 *    whatever it was (an improved outcome may still be filed under monitor;
 *    a worsened outcome may still be filed under adjust).
 *  - Only closed episodes with BOTH a grower outcome and a grower decision
 *    are promoted into the five sections. Everything else is "unresolved" —
 *    never silently dropped, never guessed into a section.
 *  - Category assignment is a single deterministic lookup table (centralized
 *    here, never duplicated in JSX).
 */
import type { NextRunDecision, PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

export const PLAYBOOK_ACTION_CATEGORIES = [
  "environment",
  "watering_root_zone",
  "nutrition",
  "canopy_training",
  "transplant_root_handling",
  "pest_disease_response",
  "observation_monitoring",
  "other",
] as const;
export type PlaybookActionCategory = (typeof PLAYBOOK_ACTION_CATEGORIES)[number];

export const PLAYBOOK_CATEGORY_LABELS: Record<PlaybookActionCategory, string> = {
  environment: "Environment",
  watering_root_zone: "Watering / root zone",
  nutrition: "Nutrition",
  canopy_training: "Canopy / training",
  transplant_root_handling: "Transplant / root handling",
  pest_disease_response: "Pest / disease response",
  observation_monitoring: "Observation / monitoring",
  other: "Other",
};

/**
 * Deterministic metric/reason → category lookup, mirroring the substring
 * matching convention in actionFollowupRules.followupNoteForAction (order
 * matters: soil/root-zone is checked before generic temperature).
 */
export function categorizeAction(action: {
  readonly targetMetric: string | null;
  readonly reason: string | null;
  readonly actionType?: string | null;
}): PlaybookActionCategory {
  const metric = (action.targetMetric ?? "").trim().toLowerCase();
  const reason = (action.reason ?? "").trim().toLowerCase();
  const actionType = (action.actionType ?? "").trim().toLowerCase();
  const haystack = `${metric} ${reason} ${actionType}`;

  if (/pest|disease|mold|mildew|fungus|insect|aphid|mite|pathogen/.test(haystack)) {
    return "pest_disease_response";
  }
  if (/transplant|root[\s_-]?ball|repot|pot[\s_-]?up|root[\s_-]?bound/.test(haystack)) {
    return "transplant_root_handling";
  }
  if (/prune|train|lst|topping|defoliat|canopy|trellis|scrog/.test(haystack)) {
    return "canopy_training";
  }
  if (/\bec\b|ppm|nutrient|feed|fertiliz|npk|calmag|cal-mag|\bph\b/.test(haystack)) {
    return "nutrition";
  }
  if (/soil|moisture|root[\s_-]?zone|water|irrigat|runoff/.test(haystack)) {
    return "watering_root_zone";
  }
  if (/humid|\brh\b|temp|vpd|co2|airflow|light|ppfd|dli/.test(haystack)) {
    return "environment";
  }
  if (/observ|monitor|check|log|note/.test(haystack)) {
    return "observation_monitoring";
  }
  return "other";
}

export interface PlaybookEvidenceCompleteness {
  readonly hasUsableSensorEvidence: boolean;
  readonly hasPhotoEvidence: boolean;
  readonly label: string;
}

function evidenceCompleteness(episode: PlantMemoryEpisode): PlaybookEvidenceCompleteness {
  const hasUsableSensorEvidence = episode.evidence.sensorSnapshots.some((s) => s.usable);
  const hasPhotoEvidence = episode.evidence.photos.length > 0;
  const label =
    hasUsableSensorEvidence && hasPhotoEvidence
      ? "Sensor and photo evidence available"
      : hasUsableSensorEvidence
        ? "Sensor evidence available"
        : hasPhotoEvidence
          ? "Photo evidence available"
          : "Evidence is limited";
  return { hasUsableSensorEvidence, hasPhotoEvidence, label };
}

export interface PlaybookItem {
  readonly episodeKey: string;
  readonly actionQueueId: string;
  readonly category: PlaybookActionCategory;
  readonly decision: NextRunDecision;
  readonly rationale: string | null;
  readonly actionSummary: string;
  readonly outcomeLabel: string;
  readonly plantId: string | null;
  readonly tentId: string | null;
  readonly evidence: PlaybookEvidenceCompleteness;
  readonly uncertaintyNote: string;
  readonly recordedAt: string | null;
}

export const PLAYBOOK_SECTIONS = [
  "repeat",
  "avoid",
  "adjust",
  "monitor",
  "unresolved",
] as const;
export type PlaybookSection = (typeof PLAYBOOK_SECTIONS)[number];

export const PLAYBOOK_SECTION_LABELS: Record<PlaybookSection, string> = {
  repeat: "Repeat next run",
  avoid: "Avoid next run",
  adjust: "Adjust next run",
  monitor: "Monitor before deciding",
  unresolved: "Unresolved lessons",
};

const OUTCOME_LABELS: Record<string, string> = {
  improved: "Improved (grower-recorded)",
  unchanged: "Unchanged (grower-recorded)",
  worsened: "Worsened (grower-recorded)",
  more_data_needed: "More data needed (grower-recorded)",
};

function actionSummary(episode: PlantMemoryEpisode): string {
  const { targetMetric, suggestedChange } = episode.action;
  if (suggestedChange && targetMetric) return `${suggestedChange} (${targetMetric})`;
  if (suggestedChange) return suggestedChange;
  if (targetMetric) return `Action on ${targetMetric}`;
  return "Completed action";
}

export interface PlaybookGroup {
  readonly section: PlaybookSection;
  readonly label: string;
  readonly items: readonly PlaybookItem[];
}

export interface NextRunPlaybook {
  readonly groups: readonly PlaybookGroup[];
  readonly totalDecided: number;
  readonly totalUnresolved: number;
  readonly isEmpty: boolean;
}

/**
 * Build the playbook from episodes. Only episodes with an explicit grower
 * decision are sectioned by that decision (never inferred from the
 * outcome). Closed-eligible episodes without one land in "unresolved" —
 * completed actions with a grower outcome but no decision yet. Episodes
 * needing review, or with no outcome at all, are excluded entirely (they
 * are not yet a lesson).
 */
export function buildNextRunPlaybook(
  episodes: readonly PlantMemoryEpisode[],
): NextRunPlaybook {
  const bySection = new Map<PlaybookSection, PlaybookItem[]>();
  for (const section of PLAYBOOK_SECTIONS) bySection.set(section, []);

  for (const episode of episodes) {
    if (episode.state === "needs_review") continue;
    if (!episode.outcome.status || episode.outcome.recordedBy !== "grower") continue;

    const category = categorizeAction({
      targetMetric: episode.action.targetMetric,
      reason: episode.action.reason,
      actionType: episode.action.actionType,
    });
    const evidence = evidenceCompleteness(episode);
    const uncertaintyNote = evidence.hasUsableSensorEvidence || evidence.hasPhotoEvidence
      ? "This is a grower-recorded observation. Other factors may have contributed."
      : "Evidence is limited. Other factors may have contributed.";

    const item: PlaybookItem = {
      episodeKey: episode.episodeKey,
      actionQueueId: episode.action.actionQueueId,
      category,
      decision: episode.learning.decision ?? "monitor",
      rationale: episode.learning.rationale,
      actionSummary: actionSummary(episode),
      outcomeLabel: OUTCOME_LABELS[episode.outcome.status] ?? episode.outcome.status,
      plantId: episode.plantId,
      tentId: episode.tentId,
      evidence,
      uncertaintyNote,
      recordedAt: episode.learning.recordedAt,
    };

    const section: PlaybookSection = episode.learning.decision ?? "unresolved";
    bySection.get(section)!.push(item);
  }

  for (const items of bySection.values()) {
    items.sort(
      (a, b) =>
        (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
        a.episodeKey.localeCompare(b.episodeKey),
    );
  }

  const groups: PlaybookGroup[] = PLAYBOOK_SECTIONS.map((section) => ({
    section,
    label: PLAYBOOK_SECTION_LABELS[section],
    items: bySection.get(section)!,
  })).filter((group) => group.items.length > 0);

  const totalUnresolved = bySection.get("unresolved")!.length;
  const totalDecided = groups.reduce((sum, g) => sum + g.items.length, 0) - totalUnresolved;

  return {
    groups,
    totalDecided,
    totalUnresolved,
    isEmpty: groups.length === 0,
  };
}

/** Group playbook items by deterministic action category (for a
 *  category-first view). Categories with no items are omitted. */
export function groupPlaybookItemsByCategory(
  items: readonly PlaybookItem[],
): ReadonlyArray<{ category: PlaybookActionCategory; label: string; items: readonly PlaybookItem[] }> {
  const byCategory = new Map<PlaybookActionCategory, PlaybookItem[]>();
  for (const category of PLAYBOOK_ACTION_CATEGORIES) byCategory.set(category, []);
  for (const item of items) byCategory.get(item.category)!.push(item);
  return PLAYBOOK_ACTION_CATEGORIES.map((category) => ({
    category,
    label: PLAYBOOK_CATEGORY_LABELS[category],
    items: byCategory.get(category)!,
  })).filter((group) => group.items.length > 0);
}
