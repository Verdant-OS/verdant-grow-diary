/**
 * Plant Memory Episode — pure, deterministic rules joining ONE completed
 * Action Queue item with its grower-recorded follow-up, outcome, learning
 * decision, and bounded evidence windows.
 *
 * SAFETY (One-Tent Learning Loop V1 truth boundary):
 *  - An episode NEVER claims the action caused anything. It records what the
 *    grower observed and when readings occurred. Copy built here must say
 *    "recorded after" / "grower observed", never "fixed" / "caused".
 *  - Outcomes and learning decisions are grower-entered. Nothing in this
 *    module infers them from sensor readings, alert state, or AI output.
 *  - Linkage is by explicit ids (action_queue_id, followup_entry_id,
 *    action_outcome_entry_id). Free-text similarity is never used.
 *  - When explicit references disagree, the episode is marked needs_review
 *    with a deterministic warning; nothing is silently chosen or dropped,
 *    and another plant's/grower's evidence is never attached.
 *  - Pure module: no Date.now()/new Date() in logic — callers inject `now`.
 *
 * Existing contracts reused (do NOT fork these vocabularies):
 *  - OutcomeStatus improved|unchanged|worsened|more_data_needed and the
 *    action_outcome details JSON from src/lib/actionOutcomeRules.ts.
 *  - action_followup details JSON from src/lib/actionFollowupRules.ts.
 *  - The 24h follow-up due window from src/lib/pendingOutcomeReviewRules.ts.
 *  - The repeat|avoid|adjust|monitor vocabulary already specified (analytics
 *    contract) in docs/v0-loop-event-map.md.
 */
import {
  ACTION_OUTCOME_EVENT_TYPE,
  OUTCOME_STATUSES,
  type OutcomeStatus,
} from "@/lib/actionOutcomeRules";
import { ACTION_FOLLOWUP_EVENT_TYPE } from "@/lib/actionFollowupRules";
import { PENDING_OUTCOME_REVIEW_THRESHOLD_MS } from "@/lib/pendingOutcomeReviewRules";

// ── Vocabulary ─────────────────────────────────────────────────────────────

export const RUN_LEARNING_DECISION_EVENT_TYPE = "run_learning_decision" as const;

export const NEXT_RUN_DECISIONS = ["repeat", "avoid", "adjust", "monitor"] as const;
export type NextRunDecision = (typeof NEXT_RUN_DECISIONS)[number];

/** Grower-recorded response — the existing outcome vocabulary, not a fork. */
export type GrowerResponse = OutcomeStatus;
export const GROWER_RESPONSES = OUTCOME_STATUSES;

export const PLANT_MEMORY_EPISODE_STATES = [
  "action_completed",
  "follow_up_due",
  "follow_up_recorded",
  "outcome_recorded",
  "learning_decision_pending",
  "closed",
  "needs_review",
] as const;
export type PlantMemoryEpisodeState = (typeof PLANT_MEMORY_EPISODE_STATES)[number];

// ── Windows (explicit constants; timing proximity is NEVER causation) ──────

/** Follow-up due: the existing product contract (24h). */
export const EPISODE_FOLLOW_UP_DUE_MS = PENDING_OUTCOME_REVIEW_THRESHOLD_MS;
/** Evidence window before the action (aligned with the 6h photo/sensor
 *  context-linking window in photoSensorContextLinkingRules). */
export const EPISODE_BEFORE_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Evidence window after the action. */
export const EPISODE_AFTER_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Follow-up notes written within this grace of completion are the automatic
 *  reminder note, not a later grower check. */
export const AUTO_FOLLOWUP_GRACE_MS = 15 * 60 * 1000;
/** Client clocks may skew slightly; beyond this a timestamp is "future". */
export const FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
/** Grower rationale cap — mirrors the grower-note cap precedent
 *  (environmentCheckQuickLogRules NOTE_MAX). */
export const LEARNING_RATIONALE_MAX_LENGTH = 400;

// ── Warnings ───────────────────────────────────────────────────────────────

export const EPISODE_WARNING_CODES = [
  "plant_mismatch",
  "grow_mismatch",
  "tent_mismatch",
  "unknown_action_reference",
  "duplicate_outcomes",
  "duplicate_learning_decisions",
  "outcome_before_completion",
  "decision_without_outcome",
  "future_timestamp",
  "invalid_timestamp",
  "snapshot_tent_mismatch",
  "missing_follow_up",
  "evidence_limited",
] as const;
export type EpisodeWarningCode = (typeof EPISODE_WARNING_CODES)[number];

export interface PlantMemoryEpisodeWarning {
  readonly code: EpisodeWarningCode;
  /** review → the episode is needs_review; info → shown but non-blocking. */
  readonly severity: "review" | "info";
  /** Careful, non-causal, id-free copy. */
  readonly message: string;
}

const REVIEW_WARNINGS: ReadonlySet<EpisodeWarningCode> = new Set([
  "plant_mismatch",
  "grow_mismatch",
  "tent_mismatch",
  "unknown_action_reference",
  "duplicate_outcomes",
  "duplicate_learning_decisions",
  "outcome_before_completion",
  "decision_without_outcome",
  "future_timestamp",
  "invalid_timestamp",
]);

const WARNING_MESSAGES: Record<EpisodeWarningCode, string> = {
  plant_mismatch:
    "A linked entry references a different plant than the action. Review before trusting this episode.",
  grow_mismatch:
    "A linked entry references a different grow than the action. Review before trusting this episode.",
  tent_mismatch:
    "A linked entry references a different tent than the action. Review before trusting this episode.",
  unknown_action_reference:
    "A linked entry references an action that could not be found.",
  duplicate_outcomes:
    "More than one grower-recorded outcome exists for this action. Review which one applies.",
  duplicate_learning_decisions:
    "More than one next-run decision exists for this action. Review which one applies.",
  outcome_before_completion:
    "The recorded outcome is timestamped before the action was completed. Review the timeline.",
  decision_without_outcome:
    "A next-run decision exists without a grower-recorded outcome.",
  future_timestamp: "A linked entry carries a timestamp in the future.",
  invalid_timestamp: "A linked entry carries an unreadable timestamp.",
  snapshot_tent_mismatch:
    "A sensor snapshot from a different tent was excluded from this episode.",
  missing_follow_up: "No follow-up has been recorded for this action yet.",
  evidence_limited:
    "The available evidence is limited. Other factors may have contributed.",
};

export function episodeWarning(code: EpisodeWarningCode): PlantMemoryEpisodeWarning {
  return {
    code,
    severity: REVIEW_WARNINGS.has(code) ? "review" : "info",
    message: WARNING_MESSAGES[code],
  };
}

// ── Evidence types (pre-classified by the adapter; rules never fetch) ──────

/** Sensor evidence keeps the sensor-truth envelope. `status` comes from
 *  sensorSnapshotStatusContract (usable|stale|invalid|needs_review|no_data);
 *  `source` from the provenance vocabulary (live|manual|csv|demo|stale|invalid).
 *  Invalid evidence is never usable; stale is never presented as current;
 *  demo is always labeled demo; unknown provenance is needs_review. */
export interface EpisodeSensorEvidence {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly source: string;
  readonly status: string;
  readonly confidence: string | null;
  readonly window: EpisodeEvidenceWindow;
  /** True only when the status contract says this counts as evidence. */
  readonly usable: boolean;
}

export interface EpisodePhotoEvidence {
  readonly entryId: string;
  readonly capturedAt: string;
  readonly window: EpisodeEvidenceWindow;
}

export interface EpisodeTimelineEvidence {
  readonly entryId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly window: EpisodeEvidenceWindow;
}

export type EpisodeEvidenceWindow = "before" | "after" | "later";

// ── Input rows ─────────────────────────────────────────────────────────────

export interface EpisodeActionInput {
  readonly id: string;
  readonly grow_id: string;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly source: string | null;
  readonly action_type?: string | null;
  readonly target_metric: string | null;
  readonly suggested_change: string | null;
  readonly reason: string | null;
  readonly status: string;
  readonly completed_at: string | null;
}

/** A diary row candidate (already scoped to the grower by RLS upstream). */
export interface EpisodeDiaryRowInput {
  readonly id: string;
  readonly grow_id: string | null;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly note: string | null;
  readonly entry_at: string | null;
  readonly details: Record<string, unknown> | null;
}

export interface PlantMemoryEpisode {
  readonly episodeKey: string;
  readonly growId: string;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly action: {
    readonly actionQueueId: string;
    readonly source: string | null;
    readonly actionType: string | null;
    readonly targetMetric: string | null;
    readonly suggestedChange: string | null;
    readonly reason: string | null;
    readonly completedAt: string;
  };
  readonly followUp: {
    readonly entryId: string | null;
    readonly occurredAt: string | null;
    readonly note: string | null;
  };
  readonly outcome: {
    readonly entryId: string | null;
    readonly status: GrowerResponse | null;
    readonly occurredAt: string | null;
    readonly note: string | null;
    readonly recordedBy: "grower" | null;
  };
  readonly learning: {
    readonly entryId: string | null;
    readonly decision: NextRunDecision | null;
    readonly rationale: string | null;
    readonly recordedAt: string | null;
    readonly recordedBy: "grower" | null;
  };
  readonly evidence: {
    readonly photos: readonly EpisodePhotoEvidence[];
    readonly sensorSnapshots: readonly EpisodeSensorEvidence[];
    readonly timelineEntries: readonly EpisodeTimelineEvidence[];
  };
  readonly state: PlantMemoryEpisodeState;
  readonly warnings: readonly PlantMemoryEpisodeWarning[];
}

// ── Small deterministic helpers ────────────────────────────────────────────

export function parseEpochMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function detailString(details: Record<string, unknown> | null, key: string): string | null {
  const v = details?.[key];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function isNextRunDecision(value: unknown): value is NextRunDecision {
  return typeof value === "string" && (NEXT_RUN_DECISIONS as readonly string[]).includes(value);
}

export function isGrowerResponse(value: unknown): value is GrowerResponse {
  return typeof value === "string" && (OUTCOME_STATUSES as readonly string[]).includes(value);
}

/** Bucket a timestamp relative to the action into an evidence window.
 *  Returns null when the timestamp is outside every window (item excluded —
 *  ambiguous evidence stays unlinked rather than guessed). */
export function classifyEvidenceWindow(
  occurredAtMs: number,
  completedAtMs: number,
): EpisodeEvidenceWindow | null {
  if (occurredAtMs <= completedAtMs) {
    return completedAtMs - occurredAtMs <= EPISODE_BEFORE_WINDOW_MS ? "before" : null;
  }
  if (occurredAtMs - completedAtMs <= EPISODE_AFTER_WINDOW_MS) return "after";
  if (occurredAtMs - completedAtMs <= EPISODE_FOLLOW_UP_DUE_MS + EPISODE_AFTER_WINDOW_MS) {
    return "later";
  }
  return null;
}

// ── Linkage: partition diary rows for one action by EXPLICIT ids only ──────

export interface EpisodeLinkedRows {
  readonly followUps: readonly EpisodeDiaryRowInput[];
  readonly outcomes: readonly EpisodeDiaryRowInput[];
  readonly decisions: readonly EpisodeDiaryRowInput[];
}

export function linkRowsToAction(
  rows: readonly EpisodeDiaryRowInput[],
  actionId: string,
): EpisodeLinkedRows {
  const followUps: EpisodeDiaryRowInput[] = [];
  const outcomes: EpisodeDiaryRowInput[] = [];
  const decisions: EpisodeDiaryRowInput[] = [];
  for (const row of rows) {
    const details = row.details ?? null;
    if (detailString(details, "action_queue_id") !== actionId) continue;
    const eventType = detailString(details, "event_type");
    if (eventType === ACTION_FOLLOWUP_EVENT_TYPE) followUps.push(row);
    else if (eventType === ACTION_OUTCOME_EVENT_TYPE) outcomes.push(row);
    else if (eventType === RUN_LEARNING_DECISION_EVENT_TYPE) decisions.push(row);
  }
  const byRecordedAt = (a: EpisodeDiaryRowInput, b: EpisodeDiaryRowInput) => {
    const am = parseEpochMs(detailString(a.details ?? null, "recorded_at") ?? a.entry_at) ?? 0;
    const bm = parseEpochMs(detailString(b.details ?? null, "recorded_at") ?? b.entry_at) ?? 0;
    return am - bm || a.id.localeCompare(b.id);
  };
  followUps.sort(byRecordedAt);
  outcomes.sort(byRecordedAt);
  decisions.sort(byRecordedAt);
  return { followUps, outcomes, decisions };
}

// ── Episode builder ────────────────────────────────────────────────────────

export interface BuildEpisodeInput {
  readonly action: EpisodeActionInput;
  readonly linkedRows: readonly EpisodeDiaryRowInput[];
  readonly sensorEvidence?: readonly EpisodeSensorEvidence[];
  readonly photoEvidence?: readonly EpisodePhotoEvidence[];
  readonly timelineEvidence?: readonly EpisodeTimelineEvidence[];
  /** Injected clock — ISO string or epoch ms. Never read from Date here. */
  readonly now: string | number;
}

export function buildPlantMemoryEpisode(input: BuildEpisodeInput): PlantMemoryEpisode | null {
  const { action } = input;
  if (!action?.id || action.status !== "completed" || !action.completed_at) return null;

  const nowMs = typeof input.now === "number" ? input.now : parseEpochMs(input.now);
  const completedAtMs = parseEpochMs(action.completed_at);
  const warnings: PlantMemoryEpisodeWarning[] = [];
  const pushWarning = (code: EpisodeWarningCode) => {
    if (!warnings.some((w) => w.code === code)) warnings.push(episodeWarning(code));
  };

  if (nowMs === null || completedAtMs === null) {
    pushWarning("invalid_timestamp");
  } else if (completedAtMs > nowMs + FUTURE_TIMESTAMP_SKEW_MS) {
    pushWarning("future_timestamp");
  }

  const { followUps, outcomes, decisions } = linkRowsToAction(input.linkedRows, action.id);

  // Ownership consistency — explicit references must agree.
  for (const row of [...followUps, ...outcomes, ...decisions]) {
    if (row.grow_id && row.grow_id !== action.grow_id) pushWarning("grow_mismatch");
    if (row.plant_id && action.plant_id && row.plant_id !== action.plant_id) {
      pushWarning("plant_mismatch");
    }
    if (row.tent_id && action.tent_id && row.tent_id !== action.tent_id) {
      pushWarning("tent_mismatch");
    }
  }

  // Follow-up (the auto reminder or a later grower check).
  const followUpRow = followUps[0] ?? null;
  if (followUps.length === 0) pushWarning("missing_follow_up");

  // Outcome — duplicates are surfaced, never silently resolved.
  let outcomeRow: EpisodeDiaryRowInput | null = null;
  if (outcomes.length > 1) {
    pushWarning("duplicate_outcomes");
  } else {
    outcomeRow = outcomes[0] ?? null;
  }

  const outcomeDetails = outcomeRow?.details ?? null;
  const outcomeStatusRaw = detailString(outcomeDetails, "outcome_status");
  const outcomeStatus = isGrowerResponse(outcomeStatusRaw) ? outcomeStatusRaw : null;
  const outcomeRecordedAt =
    detailString(outcomeDetails, "recorded_at") ?? outcomeRow?.entry_at ?? null;
  const outcomeRecordedAtMs = parseEpochMs(outcomeRecordedAt);
  const outcomeRecordedBy =
    detailString(outcomeDetails, "recorded_by") === "grower" ? ("grower" as const) : null;

  if (outcomeRow && outcomeRecordedAtMs === null) pushWarning("invalid_timestamp");
  if (
    outcomeRecordedAtMs !== null &&
    completedAtMs !== null &&
    outcomeRecordedAtMs < completedAtMs
  ) {
    pushWarning("outcome_before_completion");
  }
  if (nowMs !== null && outcomeRecordedAtMs !== null && outcomeRecordedAtMs > nowMs + FUTURE_TIMESTAMP_SKEW_MS) {
    pushWarning("future_timestamp");
  }

  // Learning decision — duplicates are surfaced, never silently resolved.
  let decisionRow: EpisodeDiaryRowInput | null = null;
  if (decisions.length > 1) {
    pushWarning("duplicate_learning_decisions");
  } else {
    decisionRow = decisions[0] ?? null;
  }
  const decisionDetails = decisionRow?.details ?? null;
  const decisionRaw = detailString(decisionDetails, "decision");
  const decision = isNextRunDecision(decisionRaw) ? decisionRaw : null;
  const decisionRecordedAt = detailString(decisionDetails, "recorded_at");
  if (decisionRow && !outcomeRow && outcomes.length === 0) {
    pushWarning("decision_without_outcome");
  }
  if (
    nowMs !== null &&
    parseEpochMs(decisionRecordedAt) !== null &&
    (parseEpochMs(decisionRecordedAt) as number) > nowMs + FUTURE_TIMESTAMP_SKEW_MS
  ) {
    pushWarning("future_timestamp");
  }

  // Sensor evidence: exclude cross-tent snapshots outright (never another
  // tent's evidence), and surface that exclusion.
  const sensorSnapshots: EpisodeSensorEvidence[] = [];
  for (const item of input.sensorEvidence ?? []) {
    if (item.tentId && action.tent_id && item.tentId !== action.tent_id) {
      pushWarning("snapshot_tent_mismatch");
      continue;
    }
    sensorSnapshots.push(item);
  }

  const photos = [...(input.photoEvidence ?? [])].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  );
  const timelineEntries = [...(input.timelineEvidence ?? [])].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  const usableEvidenceCount =
    photos.length + sensorSnapshots.filter((s) => s.usable).length;
  if (usableEvidenceCount === 0) pushWarning("evidence_limited");

  // Deterministic state machine (review warnings dominate).
  const hasReviewWarning = warnings.some((w) => w.severity === "review");
  let state: PlantMemoryEpisodeState;
  if (hasReviewWarning) {
    state = "needs_review";
  } else if (outcomeStatus && decision) {
    state = "closed";
  } else if (outcomeStatus === "more_data_needed") {
    state = "outcome_recorded";
  } else if (outcomeStatus) {
    state = "learning_decision_pending";
  } else if (
    followUpRow &&
    completedAtMs !== null &&
    (parseEpochMs(followUpRow.entry_at) ?? completedAtMs) - completedAtMs > AUTO_FOLLOWUP_GRACE_MS
  ) {
    state = "follow_up_recorded";
  } else if (
    nowMs !== null &&
    completedAtMs !== null &&
    nowMs - completedAtMs >= EPISODE_FOLLOW_UP_DUE_MS
  ) {
    state = "follow_up_due";
  } else {
    state = "action_completed";
  }

  return {
    episodeKey: `episode:${action.id}`,
    growId: action.grow_id,
    tentId: action.tent_id,
    plantId: action.plant_id,
    action: {
      actionQueueId: action.id,
      source: action.source,
      actionType: action.action_type ?? null,
      targetMetric: action.target_metric,
      suggestedChange: action.suggested_change,
      reason: action.reason,
      completedAt: action.completed_at,
    },
    followUp: {
      entryId: followUpRow?.id ?? null,
      occurredAt: followUpRow?.entry_at ?? null,
      note: followUpRow?.note ?? null,
    },
    outcome: {
      entryId: outcomeRow?.id ?? null,
      status: outcomeStatus,
      occurredAt: outcomeRecordedAt,
      note: outcomeRow?.note ?? null,
      recordedBy: outcomeRecordedBy,
    },
    learning: {
      entryId: decisionRow?.id ?? null,
      decision,
      rationale: detailString(decisionDetails, "rationale"),
      recordedAt: decisionRecordedAt,
      recordedBy:
        detailString(decisionDetails, "recorded_by") === "grower" ? "grower" : null,
    },
    evidence: { photos, sensorSnapshots, timelineEntries },
    state,
    warnings,
  };
}

// ── Deterministic ordering (no AI ranking) ─────────────────────────────────

const STATE_PRIORITY: Record<PlantMemoryEpisodeState, number> = {
  needs_review: 0,
  follow_up_due: 1,
  outcome_recorded: 2, // more data needed
  learning_decision_pending: 3,
  follow_up_recorded: 4,
  action_completed: 5,
  closed: 6,
};

/** Queue priority: overdue follow-up first, then worsened outcomes, then
 *  more-data-needed, then decision-missing, then closed. needs_review leads
 *  because nothing in it can be trusted until reviewed. */
export function comparePlantMemoryEpisodes(
  a: PlantMemoryEpisode,
  b: PlantMemoryEpisode,
): number {
  const pa = STATE_PRIORITY[a.state];
  const pb = STATE_PRIORITY[b.state];
  if (pa !== pb) return pa - pb;
  const worsenedA = a.outcome.status === "worsened" ? 0 : 1;
  const worsenedB = b.outcome.status === "worsened" ? 0 : 1;
  if (worsenedA !== worsenedB) return worsenedA - worsenedB;
  return (
    b.action.completedAt.localeCompare(a.action.completedAt) ||
    a.episodeKey.localeCompare(b.episodeKey)
  );
}

// ── run_learning_decision contract ─────────────────────────────────────────

export interface RunLearningDecisionDetails {
  event_type: typeof RUN_LEARNING_DECISION_EVENT_TYPE;
  action_queue_id: string;
  action_outcome_entry_id: string;
  followup_entry_id: string | null;
  decision: NextRunDecision;
  rationale: string | null;
  recorded_by: "grower";
  recorded_at: string;
}

/** Draft row for diary_entries. user_id is deliberately omitted — database
 *  ownership stays authoritative. */
export interface RunLearningDecisionDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  details: RunLearningDecisionDetails;
}

export const DECISION_LABELS: Record<NextRunDecision, string> = {
  repeat: "Repeat next run",
  avoid: "Avoid next run",
  adjust: "Adjust next run",
  monitor: "Monitor before deciding",
};

export type LearningDecisionDraftResult =
  | { ok: true; draft: RunLearningDecisionDraft }
  | { ok: false; reason: string };

export interface LearningDecisionInput {
  readonly decision: string;
  readonly rationale: string | null | undefined;
  /** Injected clock (ISO). */
  readonly recordedAt: string;
}

/**
 * Validation:
 *  - the outcome must exist and be grower-recorded;
 *  - the decision must be one of the allowed four;
 *  - rationale is REQUIRED for avoid/adjust, optional for repeat/monitor;
 *  - whitespace-only rationale counts as empty; length is capped.
 */
export function buildRunLearningDecisionDraft(
  episode: Pick<PlantMemoryEpisode, "growId" | "tentId" | "plantId" | "action" | "outcome" | "followUp">,
  input: LearningDecisionInput,
): LearningDecisionDraftResult {
  if (!episode?.action?.actionQueueId) return { ok: false, reason: "missing_action" };
  if (!episode.growId) return { ok: false, reason: "missing_grow_id" };
  if (!episode.outcome?.entryId || !episode.outcome.status) {
    return { ok: false, reason: "missing_outcome" };
  }
  if (episode.outcome.recordedBy !== "grower") {
    return { ok: false, reason: "outcome_not_grower_recorded" };
  }
  if (!isNextRunDecision(input.decision)) {
    return { ok: false, reason: "invalid_decision" };
  }
  const rationale = (input.rationale ?? "").trim();
  if (rationale.length === 0 && (input.decision === "avoid" || input.decision === "adjust")) {
    return { ok: false, reason: "rationale_required" };
  }
  if (rationale.length > LEARNING_RATIONALE_MAX_LENGTH) {
    return { ok: false, reason: "rationale_too_long" };
  }
  if (parseEpochMs(input.recordedAt) === null) {
    return { ok: false, reason: "invalid_recorded_at" };
  }

  // Careful, non-causal note copy: the grower decision, never a verdict.
  const note = `Next-run decision: ${DECISION_LABELS[input.decision]}. Grower decision based on this run — Verdant is not claiming the action caused the outcome.`;

  return {
    ok: true,
    draft: {
      grow_id: episode.growId,
      tent_id: episode.tentId,
      plant_id: episode.plantId,
      note,
      details: {
        event_type: RUN_LEARNING_DECISION_EVENT_TYPE,
        action_queue_id: episode.action.actionQueueId,
        action_outcome_entry_id: episode.outcome.entryId,
        followup_entry_id: episode.followUp?.entryId ?? null,
        decision: input.decision,
        rationale: rationale.length > 0 ? rationale : null,
        recorded_by: "grower",
        recorded_at: input.recordedAt,
      },
    },
  };
}

/** Idempotency matcher: one current decision per action/outcome pair. */
export function learningDecisionMatches(
  row: { details?: Record<string, unknown> | null } | null | undefined,
  actionQueueId: string | null | undefined,
): boolean {
  if (!row?.details || !actionQueueId) return false;
  return (
    detailString(row.details, "event_type") === RUN_LEARNING_DECISION_EVENT_TYPE &&
    detailString(row.details, "action_queue_id") === actionQueueId
  );
}
