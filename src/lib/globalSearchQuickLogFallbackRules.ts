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
 * Both branches preserve the grower's chosen preset. The authed branch adds
 * the same `type=` marker to the intent URL; AppShell reads it back through
 * {@link readQuickLogStartEventType} and seeds Quick Log's activity, so
 * picking "Watering" does not silently open a plain observation form. The
 * marker is stripped when the intent is consumed (see
 * consumeQuickLogStartIntent) so it never lingers across refresh/back.
 *
 * Note on timing: inside AppShell this decision is never made mid-auth,
 * because AppShell itself only renders children once `loading` is false and
 * a user is present. On the public /cultivars page a signed-in visitor who
 * clicks before their session resolves falls back to the public starter,
 * which is the same behaviour anonymous visitors get and is never a data
 * write — a soft, recoverable outcome rather than a wrong write.
 *
 * Pure: no I/O, no React, no time reads, no Supabase.
 */

import { QUICK_LOG_START_ROUTE } from "@/lib/startScreenPreferences";
import { PUBLIC_QUICK_LOG_STARTER_PATH } from "@/lib/quickLogStarterLinks";
import {
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  type PublicQuickLogStarterLogType,
} from "@/lib/publicQuickLogStarterRules";

/**
 * Query key carrying the chosen preset alongside `open=quick-log`. Shared by
 * the builder and the reader so the two can never drift.
 */
export const QUICK_LOG_START_TYPE_PARAM = "type";

export type ContextFreeQuickLogDestination =
  /** Authenticated grower: open the real Quick Log via the dashboard intent. */
  | { kind: "authed-start"; to: string }
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

function isKnownType(value: unknown): value is PublicQuickLogStarterLogType {
  return (
    typeof value === "string" &&
    (PUBLIC_QUICK_LOG_STARTER_LOG_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Resolve the destination for a Quick Log preset chosen with no plant/tent
 * context. Signed-in growers never receive the public starter, and both
 * branches carry the chosen preset when there is one.
 */
export function resolveContextFreeQuickLogDestination(
  input: ContextFreeQuickLogInput,
): ContextFreeQuickLogDestination {
  const seed = isKnownType(input.fallbackType) ? input.fallbackType : null;
  if (input.isSignedIn) {
    // QUICK_LOG_START_ROUTE already carries `?open=quick-log`, so the preset
    // is appended with `&`.
    return {
      kind: "authed-start",
      to: seed
        ? `${QUICK_LOG_START_ROUTE}&${QUICK_LOG_START_TYPE_PARAM}=${encodeURIComponent(seed)}`
        : QUICK_LOG_START_ROUTE,
    };
  }
  return {
    kind: "public-starter",
    to: seed
      ? `${PUBLIC_QUICK_LOG_STARTER_PATH}?${QUICK_LOG_START_TYPE_PARAM}=${encodeURIComponent(seed)}`
      : PUBLIC_QUICK_LOG_STARTER_PATH,
  };
}

/**
 * Read the preset back out of an authenticated Quick Log start intent.
 * Returns null unless the search carries a valid `open=quick-log` intent AND
 * a recognised type, so an unknown or hand-edited value can never reach
 * Quick Log's activity selector.
 */
export function readQuickLogStartEventType(
  search: string | null | undefined,
): PublicQuickLogStarterLogType | null {
  if (typeof search !== "string") return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("open") !== "quick-log") return null;
  const raw = params.get(QUICK_LOG_START_TYPE_PARAM);
  return isKnownType(raw) ? raw : null;
}
