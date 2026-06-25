/**
 * aiDoctorProviderResponseMeasurementComposer — pure composition helper that
 * takes an existing `AiDoctorPromptMeasurement` plus an unknown provider
 * response, extracts the provider usage candidate, normalizes it through the
 * existing adapter, and returns a new measurement with
 * `providerReportedTokens` attached or cleared to `null`.
 *
 * Hard constraints (measurement-only):
 *  - Pure: no I/O, no Supabase, no fetch, no model calls, no React, no
 *    browser APIs, no persistence.
 *  - Does NOT mutate the input measurement.
 *  - Does NOT preserve any raw provider response fields (id, model, choices,
 *    headers, metadata, authorization, message content, etc.).
 *  - Does NOT enable budgets, thresholds, back-pressure, or alerts.
 *  - This is a composition boundary only; it is NOT wired into live AI Doctor
 *    provider calls. Live provider call-site wiring remains blocked.
 */

import { type AiDoctorPromptMeasurement } from "./costDomains";
import { extractProviderReportedUsageCandidate } from "./aiDoctorProviderResponseUsageExtractor";
import { attachProviderReportedUsageToAiDoctorPromptMeasurement } from "./aiDoctorProviderUsageMeasurementAdapter";

export { type AiDoctorPromptMeasurement } from "./costDomains";

/**
 * Compose a new `AiDoctorPromptMeasurement` with `providerReportedTokens`
 * derived from an unknown provider response.
 *
 * - Extracts the usage candidate via
 *   `extractProviderReportedUsageCandidate(providerResponse)`.
 * - Normalizes and attaches via
 *   `attachProviderReportedUsageToAiDoctorPromptMeasurement(measurement, candidate)`.
 * - If extraction yields `null`, the adapter is still called with `null` so
 *   the result has `providerReportedTokens: null`.
 * - All other measurement fields are preserved exactly.
 *
 * @param measurement - Existing AI Doctor prompt measurement (not mutated).
 * @param providerResponse - Unknown provider response (e.g. OpenAI-compatible).
 * @returns A new measurement with `providerReportedTokens` set or `null`.
 */
export function attachProviderResponseUsageToAiDoctorPromptMeasurement(
  measurement: AiDoctorPromptMeasurement,
  providerResponse: unknown,
): AiDoctorPromptMeasurement {
  const candidate = extractProviderReportedUsageCandidate(providerResponse);
  return attachProviderReportedUsageToAiDoctorPromptMeasurement(
    measurement,
    candidate,
  );
}
