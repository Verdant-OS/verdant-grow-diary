/**
 * Plant Memory Episode view model — presentation strings only. Pure.
 *
 * TRUTH BOUNDARY: every label frames evidence as a TIME WINDOW and outcomes
 * as GROWER-RECORDED observations. No causal claims, no effectiveness
 * scores, no confidence percentages, no raw ids in user-facing copy.
 */
import {
  DECISION_LABELS,
  type EpisodeEvidenceWindow,
  type GrowerResponse,
  type NextRunDecision,
  type PlantMemoryEpisode,
  type PlantMemoryEpisodeState,
} from "@/lib/plantMemoryEpisodeRules";

export const EPISODE_STATE_LABELS: Record<PlantMemoryEpisodeState, string> = {
  action_completed: "Completed — follow-up not due yet",
  follow_up_due: "Follow-up due",
  follow_up_recorded: "Follow-up recorded",
  outcome_recorded: "More data needed",
  learning_decision_pending: "Outcome recorded — decision pending",
  closed: "Closed learning episode",
  needs_review: "Needs review",
};

/** Time-window labels — never causal comparisons. */
export const EVIDENCE_WINDOW_LABELS: Record<EpisodeEvidenceWindow, string> = {
  before: "Readings recorded before the action",
  after: "Readings recorded after the action",
  later: "Later follow-up window",
};

export const GROWER_RESPONSE_LABELS: Record<GrowerResponse, string> = {
  improved: "Improved (grower-recorded)",
  unchanged: "Unchanged (grower-recorded)",
  worsened: "Worsened (grower-recorded)",
  more_data_needed: "More data needed (grower-recorded)",
};

export const NEXT_RUN_DECISION_LABELS: Record<NextRunDecision, string> = DECISION_LABELS;

/** The uncertainty line every episode surface must show (pick is
 *  deterministic; there is always one). */
export function episodeUncertaintyLine(episode: PlantMemoryEpisode): string {
  if (episode.state === "needs_review") {
    return "This episode has conflicting references. Review before trusting it.";
  }
  if (!episode.outcome.status) {
    return "Follow-up is incomplete. More follow-up is needed.";
  }
  const usable = episode.evidence.sensorSnapshots.some((s) => s.usable) ||
    episode.evidence.photos.length > 0;
  if (!usable) {
    return "Evidence is limited. Other factors may have contributed.";
  }
  return "This is a grower-recorded observation. Other factors may have contributed.";
}

export interface EpisodeEvidenceSummary {
  readonly photoCount: number;
  readonly usableSensorCount: number;
  readonly flaggedSensorCount: number;
  readonly label: string;
}

export function summarizeEpisodeEvidence(episode: PlantMemoryEpisode): EpisodeEvidenceSummary {
  const photoCount = episode.evidence.photos.length;
  const usableSensorCount = episode.evidence.sensorSnapshots.filter((s) => s.usable).length;
  const flaggedSensorCount = episode.evidence.sensorSnapshots.length - usableSensorCount;
  const parts: string[] = [];
  if (photoCount > 0) parts.push(`${photoCount} photo${photoCount === 1 ? "" : "s"}`);
  if (usableSensorCount > 0) parts.push(`${usableSensorCount} sensor reading${usableSensorCount === 1 ? "" : "s"}`);
  if (flaggedSensorCount > 0) parts.push(`${flaggedSensorCount} flagged reading${flaggedSensorCount === 1 ? "" : "s"}`);
  return {
    photoCount,
    usableSensorCount,
    flaggedSensorCount,
    label: parts.length > 0 ? parts.join(" · ") : "No linked evidence yet",
  };
}

/** Sensor evidence chip text: provenance + status, honestly labeled. */
export function sensorEvidenceChip(item: {
  source: string;
  status: string;
  usable: boolean;
}): string {
  if (item.source === "demo") return "Demo data — not from your grow";
  if (item.status === "invalid") return "Invalid reading — not usable as evidence";
  if (item.status === "needs_review") return "Unverified source — review before trusting";
  if (item.status === "stale") return "Recorded earlier — not a current reading";
  return `Source: ${item.source}`;
}

export type SafeEpisodeCta =
  | "record_response"
  | "review_evidence"
  | "choose_decision"
  | "open_episode";

export const EPISODE_CTA_LABELS: Record<SafeEpisodeCta, string> = {
  record_response: "Record plant response",
  review_evidence: "Review evidence",
  choose_decision: "Choose next-run decision",
  open_episode: "Open completed episode",
};

export function primaryEpisodeCta(episode: PlantMemoryEpisode): SafeEpisodeCta {
  switch (episode.state) {
    case "needs_review":
      return "review_evidence";
    case "follow_up_due":
    case "action_completed":
    case "follow_up_recorded":
      return "record_response";
    case "outcome_recorded":
      return "record_response"; // more data wanted → another response check
    case "learning_decision_pending":
      return "choose_decision";
    case "closed":
      return "open_episode";
  }
}
