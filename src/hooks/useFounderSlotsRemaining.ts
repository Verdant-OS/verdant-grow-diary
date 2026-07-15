/**
 * useFounderSlotsRemaining — small, presentation-only hook that reads the
 * live Founder Lifetime slot counter from the `founder-slots-remaining`
 * edge function.
 *
 * L2 (audit fix): the /pricing Founder card used to render "First 75 only"
 * as a static badge; a sold-out cap wasn't visible until the buyer clicked
 * through and the price-resolver returned `plan_sold_out`. This hook gives
 * the card a "N of 75 claimed" live number and lets the CTA render "Sold
 * out" when `remaining === 0`.
 *
 * SAFETY:
 *  - Never grants entitlement. Cap enforcement lives server-side in the
 *    `allocate_lovable_founder_lifetime` RPC — this hook is UX only.
 *  - Fails soft: on error the hook returns `{ status: 'unknown' }` so the
 *    card falls back to its static copy instead of blocking the page.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOTAL_SLOTS = 75;

export interface FounderSlotsState {
  status: "loading" | "ready" | "unknown";
  remaining: number | null;
  total: number;
  claimed: number | null;
  soldOut: boolean;
}

const INITIAL: FounderSlotsState = {
  status: "loading",
  remaining: null,
  total: TOTAL_SLOTS,
  claimed: null,
  soldOut: false,
};

export function useFounderSlotsRemaining(): FounderSlotsState {
  const [state, setState] = useState<FounderSlotsState>(INITIAL);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "founder-slots-remaining",
          { body: {} },
        );
        if (cancelled || !mountedRef.current) return;
        if (error || typeof (data as { remaining?: unknown })?.remaining !== "number") {
          setState({
            status: "unknown",
            remaining: null,
            total: TOTAL_SLOTS,
            claimed: null,
            soldOut: false,
          });
          return;
        }
        const remaining = Math.max(
          0,
          Math.min(TOTAL_SLOTS, Math.floor((data as { remaining: number }).remaining)),
        );
        setState({
          status: "ready",
          remaining,
          total: TOTAL_SLOTS,
          claimed: TOTAL_SLOTS - remaining,
          soldOut: remaining <= 0,
        });
      } catch {
        if (cancelled || !mountedRef.current) return;
        setState({
          status: "unknown",
          remaining: null,
          total: TOTAL_SLOTS,
          claimed: null,
          soldOut: false,
        });
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  return state;
}
