/**
 * globalSearchQuickLogFallbackRules — where a context-free Quick Log start
 * goes when Global Search has no plant/tent in the current route.
 *
 * Global Search renders in two places: inside the authenticated AppShell
 * (which hosts the real Quick Log dialog) and on the public /cultivars page
 * (which does not). Before this rule existed the no-context fallback always
 * navigated to the public /quick-log starter, so a signed-in grower was sent
 * to an anonymous device-local draft surface that cannot write to their
 * diary and whose only call to action is "Create a free account".
 *
 * Signed-in growers therefore go to the existing authenticated start route
 * (QUICK_LOG_START_ROUTE), whose one-shot `open=quick-log` intent AppShell
 * already consumes to open the real Quick Log dialog — so the entry lands in
 * the grower's diary and they end up on their dashboard rather than a signup
 * screen. Anonymous visitors keep the public starter, carrying the `?type=`
 * seed the starter already understands.
 *
 * Note on timing: inside AppShell this decision is never made mid-auth,
 * because AppShell itself only renders children once `loading` is false and
 * a user is present. On the public /cultivars page a signed-in visitor who
 * clicks before their session resolves falls back to the public starter,
 * which is the same behaviour anonymous visitors get and is never a data
 * write — it is a soft, recoverable outcome rather than a wrong write.
 *
 * Pure: no I/O, no React, no time reads, no Supabase.
 */

import { QUICK_LOG_START_ROUTE } from "@/lib/startScreenPreferences";
import { PUBLIC_QUICK_LOG_STARTER_PATH } from "@/lib/quickLogStarterLinks";
import type { PublicQuickLogStarterLogType } from "@/lib/publicQuickLogStarterRules";

export type ContextFreeQuickLogDestination =
  /** Authenticated grower: open the real Quick Log via the dashboard intent. */
  | { kind: "authed-start"; to: typeof QUICK_LOG_START_ROUTE }
  /** Anonymous visitor: the public, device-local starter. */
  | { kind: "public-starter"; to: string };

export interface ContextFreeQuickLogInput {
  /** True when an authenticated session owns this view. */
  isSignedIn: boolean;
  /**
   * Optional starter log-type seed. Values come from the closed
   * PUBLIC_QUICK_LOG_STARTER_LOG_TYPES vocabulary; null means "no seed"
   * (the training preset has no starter equivalent).
   */
  fallbackType: PublicQuickLogStarterLogType | null;
}

/**
 * Resolve the destination for a Quick Log preset chosen with no plant/tent
 * context. Signed-in growers never receive the public starter.
 */
export function resolveContextFreeQuickLogDestination(
  input: ContextFreeQuickLogInput,
): ContextFreeQuickLogDestination {
  if (input.isSignedIn) {
    return { kind: "authed-start", to: QUICK_LOG_START_ROUTE };
  }
  const seed = input.fallbackType;
  return {
    kind: "public-starter",
    to: seed
      ? `${PUBLIC_QUICK_LOG_STARTER_PATH}?type=${encodeURIComponent(seed)}`
      : PUBLIC_QUICK_LOG_STARTER_PATH,
  };
}
