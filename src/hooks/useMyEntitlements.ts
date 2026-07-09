/**
 * useMyEntitlements — presentation-only client read hook.
 *
 * SECURITY: This hook is for UX only. It is NEVER authoritative.
 * Any gate that costs money or protects sensitive data (AI credit
 * consumption, live-sensor access, advanced exports, etc.) MUST re-check
 * entitlement server-side in its edge function. Client capability resolution
 * can be lied to by a tampered client and must not be trusted for security.
 *
 * Phase 2b: unions the legacy BYO Paddle row (public.billing_subscriptions)
 * with the Lovable built-in Paddle row (public.subscriptions) via the pure
 * resolveUnionEntitlements composer. Environment is derived from the client
 * token prefix (test_ → sandbox, otherwise live) and passed EXPLICITLY into
 * the adapter — no implicit env inference beyond that single boundary.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  resolveUnionEntitlements,
  resolveEntitlements,
  type BillingSubscriptionRow,
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

  // The three subscription reads race unmount (route change, test
  // teardown): never setState after unmount.
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
    // All three reads are RLS-protected (select-own) and PRESENTATION-ONLY.
    const [byoRes, lovableRes, rolesRes] = await Promise.all([
      supabase.from("billing_subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", expectedBillingEnvironment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "staff")
        .maybeSingle(),
    ]);

    const isStaff = !rolesRes.error && rolesRes.data != null;
    const byoRow = byoRes.error ? null : ((byoRes.data ?? null) as BillingSubscriptionRow | null);
    const lovableRow = lovableRes.error
      ? null
      : ((lovableRes.data ?? null) as LovableSubscriptionRow | null);

    if (!mountedRef.current) return;
    setEntitlement(
      resolveUnionEntitlements({
        byoRow,
        lovableRow,
        expectedBillingEnvironment,
        now: new Date(),
        opts: { isStaff },
      }),
    );
    setLoading(false);
  }, [user, expectedBillingEnvironment]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return;
    void (async () => {
      await doLoad();
      if (cancelled) {
        // Prevent stale state application if unmounted mid-load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, doLoad]);

  return { loading, entitlement, refetch: doLoad };
}
