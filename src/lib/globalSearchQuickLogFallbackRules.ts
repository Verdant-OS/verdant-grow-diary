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
 * Inside AppShell this decision is never made mid-auth, because AppShell only
 * renders children once `loading` is false and a user is present. The public
 * /cultivars mount does render while AuthProvider resolves, so that caller
 * must defer the start until loading is explicitly false. Treating a
 * temporary null user as anonymous would recreate the signed-in-to-public
 * starter race.
 *
 * Pure: no I/O, no React, no time reads, no Supabase.
 */

import { QUICK_LOG_START_ROUTE } from "@/lib/startScreenPreferences";
import { PUBLIC_QUICK_LOG_STARTER_PATH } from "@/lib/quickLogStarterLinks";
import {
  PUBLIC_QUICK_LOG_STARTER_LOG_TYPES,
  type PublicQuickLogStarterLogType,
} from "@/lib/publicQuickLogStarterRules";
import { FAST_ADD_ACTIONS, type FastAddActionId } from "@/lib/fastAddActionRules";

/**
 * Query key carrying the chosen preset alongside `open=quick-log`. Shared by
 * the builder and the reader so the two can never drift.
 */
export const QUICK_LOG_START_TYPE_PARAM = "type";

/**
 * Closed vocabulary for the AUTHENTICATED marker: every non-null
 * `quickLogEventType` in FAST_ADD_ACTIONS. This is deliberately WIDER than
 * the public starter's four types — `photo` and `training` are real Quick Log
 * activities that the public starter simply has no equivalent for. Reusing
 * the starter's narrower list here would silently drop those two presets and
 * open a plain observation form, which is how a grower ends up with a
 * mislabeled entry. Pinned against FAST_ADD_ACTIONS by test so the two
 * cannot drift.
 */
export const QUICK_LOG_START_EVENT_TYPES = [
  "observation",
  "watering",
  "feeding",
  "training",
  "photo",
  "environment",
  "harvest",
] as const;

export type QuickLogStartEventType = (typeof QUICK_LOG_START_EVENT_TYPES)[number];

export type ContextFreeQuickLogDestination =
  /** Authenticated grower: open the real Quick Log via the dashboard intent. */
  | { kind: "authed-start"; to: string }
  /** Anonymous visitor: the public, device-local starter. */
  | { kind: "public-starter"; to: string };

export type ContextFreeQuickLogStartDecision =
  /** Session ownership is not known yet; the caller must wait and retry. */
  { kind: "wait-for-auth" } | ContextFreeQuickLogDestination;

export interface ContextFreeQuickLogInput {
  /** True when an authenticated session owns this view. */
  isSignedIn: boolean;
  /**
   * The preset's REAL Quick Log event type, used for the authenticated
   * branch. Null only for presets that do not open Quick Log at all
   * (Diagnosis navigates to the AI Doctor surface instead).
   */
  authedEventType: QuickLogStartEventType | null;
  /**
   * Public-starter-only seed for the anonymous branch. Values come from the
   * closed PUBLIC_QUICK_LOG_STARTER_LOG_TYPES vocabulary; null means the
   * starter has no equivalent for this preset (photo, training).
   */
  fallbackType: PublicQuickLogStarterLogType | null;
}

export interface ContextFreeQuickLogStartInput extends ContextFreeQuickLogInput {
  /** Must be explicitly false before a context-free destination is safe. */
  authLoading: boolean;
}

export type PendingContextFreeQuickLogIntent = Pick<
  ContextFreeQuickLogInput,
  "authedEventType" | "fallbackType"
>;

function isKnownStarterType(value: unknown): value is PublicQuickLogStarterLogType {
  return (
    typeof value === "string" &&
    (PUBLIC_QUICK_LOG_STARTER_LOG_TYPES as readonly string[]).includes(value)
  );
}

function isKnownEventType(value: unknown): value is QuickLogStartEventType {
  return (
    typeof value === "string" && (QUICK_LOG_START_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function normalizePendingIntent(
  next: PendingContextFreeQuickLogIntent | null | undefined,
): PendingContextFreeQuickLogIntent {
  return {
    authedEventType: isKnownEventType(next?.authedEventType) ? next.authedEventType : null,
    fallbackType: isKnownStarterType(next?.fallbackType) ? next.fallbackType : null,
  };
}

/**
 * Keep one owner-scoped deferred intent while auth resolves.
 *
 * Both preset channels are load-bearing: Photo and Training have a real
 * authenticated Quick Log event type but intentionally have no public-starter
 * fallback. Repeating the same normalized choice is idempotent; a different
 * choice deterministically replaces it so the grower's latest click wins.
 */
export function queueContextFreeQuickLogIntent(
  current: PendingContextFreeQuickLogIntent | null | undefined,
  next: PendingContextFreeQuickLogIntent | null | undefined,
): PendingContextFreeQuickLogIntent {
  const normalized = normalizePendingIntent(next);
  if (
    current?.authedEventType === normalized.authedEventType &&
    current?.fallbackType === normalized.fallbackType
  ) {
    return current;
  }
  return normalized;
}

/**
 * The preset's real Quick Log event type, read from the single source of
 * truth (FAST_ADD_ACTIONS) rather than re-declared at the call site. Callers
 * must not maintain their own preset -> event-type table: the public-starter
 * `fallbackType` column is deliberately narrower and is NOT a substitute.
 *
 * Returns null for presets that do not open Quick Log at all (Diagnosis
 * navigates to the AI Doctor surface).
 */
export function quickLogEventTypeForAction(
  actionId: FastAddActionId,
): QuickLogStartEventType | null {
  const def = FAST_ADD_ACTIONS.find((a) => a.id === actionId);
  return isKnownEventType(def?.quickLogEventType) ? def!.quickLogEventType : null;
}

/**
 * Resolve the destination for a Quick Log preset chosen with no plant/tent
 * context. Signed-in growers never receive the public starter, and both
 * branches carry the chosen preset when there is one.
 */
export function resolveContextFreeQuickLogDestination(
  input: ContextFreeQuickLogInput,
): ContextFreeQuickLogDestination {
  if (input.isSignedIn) {
    // Use the preset's REAL event type here, never the public-starter seed:
    // photo/training have no starter equivalent and would otherwise arrive as
    // null and silently open an observation form.
    const authed = isKnownEventType(input.authedEventType) ? input.authedEventType : null;
    // QUICK_LOG_START_ROUTE already carries `?open=quick-log`, so the preset
    // is appended with `&`.
    return {
      kind: "authed-start",
      to: authed
        ? `${QUICK_LOG_START_ROUTE}&${QUICK_LOG_START_TYPE_PARAM}=${encodeURIComponent(authed)}`
        : QUICK_LOG_START_ROUTE,
    };
  }
  const seed = isKnownStarterType(input.fallbackType) ? input.fallbackType : null;
  return {
    kind: "public-starter",
    to: seed
      ? `${PUBLIC_QUICK_LOG_STARTER_PATH}?${QUICK_LOG_START_TYPE_PARAM}=${encodeURIComponent(seed)}`
      : PUBLIC_QUICK_LOG_STARTER_PATH,
  };
}

/**
 * Gate a context-free Quick Log start on a resolved auth state.
 *
 * The deferred result deliberately has no destination. Unknown, null, or
 * malformed loading state therefore fails closed instead of being mistaken
 * for an anonymous session.
 */
export function resolveContextFreeQuickLogStart(
  input: ContextFreeQuickLogStartInput | null | undefined,
): ContextFreeQuickLogStartDecision {
  if (input?.authLoading !== false || typeof input.isSignedIn !== "boolean") {
    return { kind: "wait-for-auth" };
  }
  return resolveContextFreeQuickLogDestination(input);
}

/**
 * Read the preset back out of an authenticated Quick Log start intent.
 * Returns null unless the search carries a valid `open=quick-log` intent AND
 * a recognised type, so an unknown or hand-edited value can never reach
 * Quick Log's activity selector.
 */
export function readQuickLogStartEventType(
  search: string | null | undefined,
): QuickLogStartEventType | null {
  if (typeof search !== "string") return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("open") !== "quick-log") return null;
  const raw = params.get(QUICK_LOG_START_TYPE_PARAM);
  return isKnownEventType(raw) ? raw : null;
}
