/**
 * alertToActionQueueRules — pure, deterministic mapping from a persisted
 * environment alert into a suggested Action Queue draft.
 *
 * Safety constraints:
 *   - No device commands. Output is review-first advisory text only.
 *   - No nutrient changes derived from environment alerts.
 *   - No user_id in draft (DB default auth.uid() owns the row).
 *   - No external control strings.
 *   - Status always "pending_approval"; source always "environment_alert".
 *
 * This module is UI-free. Components should call these helpers and render
 * the result; mapping tables MUST NOT be duplicated in JSX.
 */

export type AlertSeverity = "info" | "watch" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "dismissed";
export type ActionRisk = "low" | "medium" | "high" | "critical";

export interface AlertLike {
  id: string;
  grow_id: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  status: AlertStatus;
  severity: AlertSeverity;
  metric: string | null;
  reason: string;
  title?: string | null;
  source?: string | null;
}

export interface ActionQueueDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  action_type: "advisory";
  target_metric: string;
  suggested_change: string;
  reason: string;
  risk_level: ActionRisk;
  source: "environment_alert";
  status: "pending_approval";
  /** Stable back-pointer token included in `reason` for auditability/idempotency. */
  alert_back_pointer: string;
  /** Human note for the matching action_queue_events insert. */
  audit_note: string;
}

export type DraftResult =
  | { ok: true; draft: ActionQueueDraft }
  | { ok: false; reason: string };

const SEVERITY_TO_RISK: Record<AlertSeverity, ActionRisk> = {
  info: "low",
  watch: "medium",
  warning: "high",
  critical: "critical",
};

/**
 * Conservative review-first recommendation text.
 * Never returns an executable device command.
 */
export function recommendedActionForAlert(alert: AlertLike): string {
  const metric = (alert.metric ?? "").toLowerCase();
  const reason = (alert.reason ?? "").toLowerCase();
  const isHigh = /\bhigh\b|\babove\b|\bover\b|too high/.test(reason);
  const isLow = /\blow\b|\bbelow\b|\bunder\b|too low/.test(reason);

  if (metric.includes("humid") || metric === "rh" || metric === "humidity_pct") {
    if (isLow) return "Review humidification and avoid large humidity swings.";
    return "Review humidity control and increase airflow or dehumidification gradually.";
  }
  if (metric.includes("temp")) {
    if (isLow) return "Review heater/environment settings and raise temperature gradually.";
    return "Review heat load, exhaust, and light intensity before making changes.";
  }
  if (metric.includes("vpd")) {
    if (isLow) return "Review RH and airflow to reduce overly humid conditions.";
    return "Review RH and temperature balance before changing irrigation or feed.";
  }
  if (metric.includes("co2")) {
    return "Review CO2 supplementation and ventilation before adjusting.";
  }
  if (metric.includes("soil") || metric.includes("moisture")) {
    return "Review substrate moisture and irrigation timing before adjusting.";
  }
  return "Review environment conditions before making any grow changes.";
}

/** Synthetic "data unavailable" markers — never eligible for handoff. */
const SYNTHETIC_METRICS = new Set<string>(["snapshot", "targets"]);
const SYNTHETIC_ALERT_IDS = new Set<string>([
  "snapshot:unavailable",
  "snapshot:stale",
  "targets:missing",
]);

/** Deterministic eligibility check. Pure, null-safe. */
export function isAlertEligibleForActionQueue(alert: AlertLike | null | undefined): boolean {
  if (!alert) return false;
  if (alert.status !== "open") return false;
  if (!alert.grow_id) return false;
  if (!alert.id) return false;
  if (!alert.reason || !alert.reason.trim()) return false;
  if (!alert.metric || !alert.metric.trim()) return false;
  if (SYNTHETIC_ALERT_IDS.has(alert.id)) return false;
  if (SYNTHETIC_METRICS.has(alert.metric.trim().toLowerCase())) return false;
  return true;
}

export function buildActionQueueDraftFromAlert(alert: AlertLike): DraftResult {
  if (!alert) return { ok: false, reason: "missing_alert" };
  if (alert.status !== "open") return { ok: false, reason: "alert_not_open" };
  if (!alert.grow_id) return { ok: false, reason: "missing_grow_id" };
  if (!alert.id) return { ok: false, reason: "missing_alert_id" };
  if (!alert.reason || !alert.reason.trim()) return { ok: false, reason: "missing_reason" };
  if (!alert.metric || !alert.metric.trim()) return { ok: false, reason: "missing_metric" };
  if (SYNTHETIC_ALERT_IDS.has(alert.id)) return { ok: false, reason: "synthetic_alert" };
  if (SYNTHETIC_METRICS.has(alert.metric.trim().toLowerCase())) {
    return { ok: false, reason: "synthetic_metric" };
  }


  const backPointer = `[alert:${alert.id}]`;
  const suggested = recommendedActionForAlert(alert);
  const reasonText = `${alert.reason.trim()} ${backPointer}`;

  return {
    ok: true,
    draft: {
      grow_id: alert.grow_id,
      tent_id: alert.tent_id ?? null,
      plant_id: alert.plant_id ?? null,
      action_type: "advisory",
      target_metric: alert.metric.trim(),
      suggested_change: suggested,
      reason: reasonText,
      risk_level: SEVERITY_TO_RISK[alert.severity] ?? "low",
      source: "environment_alert",
      status: "pending_approval",
      alert_back_pointer: backPointer,
      audit_note: `Created from persisted alert ${alert.id}`,
    },
  };
}

/** Deterministic matcher for idempotency checks against existing rows. */
export function actionMatchesAlert(
  row: {
    source: string | null;
    status: string | null;
    reason: string | null;
    grow_id: string | null;
  },
  alert: Pick<AlertLike, "id" | "grow_id">,
): boolean {
  if (!row || !alert) return false;
  if (row.source !== "environment_alert") return false;
  if (row.grow_id !== alert.grow_id) return false;
  const openish = row.status === "pending_approval" || row.status === "approved";
  if (!openish) return false;
  return !!row.reason && row.reason.includes(`[alert:${alert.id}]`);
}
