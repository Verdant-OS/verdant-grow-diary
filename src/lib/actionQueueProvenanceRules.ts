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
  | "manual"
  | "unknown";

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
