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
  lovableRowEntitles,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
  type LovableSubscriptionRow,
  type ResolvedEntitlement,
} from "@/lib/entitlements";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface UseMyEntitlementsResult {
  loading: boolean;
  /** True when the canonical subscription row could not be read. */
  lookupFailed: boolean;
  entitlement: ResolvedEntitlement;
  /** Bounded refetch — used by CheckoutSuccess to poll after checkout. */
  refetch: () => Promise<void>;
}

const FREE_NOW = (): ResolvedEntitlement => resolveEntitlements(null, new Date());

export function useMyEntitlements(): UseMyEntitlementsResult {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [lookupFailed, setLookupFailed] = useState(false);
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
      setLookupFailed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLookupFailed(false);
    // All reads are RLS-protected (select-own) and PRESENTATION-ONLY.
    // Subscription reads use bounded newest-first WINDOWS, not limit(1):
    // public.subscriptions is unique per paddle_subscription_id, so a newer
    // canceled row (e.g. Pro) must not shadow an older entitling row (e.g.
    // Founder Lifetime). Same semantics as the server helper
    // supabase/functions/_shared/unionEntitlementLookup.ts.
    const subscriptionRows = (environment: "live" | "sandbox") =>
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", environment)
        // created_at is not unique; paddle_subscription_id is — without the
        // tiebreak, equal timestamps make the window order (and therefore
        // the picked row) nondeterministic.
        .order("created_at", { ascending: false })
        .order("paddle_subscription_id", { ascending: false })
        .limit(SUBSCRIPTION_ROW_SCAN_LIMIT);

    // Live rows are canonical production evidence and unlock regardless of
    // a sandbox-configured client. Sandbox rows unlock only when this client
    // explicitly expects sandbox. This mirrors the shared Edge helper and
    // the database entitlement gates.
    const wantsSandbox = expectedBillingEnvironment === "sandbox";
    const [liveRes, sandboxRes, rolesRes] = await Promise.all([
      subscriptionRows("live"),
      wantsSandbox
        ? subscriptionRows("sandbox")
        : Promise.resolve({ data: [] as LovableSubscriptionRow[], error: null }),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "staff")
        .maybeSingle(),
    ]);

    const now = new Date();
    const isStaff = !rolesRes.error && rolesRes.data != null;
    const liveRows = liveRes.error
      ? []
      : ((liveRes.data ?? []) as LovableSubscriptionRow[]);
    const sandboxRows = sandboxRes.error
      ? []
      : ((sandboxRes.data ?? []) as LovableSubscriptionRow[]);
    const liveRow = pickEntitlingLovableRow(liveRows, "live", now);
    const sandboxRow = wantsSandbox
      ? pickEntitlingLovableRow(sandboxRows, "sandbox", now)
      : null;
    const liveRowEntitles =
      liveRow != null && lovableRowEntitles(liveRow, "live", now);
    const sandboxRowEntitles =
      sandboxRow != null && lovableRowEntitles(sandboxRow, "sandbox", now);

    const resolvedEnvironment = liveRowEntitles
      ? "live"
      : sandboxRowEntitles || wantsSandbox
        ? "sandbox"
        : "live";
    const lovableRow = liveRowEntitles
      ? liveRow
      : sandboxRowEntitles || wantsSandbox
        ? sandboxRow
        : liveRow;
    const paidRowProven = liveRowEntitles || sandboxRowEntitles;
    const lookupFailed =
      !paidRowProven &&
      (liveRes.error != null || (wantsSandbox && sandboxRes.error != null));

    if (!mountedRef.current) return;
    setLookupFailed(lookupFailed);
    setEntitlement(
      resolveUnionEntitlements({
        byoRow: null,
        lovableRow,
        expectedBillingEnvironment: resolvedEnvironment,
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

  return { loading, lookupFailed, entitlement, refetch: doLoad };
}
