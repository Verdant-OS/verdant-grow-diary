/**
 * plantTentAlertsDoctorCtaTracking — non-invasive client-side tracking
 * helper for the "Ask AI Doctor" row action on the assigned-tent alerts
 * panel.
 *
 * Dispatches the existing browser CustomEvent and routes the same click
 * intent through Verdant's privacy-safe funnel sink. It does NOT write to
 * Supabase, call AI/model endpoints, or perform navigation itself. Tracking
 * failures are swallowed so the navigation handoff is never blocked.
 *
 * Safe event detail intentionally omits private/internal ids
 * (alert / plant / tent / grow ids) and surfaces only:
 *   - severity bucket (already displayed on the row)
 *   - metric name when present (e.g. "temp", "vpd" — not an id)
 */

import type { AlertSeverityRow } from "@/lib/alerts";
import { METRIC_LABELS, type MetricKey } from "@/lib/environmentTargetComparison";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

export const TENT_ALERTS_DOCTOR_CTA_EVENT = "verdant:tent-alerts-doctor-cta" as const;

export interface TentAlertsDoctorCtaDetail {
  severity: string;
  metric: string | null;
}

const ALERT_SEVERITIES: ReadonlySet<string> = new Set<AlertSeverityRow>([
  "critical",
  "warning",
  "watch",
  "info",
]);

function normalizeMetric(metric: string | null): MetricKey | undefined {
  if (typeof metric !== "string") return undefined;
  const normalized = metric.trim();
  return Object.prototype.hasOwnProperty.call(METRIC_LABELS, normalized)
    ? (normalized as MetricKey)
    : undefined;
}

function normalizeSeverity(severity: string): AlertSeverityRow | undefined {
  return ALERT_SEVERITIES.has(severity) ? (severity as AlertSeverityRow) : undefined;
}

export function trackTentAlertsDoctorCta(detail: TentAlertsDoctorCtaDetail): void {
  if (typeof window === "undefined") return;
  const safeMetric = normalizeMetric(detail.metric);
  const safeSeverity = normalizeSeverity(detail.severity);
  try {
    trackFunnelEvent("ai_doctor_cta_clicked", {
      surface: "tent_alert_row",
      metric: safeMetric,
      severity: safeSeverity,
    });
  } catch {
    /* swallow — tracking must never block navigation */
  }
  try {
    const customEventMetric =
      typeof detail.metric === "string" && detail.metric.trim().length > 0
        ? detail.metric.trim()
        : null;
    window.dispatchEvent(
      new CustomEvent(TENT_ALERTS_DOCTOR_CTA_EVENT, {
        detail: {
          severity: detail.severity,
          metric: customEventMetric,
        },
      }),
    );
  } catch {
    /* swallow — tracking must never block navigation */
  }
}
