/**
 * Verdant cost library public entrypoint.
 *
 * Minimal, intentional surface: stable measurement types, the AI Doctor
 * prompt measurement builder, and the provider-response measurement composer.
 *
 * Hard constraints (measurement-only):
 *  - Pure: no I/O, no Supabase, no fetch, no model calls, no React, no
 *    browser APIs, no timers.
 *  - No persistence wiring is exported here.
 *  - No raw extractor/normalizer helpers are re-exported — those remain
 *    internal building blocks behind the composer boundary.
 *  - No budgets, thresholds, back-pressure, alerts, or device control.
 */

export {
  type AiDoctorPromptMeasurement,
  type WindowRefreshMeasurement,
  type IngestRateMeasurement,
  type RawHistoryFallbackState,
  type MeasurementStatus,
  type CostDomain,
} from "./costDomains";

export {
  buildAiDoctorPromptMeasurement,
  classifyRawHistoryFallback,
  type AiDoctorPromptMeasurementBundle,
  type AiDoctorPromptMeasurementMetadata,
  type BuildAiDoctorPromptMeasurementInput,
  type ProviderReportedTokenUsage,
} from "./aiDoctorPromptMeasurement";

export { attachProviderResponseUsageToAiDoctorPromptMeasurement } from "./aiDoctorProviderResponseMeasurementComposer";
