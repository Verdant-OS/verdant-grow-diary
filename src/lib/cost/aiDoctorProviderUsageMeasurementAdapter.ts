/**
 * aiDoctorProviderUsageMeasurementAdapter — pure adapter boundary that
 * attaches provider-reported token usage to an existing AI Doctor prompt
 * measurement after a model call.
 *
 * Hard constraints (measurement-only):
 *  - Pure: no I/O, no Supabase, no fetch, no model calls, no React, no
 *    browser APIs.
 *  - Does NOT change AI Doctor output or prompt content.
 *  - Does NOT persist anything.
 *  - Does NOT mutate the input measurement.
 *  - Does NOT clamp, derive, or invent token values.
 *  - Delegates normalization to `normalizeProviderReportedTokenUsage`.
 *  - If provider usage is invalid, returns a copy with `providerReportedTokens`
 *    set to `null`.
 *  - This is an attachment boundary only; it is not wired into live AI Doctor
 *    calls yet.
 */

import { type AiDoctorPromptMeasurement } from "./costDomains";
import { normalizeProviderReportedTokenUsage } from "./aiDoctorProviderUsageRules";

export {
  type AiDoctorPromptMeasurement,
} from "./costDomains";

/**
 * Attaches a provider-reported token usage object to an existing
 * `AiDoctorPromptMeasurement`.
 *
 * @param measurement - An existing AI Doctor prompt measurement. Must not be
 *   mutated.
 * @param providerUsage - An unknown provider usage object (e.g. from an
 *   OpenAI-compatible response). Normalized safely before attachment.
 * @returns A new `AiDoctorPromptMeasurement` with `providerReportedTokens`
 *   populated if the usage was valid, or `null` if it was rejected.
 */
export function attachProviderReportedUsageToAiDoctorPromptMeasurement(
  measurement: AiDoctorPromptMeasurement,
  providerUsage: unknown,
): AiDoctorPromptMeasurement {
  const normalized = normalizeProviderReportedTokenUsage(providerUsage);

  return {
    ...measurement,
    providerReportedTokens: normalized,
  };
}
