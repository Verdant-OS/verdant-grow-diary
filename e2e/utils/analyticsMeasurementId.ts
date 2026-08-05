/**
 * Playwright specs must not pin a literal measurement id: the value now comes
 * from the linked Lovable Google Analytics connector. Resolve it the same way
 * the app does so a connector change updates the gates automatically instead
 * of turning them red.
 *
 * The fallback/pattern are duplicated here rather than imported from
 * src/constants/analytics.ts because that module reads `import.meta.env`, which
 * is not available in Playwright's Node transform. Parity is enforced by
 * src/test/google-analytics-measurement-id-e2e-parity.test.ts.
 */
export const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{10}$/;
export const MEASUREMENT_ID_FALLBACK = "G-MCXQ9GVS5H";

export function resolveExpectedMeasurementId(): string {
  const raw = process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"];
  if (typeof raw === "string" && GA4_MEASUREMENT_ID_PATTERN.test(raw.trim())) {
    return raw.trim();
  }
  return MEASUREMENT_ID_FALLBACK;
}

export const EXPECTED_MEASUREMENT_ID = resolveExpectedMeasurementId();
