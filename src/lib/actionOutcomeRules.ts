/**
 * actionOutcomeRules — pure, deterministic mapping from a completed
 * Action Queue row + grower-selected outcome into a `diary_entries` draft.
 *
 * SCOPE / SAFETY:
 *  - Pure data only. No I/O, no React, no DB.
 *  - Grower-entered only. NEVER infers outcome from AI, sensor, or alert status.
 *  - NEVER emits device commands, automation text, MQTT/webhook/relay/actuator
 *    external-control strings, nutrient/feed strength changes, or scheduling.
 *  - NEVER mutates alerts or action_queue status.
 *  - NEVER includes user_id (DB default `auth.uid()` is the sole source of truth).
 *
 * Used by ActionDetail after an action is completed and the grower records
 * the outcome of the follow-up re-check.
 */

import { extractSourceAlertId } from "@/lib/actionQueueProvenanceRules";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ACTION_OUTCOME_EVENT_TYPE = "action_outcome" as const;
export const ACTION_OUTCOME_KIND = "24h_recheck" as const;

export const OUTCOME_STATUSES = ["improved", "unchanged", "worsened", "more_data_needed"] as const;

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Minimal shape of a completed `action_queue` row needed to build a draft. */
export interface OutcomeActionInput {
  id: string | null | undefined;
  grow_id: string | null | undefined;
  tent_id?: string | null;
  plant_id?: string | null;
  target_metric?: string | null;
  suggested_change?: string | null;
  reason?: string | null;
  status?: string | null;
  completed_at?: string | null;
}

export interface OutcomeGrowerInput {
  outcome_status: string;
  note?: string | null;
}

export interface OutcomeFollowupRef {
  followup_entry_id?: string | null;
}

export interface OutcomeDraftOptions {
  recordedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ActionOutcomeDetails {
  event_type: typeof ACTION_OUTCOME_EVENT_TYPE;
  action_queue_id: string;
  source_alert_id: string | null;
  followup_entry_id: string | null;
  metric: string | null;
  outcome_status: OutcomeStatus;
  outcome_kind: typeof ACTION_OUTCOME_KIND;
  recorded_by: "grower";
  reason: string | null;
  suggested_change: string | null;
  completed_at: string | null;
  recorded_at: string;
}

export interface ActionOutcomeDiaryDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  details: ActionOutcomeDetails;
}

export type OutcomeDraftResult =
  | { ok: true; draft: ActionOutcomeDiaryDraft }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Default notes (conservative, grower-recorded text only)
// ---------------------------------------------------------------------------

const DEFAULT_NOTES: Record<OutcomeStatus, string> = {
  improved: "Grower recorded this action as improved after follow-up.",
  unchanged: "Grower recorded no clear change after follow-up.",
  worsened: "Grower recorded the condition as worsened after follow-up.",
  more_data_needed: "Grower recorded that more data is needed after follow-up.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isValidOutcomeStatus(v: string): v is OutcomeStatus {
  return (OUTCOME_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidOutcome(status: string): boolean {
  return isValidOutcomeStatus(status);
}

// ---------------------------------------------------------------------------
// Draft builder
// ---------------------------------------------------------------------------

/**
 * Build the insert-ready `diary_entries` draft for an action outcome.
 * Never includes `user_id`. Caller is responsible for idempotency lookup.
 */
export function buildActionOutcomeDiaryDraft(
  action: OutcomeActionInput | null | undefined,
  grower: OutcomeGrowerInput | null | undefined,
  followup?: OutcomeFollowupRef | null,
  options?: OutcomeDraftOptions | null,
): OutcomeDraftResult {
  if (!action) return { ok: false, reason: "missing_action" };

  const id = nonEmptyString(action.id);
  if (!id) return { ok: false, reason: "missing_action_id" };

  const grow_id = nonEmptyString(action.grow_id);
  if (!grow_id) return { ok: false, reason: "missing_grow_id" };

  if (action.status !== "completed") {
    return { ok: false, reason: "action_not_completed" };
  }

  if (!grower) return { ok: false, reason: "missing_grower_input" };

  const outcomeStatus = grower.outcome_status;
  if (!isValidOutcomeStatus(outcomeStatus)) {
    return { ok: false, reason: "invalid_outcome_status" };
  }

  const growerNote = nonEmptyString(grower.note);
  const note = growerNote ?? DEFAULT_NOTES[outcomeStatus];

  const metric = nonEmptyString(action.target_metric);
  const suggested = nonEmptyString(action.suggested_change);
  const reason = nonEmptyString(action.reason);
  const completedAt = nonEmptyString(action.completed_at);
  const sourceAlertId = extractSourceAlertId(reason ?? undefined);
  const followupEntryId = nonEmptyString(followup?.followup_entry_id);
  const recordedAt = nonEmptyString(options?.recordedAt) ?? new Date().toISOString();

  return {
    ok: true,
    draft: {
      grow_id,
      tent_id: nonEmptyString(action.tent_id),
      plant_id: nonEmptyString(action.plant_id),
      note,
      details: {
        event_type: ACTION_OUTCOME_EVENT_TYPE,
        action_queue_id: id,
        source_alert_id: sourceAlertId,
        followup_entry_id: followupEntryId,
        metric,
        outcome_status: outcomeStatus,
        outcome_kind: ACTION_OUTCOME_KIND,
        recorded_by: "grower",
        reason,
        suggested_change: suggested,
        completed_at: completedAt,
        recorded_at: recordedAt,
      },
    },
  };
}

/**
 * Deterministic matcher for the idempotency lookup.
 * Checks whether a diary row is an action_outcome for a given action + kind.
 */
export function outcomeMatchesAction(
  row:
    | {
        details?: {
          event_type?: unknown;
          action_queue_id?: unknown;
          outcome_kind?: unknown;
        } | null;
      }
    | null
    | undefined,
  actionId: string | null | undefined,
): boolean {
  if (!row || !row.details) return false;
  const id = nonEmptyString(actionId);
  if (!id) return false;
  return (
    row.details.event_type === ACTION_OUTCOME_EVENT_TYPE &&
    row.details.action_queue_id === id &&
    row.details.outcome_kind === ACTION_OUTCOME_KIND
  );
}
