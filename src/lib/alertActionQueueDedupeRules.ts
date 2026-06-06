/**
 * alertActionQueueDedupeRules — pure, deterministic decision helper for
 * the "Add to Action Queue" handoff on the Alert Detail surface.
 *
 * Scope:
 *   - Decide whether an equivalent non-terminal Action Queue item already
 *     exists for a given alert.
 *   - Decide the safe button state (`can_add` / `already_exists` /
 *     `ineligible`) and a safe label text that NEVER leaks internal
 *     tokens (alert id, grow id, [alert:...]) into the UI.
 *   - Provide a guard `shouldBlockInsert` for the create handler so that
 *     double-clicks and stale UI cannot create a second pending row.
 *
 * Hard constraints:
 *   - No I/O. No Supabase. No React. No timers.
 *   - No automation. No device control. No service_role.
 *   - Does NOT change the back-pointer scheme — reuses the existing
 *     `[alert:<id>]` token + `actionMatchesAlert` from
 *     `alertToActionQueueRules`.
 *   - Treats any non-terminal status as a duplicate: pending_approval,
 *     suggested, pending, approved, simulated, in_progress, queued.
 *   - Treats completed/rejected/cancelled/dismissed/superseded as
 *     terminal — those do not block a new add.
 */
import {
  actionMatchesAlert,
  isAlertEligibleForActionQueue,
  type AlertLike,
} from "./alertToActionQueueRules";

/**
 * Statuses that count as a duplicate (a non-terminal, still-reviewable
 * action). Includes legacy/alt status names the app may use over time.
 * Anything not in this set is considered terminal and does not block.
 */
export const NON_TERMINAL_ACTION_STATUSES: ReadonlySet<string> = new Set([
  "pending_approval",
  "pending",
  "suggested",
  "approved",
  "simulated",
  "in_progress",
  "queued",
]);

export const TERMINAL_ACTION_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "rejected",
  "cancelled",
  "canceled",
  "dismissed",
  "superseded",
  "expired",
]);

/** Minimal shape of an action_queue row used for dedupe decisions. */
export interface ActionQueueRowForDedupe {
  id: string;
  grow_id: string | null;
  source: string | null;
  status: string | null;
  reason: string | null;
}

export type AddButtonState = "can_add" | "already_exists" | "ineligible";

export interface DedupeDecision {
  state: AddButtonState;
  /** Existing non-terminal action row matching this alert, if any. */
  existingActionId: string | null;
  /** Grower-safe button/link label. Never leaks raw ids or tokens. */
  label: string;
  /** Stable reason code for logs/tests. */
  reasonCode:
    | "ok_can_add"
    | "already_pending"
    | "alert_not_eligible"
    | "missing_alert";
}

/** True when a row is a non-terminal duplicate of the given alert. */
export function isDuplicatePendingAction(
  row: ActionQueueRowForDedupe,
  alert: Pick<AlertLike, "id" | "grow_id">,
): boolean {
  if (!row || !alert) return false;
  // actionMatchesAlert already enforces source + grow + back-pointer +
  // pending_approval|approved. We additionally allow the broader
  // non-terminal status set so future statuses still dedupe safely.
  const status = (row.status ?? "").trim().toLowerCase();
  if (TERMINAL_ACTION_STATUSES.has(status)) return false;
  if (!NON_TERMINAL_ACTION_STATUSES.has(status)) return false;
  if (row.source !== "environment_alert") return false;
  if (row.grow_id !== alert.grow_id) return false;
  if (!row.reason) return false;
  return row.reason.includes(`[alert:${alert.id}]`);
}

/**
 * Pick the most relevant existing duplicate row, if any. Deterministic:
 * prefers the first row that matches per `isDuplicatePendingAction`.
 */
export function findExistingPendingAction(
  rows: readonly ActionQueueRowForDedupe[] | null | undefined,
  alert: Pick<AlertLike, "id" | "grow_id">,
): ActionQueueRowForDedupe | null {
  if (!rows || rows.length === 0) return null;
  for (const r of rows) {
    if (isDuplicatePendingAction(r, alert)) return r;
  }
  return null;
}

/** Reconcile alert eligibility + existing rows into a button-state decision. */
export function decideAddButtonState(input: {
  alert: AlertLike | null | undefined;
  existingRows?: readonly ActionQueueRowForDedupe[] | null;
}): DedupeDecision {
  const { alert } = input;
  if (!alert) {
    return {
      state: "ineligible",
      existingActionId: null,
      label: "Add to Action Queue",
      reasonCode: "missing_alert",
    };
  }
  const match = findExistingPendingAction(input.existingRows ?? [], alert);
  if (match) {
    return {
      state: "already_exists",
      existingActionId: match.id,
      label: "Action already queued — view details",
      reasonCode: "already_pending",
    };
  }
  if (!isAlertEligibleForActionQueue(alert)) {
    return {
      state: "ineligible",
      existingActionId: null,
      label: "Add to Action Queue",
      reasonCode: "alert_not_eligible",
    };
  }
  return {
    state: "can_add",
    existingActionId: null,
    label: "Add to Action Queue",
    reasonCode: "ok_can_add",
  };
}

/**
 * Guard used by the create handler immediately before insert. Returns
 * true when the insert MUST be blocked. This is the second line of
 * defense against double-clicks and stale UI; the button-state decision
 * is the first.
 */
export function shouldBlockInsert(input: {
  alert: AlertLike | null | undefined;
  existingRows?: readonly ActionQueueRowForDedupe[] | null;
  inFlight?: boolean;
}): boolean {
  if (input.inFlight) return true;
  const d = decideAddButtonState({
    alert: input.alert,
    existingRows: input.existingRows,
  });
  return d.state !== "can_add";
}

// Re-export the canonical matcher so callers can compose without
// reaching into alertToActionQueueRules directly.
export { actionMatchesAlert };
