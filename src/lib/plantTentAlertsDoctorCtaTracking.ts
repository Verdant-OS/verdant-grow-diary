/**
 * plantTentAlertsDoctorCtaTracking — non-invasive client-side tracking
 * helper for the "Ask AI Doctor" row action on the assigned-tent alerts
 * panel.
 *
 * Dispatches a single browser CustomEvent. Makes no network requests of
 * any kind, does NOT write to Supabase, does NOT call AI/model endpoints,
 * and performs no navigation itself. Tracking failures are swallowed so
 * the navigation handoff is never blocked.
 *
 * Safe event detail intentionally omits private/internal ids
 * (alert / plant / tent / grow ids) and surfaces only:
 *   - severity bucket (already displayed on the row)
 *   - metric name when present (e.g. "temp", "vpd" — not an id)
 */

export const TENT_ALERTS_DOCTOR_CTA_EVENT = "verdant:tent-alerts-doctor-cta" as const;

export interface TentAlertsDoctorCtaDetail {
  severity: string;
  metric: string | null;
}

export function trackTentAlertsDoctorCta(detail: TentAlertsDoctorCtaDetail): void {
  if (typeof window === "undefined") return;
  try {
    const safeMetric =
      typeof detail.metric === "string" && detail.metric.trim().length > 0
        ? detail.metric.trim()
        : null;
    window.dispatchEvent(
      new CustomEvent(TENT_ALERTS_DOCTOR_CTA_EVENT, {
        detail: {
          severity: detail.severity,
          metric: safeMetric,
        },
      }),
    );
  } catch {
    /* swallow — tracking must never block navigation */
  }
}
