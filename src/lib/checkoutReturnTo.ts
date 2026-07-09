/**
 * checkoutReturnTo — sanitize the `returnTo` query param carried into the
 * upgrade / checkout success flow.
 *
 * The value comes from user-controlled query string. Never redirect to a
 * value from the raw query string without running it through
 * `sanitizeCheckoutReturnTo` first.
 *
 * Contract:
 *   - Returns the exact input string when it is a safe, same-origin absolute
 *     app path (starts with a single "/", no scheme, no protocol-relative
 *     "//", no backslashes, no encoded scheme tricks).
 *   - Returns `null` for everything else (missing, empty, external URL,
 *     protocol-relative, javascript:, data:, malformed encoding, non-string).
 *
 * Callers pick their own fallback (e.g. "/dashboard" or "/").
 *
 * This is defence in depth on top of React Router's own handling — we never
 * hand a raw query value to `navigate()` or `<Link to>`.
 */

/**
 * Allowlist of gated Pheno Tracker routes we specifically want to preserve
 * post-checkout. Any other same-origin app path also passes the generic
 * safety checks, so this list documents intent rather than restricting it.
 */
export const PHENO_TRACKER_RETURN_TO_ALLOWLIST: ReadonlyArray<RegExp> = [
  /^\/pheno-hunts\/new$/,
  /^\/pheno-hunts\/[^/?#]+\/workspace$/,
  /^\/pheno-hunts\/[^/?#]+\/keepers$/,
];

const FORBIDDEN_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function sanitizeCheckoutReturnTo(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0) return null;
  // A safe app path must start with exactly one "/" — reject protocol-relative
  // "//host" which browsers happily resolve to another origin.
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  // Reject backslash smuggling (Windows-style paths some routers normalize).
  if (value.includes("\\")) return null;
  // Reject anything containing a URL scheme after decoding. Guard against
  // "%2F%2Fevil.com", "/%09//evil.com", etc.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//")) return null;
  if (decoded.includes("\\")) return null;
  if (FORBIDDEN_SCHEME.test(decoded.trim())) return null;
  // Explicit blocks — belt and suspenders.
  const lowered = decoded.toLowerCase().trim();
  if (lowered.startsWith("javascript:")) return null;
  if (lowered.startsWith("data:")) return null;
  if (lowered.startsWith("vbscript:")) return null;
  if (lowered.startsWith("file:")) return null;
  // Reject control chars / newlines that can smuggle headers or trick routers.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  // Final origin check: URL parsed against a synthetic base must stay on the
  // synthetic origin. If it doesn't, the value was not a same-origin path.
  try {
    const base = "http://checkout-return-to.local";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return null;
    return value;
  } catch {
    return null;
  }
}

/** Convenience: returns sanitized path or the caller-supplied fallback. */
export function resolveCheckoutReturnTo(
  value: string | null | undefined,
  fallback: string,
): string {
  return sanitizeCheckoutReturnTo(value) ?? fallback;
}

/** True iff the sanitized path matches a gated Pheno Tracker workflow route. */
export function isPhenoTrackerReturnTo(path: string | null | undefined): boolean {
  if (typeof path !== "string") return false;
  return PHENO_TRACKER_RETURN_TO_ALLOWLIST.some((rx) => rx.test(path));
}
