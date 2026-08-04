import {
  GA4_MEASUREMENT_ID_PATTERN,
  GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
} from "../../src/constants/analytics";

/**
 * Playwright specs must not pin a literal measurement id: the value now comes
 * from the linked Lovable Google Analytics connector. Resolve it the same way
 * the app does so a connector change updates the gates automatically instead
 * of turning them red.
 */
export function resolveExpectedMeasurementId(): string {
  const raw = process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"];
  if (typeof raw === "string" && GA4_MEASUREMENT_ID_PATTERN.test(raw.trim())) {
    return raw.trim();
  }
  return GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK;
}

export const EXPECTED_MEASUREMENT_ID = resolveExpectedMeasurementId();
