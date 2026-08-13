/**
 * FunnelEventDbSink — first-party listener for the existing verdant:analytics
 * CustomEvent mirror (see funnelAnalytics.ts). Every trackFunnelEvent() call
 * already dispatches this event; nothing in production has ever subscribed
 * to it, so conversion counts have only ever lived in GA. This writes the
 * same events into public.funnel_events (migration 20260813020000),
 * queryable directly without a GA login.
 *
 * SAFETY:
 *  - Consent-gated INDEPENDENTLY of gtag. The CustomEvent mirror fires
 *    unconditionally — only the GA *script load* is consent-gated (see
 *    AnalyticsShell in routes/__root.tsx) — so this sink applies the exact
 *    same useAnalyticsConsent() decision itself. Without this, a first-party
 *    sink would capture data from a grower who explicitly declined, which is
 *    worse than the gap it closes.
 *  - Auth-gated: RLS requires auth.uid() = user_id, so a signed-out visitor
 *    is skipped rather than attempted-and-rejected.
 *  - Treats the event detail as untrusted input — see
 *    decideFunnelEventSinkWrite, which owns all the validation.
 *  - Fire-and-forget, like the gtag call it mirrors: never blocks, never
 *    throws, never retried. A dropped analytics row is an acceptable loss;
 *    a broken save/checkout path is not.
 *  - Buffers events until BOTH consent and auth have hydrated. Mounting
 *    this before <Outlet/> guarantees the window LISTENER exists before a
 *    route's own mount-effect trackFunnelEvent call (e.g. Pricing's
 *    paywall_viewed) — but not that consentGrantedRef/userIdRef already
 *    reflect real values: useAnalyticsConsent's hydration read is
 *    synchronous but delivered via setState inside an effect, and
 *    AuthProvider's session read is genuinely async
 *    (supabase.auth.getSession() is a Promise). Neither setState
 *    synchronously updates these refs mid-flush — a re-render only happens
 *    after the CURRENT effect flush finishes across the whole tree, so a
 *    route mount effect firing in that same first flush would otherwise see
 *    the refs' pre-hydration values (false/null) and drop the event
 *    permanently. Buffering and replaying once both signals settle closes
 *    that gap without reaching into Supabase internals for a synchronous
 *    session read.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/store/auth";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import { decideFunnelEventSinkWrite } from "@/lib/funnelEventDbSinkRules";
import { supabase } from "@/integrations/supabase/client";

/** Bounded defensively — only events from the brief pre-hydration window on
 * a single cold load are ever queued, realistically 0-1. */
const MAX_PENDING = 20;

// Narrow cast: funnel_events is added by migration 20260813020000; until the
// founder deploys it and regenerates the Supabase types, insert through this
// seam. Replace with the typed table then. Same idiom as
// useCultivarFollow.ts's followsTable().
function funnelEventsTable() {
  return (supabase as unknown as { from: (t: string) => any }).from("funnel_events");
}

export default function FunnelEventDbSink() {
  const { user, loading: authLoading } = useAuth();
  const { decision, hydrated: consentHydrated } = useAnalyticsConsent();

  // Read the LATEST values inside a listener registered exactly once — not
  // per consent/auth change, which would multiply the window listener count
  // over a long session and complicate teardown for no benefit.
  const consentGrantedRef = useRef(false);
  consentGrantedRef.current = decision === "granted";
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  const readyRef = useRef(false);
  readyRef.current = consentHydrated && !authLoading;

  // Events that arrive before both signals above have settled — see the
  // buffering note in the file header. Drained once readyRef flips true.
  const pendingRef = useRef<unknown[]>([]);

  // Same useLatest idiom as consentGrantedRef/userIdRef above: writeRow is
  // a fresh closure every render, and only its ref is ever called, so both
  // the listener (registered once) and the drain effect (below) always use
  // the current consentGrantedRef/userIdRef without needing to re-register
  // the window listener on every consent/auth change.
  const writeRow = (detail: unknown) => {
    const outcome = decideFunnelEventSinkWrite({
      detail,
      consentGranted: consentGrantedRef.current,
      userId: userIdRef.current,
    });
    if (!outcome.write) return;
    void (async () => {
      try {
        await funnelEventsTable().insert(outcome.row);
      } catch {
        // Analytics must never break the product — a dropped row is fine.
      }
    })();
  };
  const writeRowRef = useRef(writeRow);
  writeRowRef.current = writeRow;

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!readyRef.current) {
        if (pendingRef.current.length < MAX_PENDING) pendingRef.current.push(detail);
        return;
      }
      writeRowRef.current(detail);
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, handler);
    return () => window.removeEventListener(PRICING_ANALYTICS_EVENT, handler);
  }, []);

  // Fires whenever either hydration signal changes. By the time this runs,
  // the render that changed consentHydrated/authLoading has already
  // updated consentGrantedRef/userIdRef above (ref writes happen during
  // render, before effects), so replaying against them here uses the real,
  // settled values — never whatever they were at the original dispatch.
  useEffect(() => {
    if (!(consentHydrated && !authLoading)) return;
    if (pendingRef.current.length === 0) return;
    const queued = pendingRef.current;
    pendingRef.current = [];
    queued.forEach((detail) => writeRowRef.current(detail));
  }, [consentHydrated, authLoading]);

  return null;
}
