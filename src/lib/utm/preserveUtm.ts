/**
 * preserveUtm — pure helper for forwarding safe UTM params to external CTAs.
 *
 * Only these keys are ever forwarded (allow-list, not deny-list):
 *   utm_source, utm_medium, utm_campaign, utm_content, utm_term
 *
 * Safety invariants:
 *  - Only http(s) target URLs are accepted; anything else returns null.
 *  - Only the allow-listed keys are copied; nothing else leaks (no session
 *    tokens, no ids, no PII, no arbitrary query strings).
 *  - Each value is length-capped (256 chars) and count-capped to the 5
 *    allow-listed keys — cannot balloon a target URL.
 *  - Target URL's own query params win when there's a collision.
 *  - Deterministic (stable output ordering) so tests are simple.
 *  - No React, no Supabase, no fetch, no time reads.
 */

export const SAFE_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type SafeUtmKey = (typeof SAFE_UTM_KEYS)[number];

const MAX_VALUE_LENGTH = 256;

function isSafeUtmKey(key: string): key is SafeUtmKey {
  return (SAFE_UTM_KEYS as ReadonlyArray<string>).includes(key);
}

/**
 * Pick the allow-listed UTM params out of an arbitrary query string.
 * Anything else in the query is dropped.
 */
export function pickSafeUtmParams(search: string | null | undefined): Record<SafeUtmKey, string> {
  const out = {} as Record<SafeUtmKey, string>;
  if (!search) return out;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return out;
  }
  for (const key of SAFE_UTM_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const value = raw.slice(0, MAX_VALUE_LENGTH);
    if (value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Append safe UTM params from `search` onto `targetUrl`.
 * Returns null if `targetUrl` is not an absolute http(s) URL.
 * Target URL's own params take precedence over incoming UTMs.
 */
export function preserveUtmOnUrl(
  targetUrl: string,
  search: string | null | undefined,
): string | null {
  if (typeof targetUrl !== "string" || targetUrl.length === 0) return null;
  if (!/^https?:\/\//i.test(targetUrl)) return null;

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return null;
  }

  const incoming = pickSafeUtmParams(search);
  for (const key of SAFE_UTM_KEYS) {
    const value = incoming[key];
    if (!value) continue;
    if (url.searchParams.has(key)) continue; // target wins
    url.searchParams.set(key, value);
  }
  return url.toString();
}
