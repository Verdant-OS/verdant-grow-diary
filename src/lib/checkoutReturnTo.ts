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

import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

/**
 * Allowlist of gated Pheno Tracker routes we specifically want to preserve
 * post-checkout. Any other same-origin app path also passes the generic
 * safety checks, so this list documents intent rather than restricting it.
 */
export const PHENO_TRACKER_RETURN_TO_ALLOWLIST: ReadonlyArray<RegExp> = [
  /^\/pheno-hunts$/,
  /^\/pheno-hunts\/new$/,
  /^\/pheno-hunts\/[^/?#]+\/workspace$/,
  /^\/pheno-hunts\/[^/?#]+\/keepers$/,
];

const FORBIDDEN_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function sanitizeCheckoutReturnTo(value: string | null | undefined): string | null {
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
  // eslint-disable-next-line no-control-regex -- matching control characters IS the security check here
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
  const safe = sanitizeCheckoutReturnTo(path);
  if (!safe) return false;

  try {
    const parsed = new URL(safe, "http://checkout-return-to.local");
    return PHENO_TRACKER_RETURN_TO_ALLOWLIST.some((rx) => rx.test(parsed.pathname));
  } catch {
    return false;
  }
}

export type CheckoutReturnSurface = "ai_doctor" | "pheno" | "other";

export const CHECKOUT_RETURN_NAVIGATION_STATE_KEY = "verdantCheckoutReturnSurface" as const;

export type CheckoutReturnNavigationState = Readonly<{
  [CHECKOUT_RETURN_NAVIGATION_STATE_KEY]: CheckoutReturnSurface;
}>;

/**
 * Classifies a safe post-checkout destination without emitting the path,
 * query string, hash contents, or embedded row identifiers to analytics.
 */
export function classifyCheckoutReturnSurface(
  value: string | null | undefined,
): CheckoutReturnSurface | null {
  const safe = sanitizeCheckoutReturnTo(value);
  if (!safe) return null;
  if (isPhenoTrackerReturnTo(safe)) return "pheno";

  try {
    const parsed = new URL(safe, "http://checkout-return-to.local");
    if (
      /^\/plants\/[^/]+$/.test(parsed.pathname) &&
      parsed.hash === `#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`
    ) {
      return "ai_doctor";
    }
  } catch {
    return null;
  }

  return "other";
}

/** Build the closed, identifier-free navigation marker consumed after arrival. */
export function buildCheckoutReturnNavigationState(
  surface: CheckoutReturnSurface,
): CheckoutReturnNavigationState {
  return { [CHECKOUT_RETURN_NAVIGATION_STATE_KEY]: surface };
}

/**
 * Pheno's route gate currently owns a separate entitlement read. Until that
 * gate exposes a shared committed-ready signal, counting its route arrival as
 * a completed paid return could race the gate's loading or denied state.
 * Keep the activation attribution, but fail closed on the completion marker.
 */
export function shouldCreateCheckoutReturnCompletionMarker(
  surface: CheckoutReturnSurface | null,
): surface is Exclude<CheckoutReturnSurface, "pheno"> {
  return surface === "ai_doctor" || surface === "other";
}

/** Read only Verdant's closed marker from untrusted router history state. */
export function readCheckoutReturnNavigationSurface(state: unknown): CheckoutReturnSurface | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>)[CHECKOUT_RETURN_NAVIGATION_STATE_KEY];
  return value === "ai_doctor" || value === "pheno" || value === "other" ? value : null;
}
