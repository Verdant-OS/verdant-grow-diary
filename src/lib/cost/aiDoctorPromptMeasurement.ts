/**
 * aiDoctorPromptMeasurement — pure helper that builds an
 * `AiDoctorPromptMeasurement` from already-compiled AI Doctor context and/or
 * the assembled prompt messages.
 *
 * Hard constraints (measurement-only):
 *  - Pure: no I/O, no Supabase, no fetch, no model calls, no React.
 *  - Does NOT change AI Doctor output.
 *  - Does NOT change prompt text.
 *  - Does NOT persist anything.
 *  - Does NOT invent token constants. If no estimator exists,
 *    `estimatedPromptTokens` stays `null`.
 *  - Belongs to the llm_prompt cost domain only. DB-refresh fields are
 *    rejected at construction time by `asAiDoctorPromptMeasurement`.
 */

import {
  asAiDoctorPromptMeasurement,
  type AiDoctorPromptMeasurement,
  type RawHistoryFallbackState,
} from "./costDomains";
import {
  estimatePromptTokensIfAvailable,
  type PromptTokenEstimator,
} from "./promptTokenEstimator";


/** Optional provider-reported token usage shape (already-available only). */
export interface ProviderReportedTokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/**
 * Input for the measurement builder. All fields are optional; the builder is
 * additive and never throws on missing context.
 */
export interface BuildAiDoctorPromptMeasurementInput {
  /** Logical prompt name, e.g. "ai_doctor_review". */
  readonly promptName: string;
  /** ISO-8601 timestamp the measurement is recorded at. Required for determinism. */
  readonly recordedAt: string;
  /**
   * The assembled user-prompt text (or any text body fed to the model).
   * Used to compute byte size and char count. Optional; defaults to "".
   */
  readonly userPromptText?: string;
  /** True when the prompt fragment includes the imported-history block. */
  readonly importedHistoryBlockPresent?: boolean;
  /** True when the prompt fragment includes the missing-live-readings block. */
  readonly missingLiveReadingsBlockPresent?: boolean;
  /** Number of imported-history events injected, if known. */
  readonly rawHistoryEventCount?: number;
  /** True when a stored summary was present but stale (older than caller's freshness rule). */
  readonly staleSummaryUsed?: boolean;
  /** True when no summary was available at all. */
  readonly missingSummaryUsed?: boolean;
  /** True when summary retrieval errored. */
  readonly summaryErrored?: boolean;
  /** Window labels included in the compiled context (e.g. "5m", "1h", "24h"). */
  readonly includedWindows?: readonly string[];
  /** Sensor source tags represented in the context (e.g. "live", "csv"). */
  readonly sourceTags?: readonly string[];
  /** Provider-reported token usage if already available. */
  readonly providerReportedTokens?: ProviderReportedTokenUsage | null;
  /** Status; defaults to "success" for measurement attachment. */
  readonly status?: "success" | "error";
  readonly errorCode?: string;
  /** Optional injected estimator. When omitted, the active singleton is used; if neither exists, tokens stay null. */
  readonly tokenEstimator?: PromptTokenEstimator | null;
}


/** Metadata kept beside the strict measurement (not part of llm_prompt schema). */
export interface AiDoctorPromptMeasurementMetadata {
  readonly charCount: number;
  readonly rawHistoryEventCount: number;
  readonly staleSummaryUsed: boolean;
  readonly missingSummaryUsed: boolean;
  readonly summaryErrored: boolean;
  readonly includedWindows: readonly string[];
  readonly sourceTags: readonly string[];
}

export interface AiDoctorPromptMeasurementBundle {
  readonly measurement: AiDoctorPromptMeasurement;
  readonly metadata: AiDoctorPromptMeasurementMetadata;
}

const SUMMARY_FRESH: RawHistoryFallbackState = "summary_fresh";

/**
 * Classifies the raw-history fallback state. Precedence:
 *   summary_error > summary_missing > summary_stale > summary_fresh.
 *
 * Note: presence of an imported-history block OR missing-live-readings block
 * is treated as a missing-summary signal, because the AI Doctor only injects
 * those when fresh live evidence is absent.
 */
export function classifyRawHistoryFallback(input: {
  readonly summaryErrored?: boolean;
  readonly missingSummaryUsed?: boolean;
  readonly staleSummaryUsed?: boolean;
  readonly importedHistoryBlockPresent?: boolean;
  readonly missingLiveReadingsBlockPresent?: boolean;
}): RawHistoryFallbackState {
  if (input.summaryErrored === true) return "summary_error";
  if (
    input.missingSummaryUsed === true ||
    input.importedHistoryBlockPresent === true ||
    input.missingLiveReadingsBlockPresent === true
  ) {
    return "summary_missing";
  }
  if (input.staleSummaryUsed === true) return "summary_stale";
  return SUMMARY_FRESH;
}

/**
 * Computes UTF-8 byte size of a string deterministically.
 * Uses TextEncoder when available; falls back to a Buffer length when not.
 */
export function computeUtf8ByteSize(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  // Defensive fallback; pure char-count is not the same as byte count.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B = (globalThis as any).Buffer;
  if (B && typeof B.byteLength === "function") {
    return B.byteLength(text, "utf8") as number;
  }
  return text.length;
}

/**
 * Build a measurement bundle from compiled context + optional flags. Pure.
 * The returned `measurement` is validated to contain NO db_refresh fields.
 */
export function buildAiDoctorPromptMeasurement(
  input: BuildAiDoctorPromptMeasurementInput,
): AiDoctorPromptMeasurementBundle {
  const text = input.userPromptText ?? "";
  const summaryByteSize = computeUtf8ByteSize(text);
  const charCount = text.length;

  const rawHistoryFallback = classifyRawHistoryFallback({
    summaryErrored: input.summaryErrored,
    missingSummaryUsed: input.missingSummaryUsed,
    staleSummaryUsed: input.staleSummaryUsed,
    importedHistoryBlockPresent: input.importedHistoryBlockPresent,
    missingLiveReadingsBlockPresent: input.missingLiveReadingsBlockPresent,
  });

  const estimatedPromptTokens =
    input.tokenEstimator === null
      ? null
      : estimatePromptTokensIfAvailable(text, input.tokenEstimator ?? undefined);

  const measurement = asAiDoctorPromptMeasurement({
    domain: "llm_prompt",
    promptName: input.promptName,
    summaryByteSize,
    estimatedPromptTokens,
    providerReportedTokens: input.providerReportedTokens ?? null,
    rawHistoryFallback,
    status: input.status ?? "success",
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    recordedAt: input.recordedAt,
  });


  const metadata: AiDoctorPromptMeasurementMetadata = {
    charCount,
    rawHistoryEventCount: Math.max(0, input.rawHistoryEventCount ?? 0),
    staleSummaryUsed: input.staleSummaryUsed === true,
    missingSummaryUsed: input.missingSummaryUsed === true,
    summaryErrored: input.summaryErrored === true,
    includedWindows: Object.freeze([...(input.includedWindows ?? [])]),
    sourceTags: Object.freeze([...(input.sourceTags ?? [])]),
  };

  return { measurement, metadata };
}
