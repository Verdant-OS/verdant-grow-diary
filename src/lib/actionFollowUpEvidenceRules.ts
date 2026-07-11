/**
 * actionFollowUpEvidenceRules — pure, deterministic eligibility + draft
 * validation for grower-entered Action Queue follow-up evidence (V1).
 *
 * SCOPE / SAFETY:
 *  - Pure data only. No I/O, no React, no DB, no AI.
 *  - Grower-entered only. NEVER infers outcome, plant response, or
 *    improvement. NEVER emits device commands. NEVER mutates alerts.
 *  - Complements (does not replace) the existing marker-level
 *    `actionFollowupRules` diary draft used by the completed-action
 *    marker path. This module is the eligibility + draft-shape
 *    contract for the *grower-entered* evidence surface.
 *  - `user_id` is intentionally NOT part of any draft. Ownership is
 *    enforced server-side by `auth.uid()` + RLS at the call site.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type ActionFollowUpOutcome =
  | "improved"
  | "unchanged"
  | "declined"
  | "too_soon"
  | "unclear";

export const ACTION_FOLLOWUP_OUTCOMES: readonly ActionFollowUpOutcome[] = [
  "improved",
  "unchanged",
  "declined",
  "too_soon",
  "unclear",
] as const;

/** Outcomes that REQUIRE a non-empty grower note. */
export const ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE: readonly ActionFollowUpOutcome[] = [
  "declined",
  "unclear",
] as const;

export interface ActionFollowUpEligibilityInput {
  actionId: string | null;
  actionStatus: string | null;
  growId: string | null;
  tentId?: string | null;
  plantId?: string | null;
  existingFollowUpCount: number;
  currentUserOwnsAction: boolean;
}

export type ActionFollowUpEligibilityDecision =
  | { eligible: true }
  | {
      eligible: false;
      reason:
        | "missing_action"
        | "action_not_completed"
        | "missing_grow"
        | "wrong_owner"
        | "follow_up_already_exists";
    };

export interface ActionFollowUpDraft {
  actionQueueId: string;
  growId: string;
  tentId?: string | null;
  plantId?: string | null;
  outcome: ActionFollowUpOutcome;
  note: string;
  observedAt: string;
  photoReference?: string | null;
  sensorSnapshotId?: string | null;
}

export type ActionFollowUpDraftValidation =
  | { ok: true; draft: ActionFollowUpDraft }
  | {
      ok: false;
      reason:
        | "missing_action_id"
        | "missing_grow_id"
        | "invalid_outcome"
        | "note_required"
        | "invalid_observed_at"
        | "invalid_photo_reference"
        | "invalid_sensor_snapshot_id";
    };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const NOTE_MAX = 1000;
const REFERENCE_MAX = 500;
const SIGNED_URL_PATTERNS = [
  /^https?:\/\//i,
  /^blob:/i,
  /^data:/i,
  /token=/i,
  /signature=/i,
];

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isValidOutcome(v: unknown): v is ActionFollowUpOutcome {
  return typeof v === "string" && (ACTION_FOLLOWUP_OUTCOMES as readonly string[]).includes(v);
}

function isValidIsoTimestamp(v: unknown): v is string {
  const s = nonEmptyString(v);
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

/** Reject anything that looks like a signed/object URL — persist storage refs only. */
function isDurableStorageReference(v: string): boolean {
  return !SIGNED_URL_PATTERNS.some((re) => re.test(v));
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

export function evaluateActionFollowUpEligibility(
  input: ActionFollowUpEligibilityInput | null | undefined,
): ActionFollowUpEligibilityDecision {
  if (!input) return { eligible: false, reason: "missing_action" };
  if (!nonEmptyString(input.actionId)) {
    return { eligible: false, reason: "missing_action" };
  }
  if (input.actionStatus !== "completed") {
    return { eligible: false, reason: "action_not_completed" };
  }
  if (!input.currentUserOwnsAction) {
    return { eligible: false, reason: "wrong_owner" };
  }
  if (!nonEmptyString(input.growId)) {
    return { eligible: false, reason: "missing_grow" };
  }
  if (typeof input.existingFollowUpCount === "number" && input.existingFollowUpCount > 0) {
    return { eligible: false, reason: "follow_up_already_exists" };
  }
  return { eligible: true };
}

/* -------------------------------------------------------------------------- */
/* Draft validation                                                            */
/* -------------------------------------------------------------------------- */

export interface RawActionFollowUpDraftInput {
  actionQueueId?: unknown;
  growId?: unknown;
  tentId?: unknown;
  plantId?: unknown;
  outcome?: unknown;
  note?: unknown;
  observedAt?: unknown;
  photoReference?: unknown;
  sensorSnapshotId?: unknown;
}

export function validateActionFollowUpDraft(
  raw: RawActionFollowUpDraftInput | null | undefined,
): ActionFollowUpDraftValidation {
  if (!raw) return { ok: false, reason: "missing_action_id" };
  const actionQueueId = nonEmptyString(raw.actionQueueId);
  if (!actionQueueId) return { ok: false, reason: "missing_action_id" };
  const growId = nonEmptyString(raw.growId);
  if (!growId) return { ok: false, reason: "missing_grow_id" };
  if (!isValidOutcome(raw.outcome)) return { ok: false, reason: "invalid_outcome" };
  if (!isValidIsoTimestamp(raw.observedAt)) {
    return { ok: false, reason: "invalid_observed_at" };
  }

  const noteRaw = typeof raw.note === "string" ? raw.note.trim() : "";
  const noteRequired = (ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE as readonly string[]).includes(
    raw.outcome,
  );
  if (noteRequired && noteRaw.length === 0) {
    return { ok: false, reason: "note_required" };
  }
  const note = noteRaw.length > NOTE_MAX ? noteRaw.slice(0, NOTE_MAX) : noteRaw;

  let photoReference: string | null = null;
  if (raw.photoReference !== undefined && raw.photoReference !== null) {
    const s = nonEmptyString(raw.photoReference);
    if (!s || s.length > REFERENCE_MAX || !isDurableStorageReference(s)) {
      return { ok: false, reason: "invalid_photo_reference" };
    }
    photoReference = s;
  }

  let sensorSnapshotId: string | null = null;
  if (raw.sensorSnapshotId !== undefined && raw.sensorSnapshotId !== null) {
    const s = nonEmptyString(raw.sensorSnapshotId);
    if (!s || s.length > REFERENCE_MAX) {
      return { ok: false, reason: "invalid_sensor_snapshot_id" };
    }
    sensorSnapshotId = s;
  }

  return {
    ok: true,
    draft: {
      actionQueueId,
      growId,
      tentId: nonEmptyString(raw.tentId),
      plantId: nonEmptyString(raw.plantId),
      outcome: raw.outcome,
      note,
      observedAt: (raw.observedAt as string).trim(),
      photoReference,
      sensorSnapshotId,
    },
  };
}

export function actionFollowUpRequiresNote(outcome: ActionFollowUpOutcome): boolean {
  return (ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE as readonly string[]).includes(outcome);
}
