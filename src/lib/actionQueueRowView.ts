/**
 * Pure presentation helpers for Action Queue rows.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Keeps display/formatting logic outside JSX so it can be unit-tested
 * and reused for accessibility-related labels.
 */

import { getActionQueueSourceLabel } from "@/lib/actionQueueProvenanceRules";

/**
 * Sanitize grower-facing action copy by replacing internal AI prompt
 * tokens (e.g. `LATEST_SENSOR_SNAPSHOT`) with human-readable text.
 *
 * AI Doctor / AI Coach prompts include a stable annotation prefix
 * `LATEST_SENSOR_SNAPSHOT [source=..., ...]: ...` so the model knows
 * which line carries the latest reading. When the model echoes that
 * token back into `suggested_change` / `reason`, the raw identifier
 * must NEVER reach the grower's screen.
 *
 * Pure / deterministic / display-only. No business-logic changes.
 */
export function sanitizeActionCopy(
  text: string | null | undefined,
): string {
  if (text == null) return "";
  const s = String(text);
  if (!s) return "";
  // Strip the optional `[source=..., stale=..., trust=...]` annotation
  // tail when it directly follows the token, then replace the token
  // itself with a calm human phrase. Collapse any double-spaces left
  // behind.
  return s
    .replace(
      /LATEST_SENSOR_SNAPSHOT\s*\[[^\]]*\]\s*:?/g,
      "the latest sensor snapshot",
    )
    .replace(/LATEST_SENSOR_SNAPSHOT/g, "the latest sensor snapshot")
    .replace(/ {2,}/g, " ")
    .trim();
}

type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending review",
  simulated: "Simulated",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function formatActionTypeLabel(actionType: string | null | undefined): string {
  const raw = (actionType ?? "").trim();
  if (!raw) return "Suggested action";
  return raw
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatRiskLabel(risk: string | null | undefined): string {
  if (!risk) return "Unknown risk";
  return RISK_LABEL[risk as RiskLevel] ?? "Unknown risk";
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pending review";
  return STATUS_LABEL[status] ?? "Pending review";
}

export interface ActionRowAriaInput {
  action_type: string | null | undefined;
  risk_level: string | null | undefined;
  status: string | null | undefined;
  source: string | null | undefined;
}

/**
 * Compact accessible description for an Action Queue row.
 *
 * Format: "<Risk>: <Action>. <Status>. Source: <Source>. Grower approval required."
 *
 * Never includes internal IDs, raw back-pointer tokens, or device fields.
 */
export function buildActionRowAriaLabel(input: ActionRowAriaInput): string {
  const risk = formatRiskLabel(input.risk_level);
  const action = formatActionTypeLabel(input.action_type);
  const status = formatStatusLabel(input.status);
  const source = getActionQueueSourceLabel({ source: input.source ?? "" });
  return `${risk}: ${action}. ${status}. Source: ${source}. Grower approval required.`;
}

/**
 * Transition kinds for status-control buttons. Mirrors
 * `TransitionKind` in actionQueueTransitions.ts but kept local so this
 * pure presentation helper has zero domain coupling.
 */
export type StatusControlKind =
  | "approve"
  | "reject"
  | "simulate"
  | "complete"
  | "cancel";

const STATUS_CONTROL_VERB: Record<StatusControlKind, string> = {
  approve: "Approve action",
  reject: "Reject action",
  simulate: "Simulate action",
  complete: "Mark action complete",
  cancel: "Cancel action",
};

export interface StatusControlAriaInput {
  action_type: string | null | undefined;
}

/**
 * Accessible name for a status-control button (Approve / Reject /
 * Simulate / Mark Complete / Cancel).
 *
 * Format: "<Verb>: <Action label>[. <Disabled reason>.]"
 *
 * NEVER includes: internal action/grow/tent/plant ids, raw
 * `[alert:<id>]` / `[session:<id>]` back-pointer tokens, free-text
 * `reason` content, or device-control fields. The safe summary is
 * built from `action_type` only via the shared formatter.
 */
export function buildActionButtonAriaLabel(
  kind: StatusControlKind,
  row: StatusControlAriaInput,
  opts?: { disabledReason?: string | null },
): string {
  const verb = STATUS_CONTROL_VERB[kind];
  const summary = formatActionTypeLabel(row.action_type);
  const base = `${verb}: ${summary}`;
  const reason = opts?.disabledReason?.trim();
  return reason ? `${base}. ${reason}` : base;
}

/**
 * Accessible name for the current-status badge on an action row /
 * action detail header. Format: "Current status: <Status label>".
 */
export function buildStatusBadgeAriaLabel(status: string | null | undefined): string {
  return `Current status: ${formatStatusLabel(status)}`;
}

/**
 * Safe grower-facing fallback for the optional `target_device` field on
 * an action queue row. The raw value can be a hardware identifier or an
 * internal enum (e.g. `fan_a`, `relay_2`) — never render it verbatim.
 *
 * Returns one of:
 *   - the metric label when `target_metric` is set (already grower-safe)
 *   - "Grow-room equipment" when a target_device is present
 *   - "Manual review target" when neither is set
 *
 * Pure, deterministic, null-safe.
 */
export function formatActionTargetLabel(
  target_metric: string | null | undefined,
  target_device: string | null | undefined,
): string {
  const metric = (target_metric ?? "").trim();
  if (metric) return metric;
  const device = (target_device ?? "").trim();
  if (device) return "Grow-room equipment";
  return "Manual review target";
}

/**
 * Single source of truth for the explicit "no automation" reassurance
 * line surfaced inside the approve confirmation dialog body. The header
 * already states "Verdant never sends commands to equipment"; this line
 * reinforces the same boundary at the decision moment.
 */
export const APPROVE_DIALOG_REASSURANCE =
  "Approving this records your decision. Verdant will not send equipment commands automatically.";

/**
 * Neutral copy rendered in place of the Manual Sensor Snapshot quality
 * chip on Action Queue surfaces when no sanitized snapshot evidence is
 * available in the row/detail view-model. Action Queue rows never claim
 * current-room support — this string is intentionally cautious.
 */
export const ACTION_EVIDENCE_QUALITY_NOT_AVAILABLE =
  "Evidence quality: not available from this action record";
