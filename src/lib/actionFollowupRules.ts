/**
 * actionFollowupRules — pure, deterministic mapping from a completed
 * Action Queue row into a follow-up `diary_entries` draft.
 *
 * SCOPE / SAFETY:
 *  - Pure data only. No I/O, no React, no DB.
 *  - Suggest-only. Output is a diary-entry draft for grower memory.
 *  - NEVER emits device commands, automation text, MQTT/webhook/relay/actuator
 *    /Home Assistant strings, nutrient/feed strength changes, or scheduling.
 *  - NEVER mutates alerts.
 *  - NEVER includes user_id (DB default `auth.uid()` is the sole source of truth).
 *  - The originating action's `reason` (with `[alert:<id>]` back-pointer) is
 *    preserved verbatim in the draft details.
 *
 * Used by ActionDetail when a transition lands on `status = "completed"`.
 * Idempotency is enforced at the call site by checking for an existing
 * `diary_entries` row where `details.event_type = "action_followup"`
 * AND `details.action_queue_id = action.id`.
 */

import { extractSourceAlertId } from "@/lib/actionQueueProvenanceRules";

/** Stable, narrow set of follow-up kinds. Only one exists today. */
export type ActionFollowupKind = "24h_recheck";

/** Sentinel constants the UI/tests import — never inline these strings. */
export const ACTION_FOLLOWUP_EVENT_TYPE = "action_followup" as const;
export const ACTION_FOLLOWUP_DEFAULT_KIND: ActionFollowupKind = "24h_recheck";

/**
 * Minimal shape of a completed `action_queue` row needed to build a draft.
 * Intentionally narrow so this helper stays decoupled from page types.
 */
export interface CompletedActionInput {
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

/** JSON-serializable details payload written into `diary_entries.details`. */
export interface ActionFollowupDetails {
  event_type: typeof ACTION_FOLLOWUP_EVENT_TYPE;
  action_queue_id: string;
  source_alert_id: string | null;
  metric: string | null;
  suggested_change: string | null;
  reason: string | null;
  completed_at: string | null;
  followup_kind: ActionFollowupKind;
}

/** Insert-ready draft. Caller passes this straight to `.insert(draft)`. */
export interface ActionFollowupDiaryDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  details: ActionFollowupDetails;
}

export type DraftResult =
  | { ok: true; draft: ActionFollowupDiaryDraft }
  | { ok: false; reason: string };

/* -------------------------------------------------------------------------- */
/* Note templates                                                              */
/* -------------------------------------------------------------------------- */

const HIGH_RH_NOTE =
  "Re-check RH in ~24h and confirm humidity stayed closer to target.";
const LOW_RH_NOTE =
  "Re-check RH in ~24h and confirm the room is not too dry.";
const HIGH_TEMP_NOTE =
  "Re-check temperature in ~24h and confirm heat load improved.";
const LOW_TEMP_NOTE =
  "Re-check temperature in ~24h and confirm the tent is staying warm enough.";
const HIGH_VPD_NOTE =
  "Re-check VPD in ~24h and confirm temp/RH balance improved.";
const LOW_VPD_NOTE =
  "Re-check VPD in ~24h and confirm humidity/airflow improved.";
const CO2_NOTE =
  "Re-check CO2 in ~24h as context only; do not optimize around CO2 alone.";
const SOIL_NOTE =
  "Re-check the root-zone reading in ~24h and compare against plant response.";
const UNKNOWN_NOTE =
  "Re-check the related condition in ~24h and note whether the plant response improved.";

/**
 * Pure, deterministic note picker. Conservative review-first text only.
 * Never produces device commands or aggressive grow advice.
 */
export function followupNoteForAction(
  action: Pick<CompletedActionInput, "target_metric" | "reason">,
): string {
  const metric = (action.target_metric ?? "").trim().toLowerCase();
  const reason = (action.reason ?? "").toLowerCase();
  const isHigh = /\bhigh\b|\babove\b|\bover\b|too high/.test(reason);
  const isLow = /\blow\b|\bbelow\b|\bunder\b|too low/.test(reason);

  if (metric.includes("humid") || metric === "rh" || metric === "humidity_pct") {
    if (isLow) return LOW_RH_NOTE;
    return HIGH_RH_NOTE;
  }
  if (metric.includes("temp")) {
    if (isLow) return LOW_TEMP_NOTE;
    return HIGH_TEMP_NOTE;
  }
  if (metric.includes("vpd")) {
    if (isLow) return LOW_VPD_NOTE;
    return HIGH_VPD_NOTE;
  }
  if (metric.includes("co2")) {
    return CO2_NOTE;
  }
  if (
    metric.includes("soil") ||
    metric.includes("moisture") ||
    metric.includes("root")
  ) {
    return SOIL_NOTE;
  }
  return UNKNOWN_NOTE;
}

/* -------------------------------------------------------------------------- */
/* Eligibility + draft builder                                                 */
/* -------------------------------------------------------------------------- */

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Deterministic eligibility check — pure and null-safe. */
export function isActionEligibleForFollowup(
  action: CompletedActionInput | null | undefined,
): boolean {
  if (!action) return false;
  if (!nonEmptyString(action.id)) return false;
  if (!nonEmptyString(action.grow_id)) return false;
  if (action.status !== "completed") return false;
  return true;
}

/**
 * Build the insert-ready `diary_entries` draft. Never includes `user_id`.
 * Caller is responsible for the idempotency lookup before inserting.
 */
export function buildActionFollowupDiaryDraft(
  action: CompletedActionInput | null | undefined,
): DraftResult {
  if (!action) return { ok: false, reason: "missing_action" };
  const id = nonEmptyString(action.id);
  if (!id) return { ok: false, reason: "missing_action_id" };
  const grow_id = nonEmptyString(action.grow_id);
  if (!grow_id) return { ok: false, reason: "missing_grow_id" };
  if (action.status !== "completed") {
    return { ok: false, reason: "action_not_completed" };
  }

  const metric = nonEmptyString(action.target_metric);
  const suggested = nonEmptyString(action.suggested_change);
  const reason = nonEmptyString(action.reason);
  const completedAt = nonEmptyString(action.completed_at);
  const sourceAlertId = extractSourceAlertId(reason ?? undefined);

  const note = followupNoteForAction({
    target_metric: metric,
    reason: reason,
  });

  return {
    ok: true,
    draft: {
      grow_id,
      tent_id: nonEmptyString(action.tent_id),
      plant_id: nonEmptyString(action.plant_id),
      note,
      details: {
        event_type: ACTION_FOLLOWUP_EVENT_TYPE,
        action_queue_id: id,
        source_alert_id: sourceAlertId,
        metric,
        suggested_change: suggested,
        reason,
        completed_at: completedAt,
        followup_kind: ACTION_FOLLOWUP_DEFAULT_KIND,
      },
    },
  };
}

/**
 * Deterministic matcher for the idempotency lookup.
 * Use in the caller to decide whether to skip the insert.
 */
export function followupMatchesAction(
  row: { details?: { event_type?: unknown; action_queue_id?: unknown } | null } | null | undefined,
  actionId: string | null | undefined,
): boolean {
  if (!row || !row.details) return false;
  const id = nonEmptyString(actionId);
  if (!id) return false;
  return (
    row.details.event_type === ACTION_FOLLOWUP_EVENT_TYPE &&
    row.details.action_queue_id === id
  );
}
