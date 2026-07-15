/**
 * quickLogStarterLinks — the ONE module that owns every outbound URL the
 * public Quick Log Starter (/quick-log) emits. This is the attribution
 * contract the search-to-first-value guide cluster imports and pins.
 *
 * Rules:
 *  - Attribution in/out is EXACTLY the 5 SAFE_UTM_KEYS via the existing
 *    pickSafeUtmParams — no invented params, values capped at 256 chars.
 *  - No PII and no user-entered text ever rides in a URL (GA forwards
 *    location.search verbatim; the draft note/nickname stay in storage).
 *  - The signup redirect target is a plain internal path that passes
 *    sanitizeAuthRedirect unchanged; UTMs are appended to the /auth URL
 *    itself (GA funnel attribution) — Auth ignores unknown params.
 *
 * Pure: no React, no I/O, no time reads.
 */
import { SAFE_UTM_KEYS, pickSafeUtmParams } from "@/lib/utm/preserveUtm";

/** The starter's public route. Six guides will hardcode links to this. */
export const PUBLIC_QUICK_LOG_STARTER_PATH = "/quick-log";

/**
 * Post-signup landing target. Matches Auth's own default so the param stays
 * honest; the saved draft travels via localStorage, never via the URL.
 */
export const PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT = "/onboarding";

/**
 * Build the signup CTA href:
 *   /auth?mode=signup&redirectTo=%2Fonboarding[&utm_...allow-listed inbound]
 *
 * `search` is the starter page's current location.search; only the five
 * SAFE_UTM_KEYS survive, in stable declaration order.
 */
export function buildQuickLogStarterSignupHref(search: string | null | undefined): string {
  const params = new URLSearchParams();
  params.set("mode", "signup");
  params.set("redirectTo", PUBLIC_QUICK_LOG_STARTER_SIGNUP_REDIRECT);
  const utms = pickSafeUtmParams(search);
  for (const key of SAFE_UTM_KEYS) {
    const value = utms[key];
    if (value) params.set(key, value);
  }
  return `/auth?${params.toString()}`;
}
