/**
 * GA4 measurement ID resolution.
 *
 * Source of truth is the linked Lovable Google Analytics connector, exposed to
 * client builds as VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY. The literal
 * below is a fallback only: it keeps local dev, CI, and prerender working when
 * the connector env var is absent, and it is the id the property shipped with.
 *
 * A malformed connector value is rejected rather than propagated — sending hits
 * to a bogus id would silently dark the property with no error surface.
 */
export const GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK = "G-MCXQ9GVS5H";

/** GA4 measurement ids are `G-` followed by 10 uppercase alphanumerics. */
export const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{10}$/;

/** Pure resolver — exported so tests can exercise it without env mutation. */
export function resolveGoogleAnalyticsMeasurementId(raw: unknown): string {
  if (typeof raw !== "string") return GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK;
  const trimmed = raw.trim();
  if (!GA4_MEASUREMENT_ID_PATTERN.test(trimmed)) {
    return GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK;
  }
  return trimmed;
}

export const GOOGLE_ANALYTICS_MEASUREMENT_ID = resolveGoogleAnalyticsMeasurementId(
  import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"],
);
