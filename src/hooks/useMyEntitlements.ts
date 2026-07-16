/**
 * useMyEntitlements — presentation-only client read hook.
 *
 * SECURITY: This hook is for UX only. It is NEVER authoritative.
 * Any gate that costs money or protects sensitive data (AI credit
 * consumption, live-sensor access, advanced exports, etc.) MUST re-check
 * entitlement server-side in its edge function. Client capability resolution
 * can be lied to by a tampered client and must not be trusted for security.
 *
 * Canonical lane (2026-07-16): reads ONLY from public.subscriptions, the
 * Lovable Paddle lane. The legacy BYO billing_subscriptions branch was
 * retired in the entitlement-gates narrowing migration; any currently-
 * entitling BYO row was backfilled into public.subscriptions there.
 * Environment is derived from the client token prefix (test_ → sandbox,
 * otherwise live) and passed EXPLICITLY into the adapter.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  resolveUnionEntitlements,
  resolveEntitlements,
  pickEntitlingLovableRow,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
  type LovableSubscriptionRow,
  type ResolvedEntitlement,
} from "@/lib/entitlements";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface UseMyEntitlementsResult {
  loading: boolean;
  entitlement: ResolvedEntitlement;
  /** Bounded refetch — used by CheckoutSuccess to poll after checkout. */
  refetch: () => Promise<void>;
}

const FREE_NOW = (): ResolvedEntitlement => resolveEntitlements(null, new Date());

export function useMyEntitlements(): UseMyEntitlementsResult {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [entitlement, setEntitlement] = useState<ResolvedEntitlement>(() => FREE_NOW());

  const expectedBillingEnvironment = useMemo(() => getPaddleEnvironment(), []);

  // The subscription reads race unmount (route change, test teardown):
  // never setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doLoad = useCallback(async () => {
    if (!user) {
      if (!mountedRef.current) return;
      setEntitlement(FREE_NOW());
      setLoading(false);
      return;
    }
    setLoading(true);
    // Both reads are RLS-protected (select-own) and PRESENTATION-ONLY.
    // The subscriptions read is a bounded newest-first WINDOW, not limit(1):
    // public.subscriptions is unique per paddle_subscription_id, so a newer
    // canceled row (e.g. Pro) must not shadow an older entitling row (e.g.
    // Founder Lifetime). Same semantics as the server helper
    // supabase/functions/_shared/unionEntitlementLookup.ts.
    const [lovableRes, rolesRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", expectedBillingEnvironment)
        // created_at is not unique; paddle_subscription_id is — without the
        // tiebreak, equal timestamps make the window order (and therefore
        // the picked row) nondeterministic.
        .order("created_at", { ascending: false })
        .order("paddle_subscription_id", { ascending: false })
        .limit(SUBSCRIPTION_ROW_SCAN_LIMIT),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "staff")
        .maybeSingle(),
    ]);

    const now = new Date();
    const isStaff = !rolesRes.error && rolesRes.data != null;
    const lovableRows = lovableRes.error
      ? []
      : ((lovableRes.data ?? []) as LovableSubscriptionRow[]);
    const lovableRow = pickEntitlingLovableRow(lovableRows, expectedBillingEnvironment, now);

    if (!mountedRef.current) return;
    setEntitlement(
      resolveUnionEntitlements({
        byoRow: null,
        lovableRow,
        expectedBillingEnvironment,
        now,
        opts: { isStaff },
      }),
    );
    setLoading(false);
  }, [user, expectedBillingEnvironment]);

  useEffect(() => {
    if (authLoading) return;
    void doLoad();
  }, [authLoading, doLoad]);

  return { loading, entitlement, refetch: doLoad };
}
