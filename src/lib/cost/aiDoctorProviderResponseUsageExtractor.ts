/**
 * Pure extractor that locates a provider-reported token usage candidate
 * inside common OpenAI-compatible AI response shapes.
 *
 * Returns ONLY the candidate usage object (still `unknown`). Normalization
 * is the responsibility of `normalizeProviderReportedTokenUsage`.
 *
 * Safety:
 * - Does not preserve, return, or reference the raw response object.
 * - Does not return ids, model names, headers, choices, or metadata.
 * - Returns `null` for missing/malformed/ambiguous shapes.
 * - Pure logic. No I/O, no persistence, no model calls.
 */

const USAGE_KEYS_SNAKE = ["prompt_tokens", "completion_tokens", "total_tokens"] as const;
const USAGE_KEYS_CAMEL = ["promptTokens", "completionTokens", "totalTokens"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return true;
}

function looksLikeUsageObject(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const hasSnake = USAGE_KEYS_SNAKE.some((k) => k in value);
  const hasCamel = USAGE_KEYS_CAMEL.some((k) => k in value);
  return hasSnake || hasCamel;
}

/**
 * Extract a provider-reported usage candidate from common shapes:
 *   { usage: { ... } }
 *   { response: { usage: { ... } } }
 *   { data:     { usage: { ... } } }
 *
 * Returns a fresh shallow copy of the usage object so the raw response
 * reference is not leaked. Returns `null` for any other shape.
 */
export function extractProviderReportedUsageCandidate(
  providerResponse: unknown,
): unknown | null {
  if (!isPlainObject(providerResponse)) return null;

  const directUsage = (providerResponse as Record<string, unknown>).usage;
  if (looksLikeUsageObject(directUsage)) {
    return { ...(directUsage as Record<string, unknown>) };
  }

  const responseEnvelope = (providerResponse as Record<string, unknown>).response;
  if (isPlainObject(responseEnvelope)) {
    const nested = responseEnvelope.usage;
    if (looksLikeUsageObject(nested)) {
      return { ...(nested as Record<string, unknown>) };
    }
  }

  const dataEnvelope = (providerResponse as Record<string, unknown>).data;
  if (isPlainObject(dataEnvelope)) {
    const nested = dataEnvelope.usage;
    if (looksLikeUsageObject(nested)) {
      return { ...(nested as Record<string, unknown>) };
    }
  }

  return null;
}
