/**
 * alertActionQueueEvidenceViewModel — presenter-safe evidence copy for the
 * Alert → Action Queue handoff.
 *
 * This does not create queue rows. It explains why an eligible alert-generated
 * action is review-only, approval-required, and non-executable.
 */
import {
  buildActionQueueDraftFromAlert,
  isAlertEligibleForActionQueue,
  type AlertLike,
  type ActionQueueDraft,
} from "@/lib/alertToActionQueueRules";

export interface AlertActionQueueEvidenceViewModel {
  eligible: boolean;
  statusLabel: string;
  summary: string;
  actionPreview: string | null;
  evidenceItems: readonly string[];
  safetyItems: readonly string[];
  blockedReason: string | null;
  duplicateKey: string | null;
  draft: ActionQueueDraft | null;
}

const DEFAULT_SAFETY_ITEMS = Object.freeze([
  "Approval required before any grow action is taken.",
  "No equipment command is included.",
  "No nutrient, irrigation, or irreversible change is suggested from this alert alone.",
  "Grower can approve, reject, or complete the item manually.",
]);

function humanMetric(metric: string | null | undefined): string {
  const normalized = `${metric ?? ""}`.trim();
  if (!normalized) return "unknown metric";
  if (normalized === "humidity_pct") return "humidity";
  if (normalized === "temperature_c") return "temperature";
  if (normalized === "vpd_kpa") return "VPD";
  if (normalized === "co2_ppm") return "CO₂";
  if (normalized === "soil_moisture_pct") return "soil moisture";
  return normalized.replace(/_/g, " ");
}

export function buildAlertActionQueueEvidenceViewModel(
  alert: AlertLike | null | undefined,
): AlertActionQueueEvidenceViewModel {
  if (!alert) {
    return {
      eligible: false,
      statusLabel: "Not eligible",
      summary: "No alert was provided.",
      actionPreview: null,
      evidenceItems: [],
      safetyItems: DEFAULT_SAFETY_ITEMS,
      blockedReason: "missing_alert",
      duplicateKey: null,
      draft: null,
    };
  }

  const draftResult = buildActionQueueDraftFromAlert(alert);
  if (!isAlertEligibleForActionQueue(alert) || !draftResult.ok) {
    const reason = draftResult.ok ? "not_eligible" : draftResult.reason;
    return {
      eligible: false,
      statusLabel: "Not eligible",
      summary:
        alert.status === "open"
          ? "This alert does not have enough safe context to create an Action Queue suggestion."
          : "Only open alerts can be sent to the Action Queue.",
      actionPreview: null,
      evidenceItems: [
        `Alert status: ${alert.status}`,
        `Metric: ${humanMetric(alert.metric)}`,
        alert.reason?.trim() ? `Reason: ${alert.reason.trim()}` : "Reason: missing",
      ],
      safetyItems: DEFAULT_SAFETY_ITEMS,
      blockedReason: reason,
      duplicateKey: null,
      draft: null,
    };
  }

  const { draft } = draftResult;
  const duplicateKey = `${draft.source}:${draft.grow_id}:${draft.alert_back_pointer}`;

  return {
    eligible: true,
    statusLabel: "Ready for grower review",
    summary:
      "This alert can create a suggested Action Queue item. The item is advisory and approval-required.",
    actionPreview: draft.suggested_change,
    evidenceItems: [
      `Alert: ${alert.title?.trim() || humanMetric(alert.metric)}`,
      `Metric: ${humanMetric(alert.metric)}`,
      `Reason: ${alert.reason.trim()}`,
      `Risk: ${draft.risk_level}`,
      `Back-pointer: ${draft.alert_back_pointer}`,
    ],
    safetyItems: DEFAULT_SAFETY_ITEMS,
    blockedReason: null,
    duplicateKey,
    draft,
  };
}
