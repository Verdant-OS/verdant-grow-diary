/**
 * Privacy rules for analytics page locations.
 *
 * Analytics receives route shape only. Query strings and hashes may contain
 * grower-entered search text, attribution payloads, email addresses, reset
 * tokens, or row identifiers, so they are always discarded rather than
 * partially sanitized.
 */

const UUID_SEGMENT_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_TOKEN_SEGMENT_RE = /\/[a-zA-Z0-9_-]{20,}/g;

function pathnameOnly(input: string): string {
  const queryIndex = input.indexOf("?");
  const hashIndex = input.indexOf("#");
  const boundary = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), input.length);
  const pathname = input.slice(0, boundary);
  return pathname.startsWith("/") && pathname.length > 0 ? pathname : "/";
}

/** Returns only a de-identified pathname. Never returns a query or hash. */
export function sanitizePagePath(input: string): string {
  return pathnameOnly(input)
    .replace(UUID_SEGMENT_RE, "/:id")
    .replace(LONG_TOKEN_SEGMENT_RE, "/:id");
}

/**
 * Builds an explicit GA page_location so the browser's raw URL is never used
 * as a fallback. Non-http origins fail closed to the sanitized pathname.
 */
export function buildSafeAnalyticsPageLocation(origin: string, input: string): string {
  const safePath = sanitizePagePath(input);
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
      return safePath;
    }
    return `${parsedOrigin.origin}${safePath}`;
  } catch {
    return safePath;
  }
}
