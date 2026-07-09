/**
 * useMyEntitlements — presentation-only client read hook.
 *
 * SECURITY: This hook is for UX only. It is NEVER authoritative.
 * Any gate that costs money or protects sensitive data (AI credit
 * consumption, live-sensor access, advanced exports, etc.) MUST re-check
 * entitlement server-side in its edge function. Client capability resolution
 * can be lied to by a tampered client and must not be trusted for security.
 *
 * Slice 1: no server-side enforcement is wired yet (deferred to S2).
 *
 * Reads the caller's own row from public.billing_subscriptions (RLS
 * enforces SELECT-own). On null/auth-missing/error, returns free defaults
 * so the UI degrades safely rather than crashing.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  resolveEntitlements,
  type BillingSubscriptionRow,
  type ResolvedEntitlement,
} from "@/lib/entitlements";

export interface UseMyEntitlementsResult {
  loading: boolean;
  entitlement: ResolvedEntitlement;
}

const FREE_NOW = (): ResolvedEntitlement =>
  resolveEntitlements(null, new Date());

export function useMyEntitlements(): UseMyEntitlementsResult {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [entitlement, setEntitlement] = useState<ResolvedEntitlement>(
    () => FREE_NOW(),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) {
          setEntitlement(FREE_NOW());
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      // Both reads are RLS-protected (select-own) and PRESENTATION-ONLY.
      // Server-side enforcement is authoritative for cost/security gates.
      const [subRes, rolesRes] = await Promise.all([
        supabase
          .from("billing_subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "staff")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const isStaff = !rolesRes.error && rolesRes.data != null;

      if (subRes.error) {
        // Fail safe to free capabilities; do not block the UI.
        // Staff still lifts to Pro-tier for display.
        setEntitlement(resolveEntitlements(null, new Date(), { isStaff }));
      } else {
        const row = (subRes.data ?? null) as BillingSubscriptionRow | null;
        setEntitlement(resolveEntitlements(row, new Date(), { isStaff }));
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { loading, entitlement };
}
