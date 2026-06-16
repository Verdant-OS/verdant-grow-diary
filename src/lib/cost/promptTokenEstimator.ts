/**
 * promptTokenEstimator — optional adapter for prompt-token estimation.
 *
 * Verdant does NOT ship a tokenizer today. This module exists so callers can
 * inject an estimator later without scattering "tokens?: number | null"
 * decisions across the codebase.
 *
 * Hard rules:
 *  - No hardcoded token-per-character constants used as truth.
 *  - No MAX_/THRESHOLD_/TOKEN_LIMIT/budget constants.
 *  - No prompt mutation, no model call, no persistence.
 *  - When no estimator is provided, return `null` — never a guess.
 */

export interface PromptTokenEstimator {
  /** Returns a non-negative integer token estimate, or null if unsupported. */
  readonly estimate: (text: string) => number | null;
  /** Free-form label, e.g. "tiktoken-cl100k_base@1.0.0". Diagnostics-only. */
  readonly label?: string;
}

let activeEstimator: PromptTokenEstimator | null = null;

/**
 * Inject an estimator (test or runtime). Pass `null` to clear.
 * Returns the previous estimator for restore patterns.
 */
export function setPromptTokenEstimator(
  estimator: PromptTokenEstimator | null,
): PromptTokenEstimator | null {
  const prev = activeEstimator;
  activeEstimator = estimator;
  return prev;
}

export function getPromptTokenEstimator(): PromptTokenEstimator | null {
  return activeEstimator;
}

/**
 * Estimate prompt tokens if an estimator is available. Otherwise return
 * `null`. Never falls back to a character-count heuristic.
 */
export function estimatePromptTokensIfAvailable(
  text: string,
  estimator: PromptTokenEstimator | null = activeEstimator,
): number | null {
  if (!estimator) return null;
  const n = estimator.estimate(text);
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}
