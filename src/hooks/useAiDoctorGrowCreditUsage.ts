/**
 * useAiDoctorGrowCreditUsage — presentation-only read of per-grow AI credit
 * allowance usage and credit-pack presence for AI Doctor surfaces that may
 * mount outside a QueryClient (such as AiDoctorStart).
 *
 * Mirrors useAlertDoctorCreditGateReads: counts own `ai_credit_spends` rows
 * for the grow whose `meta->>'funded_by'` is distinct from `'pack'` and checks
 * whether any unexpired `ai_credit_grants` row exists. Read-only; RLS enforces
 * ownership.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  hasUnexpiredAiCreditGrants,
  sumAiDoctorAllowanceSpends,
  type AiDoctorGrantRowLike,
  type AiDoctorSpendRowLike,
} from "@/lib/aiDoctorSurfaceCreditViewModel";
import { isUuid } from "@/lib/isUuid";
import { useAuth } from "@/store/auth";

export interface AiDoctorGrowCreditUsageResult {
  allowanceUsed: number | null;
  hasPackCredits: boolean | null;
  isError: boolean;
}

interface ScopedCreditUsageState {
  scopeKey: string | null;
  allowanceUsed: number | null;
  hasPackCredits: boolean | null;
  isError: boolean;
}

/**
 * Loads per-grow AI Doctor allowance usage and credit-pack grant presence for
 * the authenticated user and target grow UUID.
 */
export function useAiDoctorGrowCreditUsage(
  growId: string | null | undefined,
  enabled = true,
): AiDoctorGrowCreditUsageResult {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const validGrowId = isUuid(growId) ? growId : null;
  const activeScopeKey =
    enabled && !authLoading && userId && validGrowId ? `${userId}:${validGrowId}` : null;

  const [state, setState] = useState<ScopedCreditUsageState>({
    scopeKey: null,
    allowanceUsed: null,
    hasPackCredits: null,
    isError: false,
  });

  useEffect(() => {
    if (!activeScopeKey || !userId || !validGrowId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [spendsRes, grantsRes] = await Promise.all([
          supabase
            .from("ai_credit_spends")
            .select("weight, funded_by:meta->>funded_by")
            .eq("user_id", userId)
            .eq("grow_id", validGrowId),
          supabase.from("ai_credit_grants").select("credits, expires_at").eq("user_id", userId),
        ]);

        if (cancelled) return;
        if (spendsRes.error || grantsRes.error) {
          setState({
            scopeKey: activeScopeKey,
            allowanceUsed: null,
            hasPackCredits: null,
            isError: true,
          });
          return;
        }
        const used = sumAiDoctorAllowanceSpends(
          (spendsRes.data ?? []) as ReadonlyArray<AiDoctorSpendRowLike>,
        );
        const hasPacks = hasUnexpiredAiCreditGrants(
          (grantsRes.data ?? []) as ReadonlyArray<AiDoctorGrantRowLike>,
          Date.now(),
        );
        setState({
          scopeKey: activeScopeKey,
          allowanceUsed: used,
          hasPackCredits: hasPacks,
          isError: false,
        });
      } catch {
        if (!cancelled) {
          setState({
            scopeKey: activeScopeKey,
            allowanceUsed: null,
            hasPackCredits: null,
            isError: true,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeScopeKey, userId, validGrowId]);

  if (!activeScopeKey || state.scopeKey !== activeScopeKey) {
    return { allowanceUsed: null, hasPackCredits: null, isError: false };
  }

  return {
    allowanceUsed: state.allowanceUsed,
    hasPackCredits: state.hasPackCredits,
    isError: state.isError,
  };
}
