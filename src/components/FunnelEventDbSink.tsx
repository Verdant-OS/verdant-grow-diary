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
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/store/auth";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import { decideFunnelEventSinkWrite } from "@/lib/funnelEventDbSinkRules";
import { supabase } from "@/integrations/supabase/client";

// Narrow cast: funnel_events is added by migration 20260813020000; until the
// founder deploys it and regenerates the Supabase types, insert through this
// seam. Replace with the typed table then. Same idiom as
// useCultivarFollow.ts's followsTable().
function funnelEventsTable() {
  return (supabase as unknown as { from: (t: string) => any }).from("funnel_events");
}

export default function FunnelEventDbSink() {
  const { user } = useAuth();
  const { decision } = useAnalyticsConsent();

  // Read the LATEST values inside a listener registered exactly once — not
  // per consent/auth change, which would multiply the window listener count
  // over a long session and complicate teardown for no benefit.
  const consentGrantedRef = useRef(false);
  consentGrantedRef.current = decision === "granted";
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    const handler = (event: Event) => {
      const outcome = decideFunnelEventSinkWrite({
        detail: (event as CustomEvent).detail,
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
    window.addEventListener(PRICING_ANALYTICS_EVENT, handler);
    return () => window.removeEventListener(PRICING_ANALYTICS_EVENT, handler);
  }, []);

  return null;
}
