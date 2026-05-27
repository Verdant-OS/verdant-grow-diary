/**
 * actionQueueProvenanceRules — pure helpers for surfacing where an action
 * queue item came from.
 *
 * Safety:
 *   - No I/O, no React, no DB.
 *   - Never returns or constructs device commands.
 *   - Strict, deterministic, null-safe parsing.
 */

export type ActionQueueSource =
  | "environment_alert"
  | "ai_coach"
  | "ai_doctor"
  | "manual"
  | "unknown";

/** Persisted `source` values. UI imports these so it never inlines the strings. */
export const ACTION_QUEUE_SOURCE_VALUES = {
  ENVIRONMENT_ALERT: "environment_alert",
  AI_COACH: "ai_coach",
  AI_DOCTOR: "ai_doctor",
  MANUAL: "manual",
} as const;


export interface SourceLabelInput {
  source?: string | null;
}


const ALERT_TOKEN_RE = /\[alert:([A-Za-z0-9_-]{1,64})\]/;

/**
 * Extracts the alert id embedded in an action's reason via `[alert:<id>]`.
 * Returns null when missing, malformed, or non-string.
 */
export function extractSourceAlertId(
  reason: string | null | undefined,
): string | null {
  if (typeof reason !== "string") return null;
  const m = reason.match(ALERT_TOKEN_RE);
  if (!m) return null;
  const id = m[1];
  if (!id || id.length < 1 || id.length > 64) return null;
  return id;
}

export function getActionQueueSourceKind(
  action: SourceLabelInput | null | undefined,
): ActionQueueSource {
  const s = (action?.source ?? "").trim().toLowerCase();
  if (s === "environment_alert") return "environment_alert";
  if (s === "ai_coach") return "ai_coach";
  if (s === "ai_doctor") return "ai_doctor";
  if (s === "manual") return "manual";
  return "unknown";
}

export function getActionQueueSourceLabel(
  action: SourceLabelInput | null | undefined,
): string {
  switch (getActionQueueSourceKind(action)) {
    case "environment_alert":
      return "Environment Alert";
    case "ai_coach":
      return "AI Coach";
    case "ai_doctor":
      return "AI Doctor";
    case "manual":
      return "Manual";
    default:
      return "Unknown";
  }
}

export function isAlertDerived(
  action: SourceLabelInput | null | undefined,
): boolean {
  return getActionQueueSourceKind(action) === "environment_alert";
}

/**
 * Deterministic check: was `action` created from the alert with `alertId`?
 * Requires the `environment_alert` source AND a matching `[alert:<id>]`
 * back-pointer in the action's reason.
 */
export function isActionDerivedFromAlert(
  action:
    | (SourceLabelInput & { reason?: string | null })
    | null
    | undefined,
  alertId: string | null | undefined,
): boolean {
  if (!action || typeof alertId !== "string" || !alertId) return false;
  if (!isAlertDerived(action)) return false;
  return extractSourceAlertId(action.reason) === alertId;
}

/** Alert statuses considered "closed" for stale-action warning purposes. */
export const CLOSED_ALERT_STATUSES = ["resolved", "dismissed"] as const;
export type ClosedAlertStatus = (typeof CLOSED_ALERT_STATUSES)[number];

export function isClosedAlertStatus(
  status: string | null | undefined,
): status is ClosedAlertStatus {
  return status === "resolved" || status === "dismissed";
}

/**
 * Returns true when the alert is closed (resolved/dismissed) but at least one
 * related action queue row is still `pending_approval`. Pure, null-safe, and
 * deterministic — surfaces a read-only warning, never mutates anything.
 */
export function hasPendingActionsForClosedAlert(
  alertStatus: string | null | undefined,
  relatedActions:
    | ReadonlyArray<{ status?: string | null } | null | undefined>
    | null
    | undefined,
): boolean {
  if (!isClosedAlertStatus(alertStatus)) return false;
  if (!Array.isArray(relatedActions) || relatedActions.length === 0) {
    return false;
  }
  for (const a of relatedActions) {
    if (a && a.status === "pending_approval") return true;
  }
  return false;
}

/**
 * Warn when a pending action's source alert has been closed
 * (resolved/dismissed). Pure, null-safe, and deterministic.
 */
export function shouldWarnPendingActionHasClosedSourceAlert(
  actionStatus: string | null | undefined,
  sourceAlertStatus: string | null | undefined,
): boolean {
  if (actionStatus !== "pending_approval") return false;
  return isClosedAlertStatus(sourceAlertStatus);
}



