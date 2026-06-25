/**
 * aiDoctorProviderUsageRules — pure normalizer for provider-reported token usage.
 *
 * Converts OpenAI-compatible (and common camelCase) usage objects into the
 * canonical Verdant `ProviderReportedTokenUsage` shape.
 *
 * Hard constraints:
 *  - Pure: no I/O, no logging, no mutation.
 *  - Clamp nothing silently — bad data returns `null`.
 *  - Never derives partial totals from missing fields.
 *  - Preserves provider-reported totals even when prompt + completion differ.
 *  - Does not export raw responses, headers, request IDs, or secrets.
 */

import { type ProviderReportedTokenUsage } from "./aiDoctorPromptMeasurement";

export { type ProviderReportedTokenUsage };

/**
 * Safely converts an unknown provider usage object into a canonical
 * `ProviderReportedTokenUsage`.
 *
 * Supported input shapes:
 *   - OpenAI snake_case: `{ prompt_tokens, completion_tokens, total_tokens }`
 *   - Common camelCase:  `{ promptTokens, completionTokens, totalTokens }`
 *
 * Returns `null` when:
 *   - input is null, undefined, or not an object
 *   - prompt or completion values are missing, non-number, NaN, Infinity, or negative
 *   - total is present but any value is invalid
 */
export function normalizeProviderReportedTokenUsage(
  input: unknown,
): ProviderReportedTokenUsage | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return null;

  const obj = input as Record<string, unknown>;

  const prompt = readValidTokenCount(obj, "prompt_tokens", "promptTokens");
  const completion = readValidTokenCount(obj, "completion_tokens", "completionTokens");
  const total = readValidTokenCount(obj, "total_tokens", "totalTokens");

  if (prompt === null || completion === null) {
    // Untrustworthy: missing core fields
    return null;
  }

  if (total === null) {
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: prompt + completion,
    };
  }

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

function readValidTokenCount(
  obj: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): number | null {
  let raw = obj[snakeKey];
  if (raw === undefined) {
    raw = obj[camelKey];
  }
  if (raw === undefined) return null;
  if (typeof raw !== "number") return null;
  if (!Number.isFinite(raw)) return null;
  if (Number.isNaN(raw)) return null;
  if (raw < 0) return null;
  // Token counts are integers; reject fractional values
  if (!Number.isInteger(raw)) return null;
  return raw;
}
