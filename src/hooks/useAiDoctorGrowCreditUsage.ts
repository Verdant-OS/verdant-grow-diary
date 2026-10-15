/**
 * useAiDoctorGrowCreditUsage — presentation-only read of per-grow AI credit
 * allowance usage for AI Doctor surfaces that may mount outside a QueryClient
 * (such as AiDoctorStart).
 *
 * Mirrors the allowance arm of useAlertDoctorCreditGateReads: counts own
 * `ai_credit_spends` rows for the grow whose `meta->>'funded_by'` is distinct
 * from `'pack'`. Read-only; RLS enforces ownership.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";
import { useAuth } from "@/store/auth";

export interface AiDoctorGrowCreditUsageResult {
  allowanceUsed: number | null;
  isError: boolean;
}

export function useAiDoctorGrowCreditUsage(
  growId: string | null | undefined,
  enabled = true,
): AiDoctorGrowCreditUsageResult {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const validGrowId = isUuid(growId) ? growId : null;
  const [allowanceUsed, setAllowanceUsed] = useState<number | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!enabled || authLoading || !userId || !validGrowId) {
      setAllowanceUsed(null);
      setIsError(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await supabase
          .from("ai_credit_spends")
          .select("weight, funded_by:meta->>funded_by")
          .eq("user_id", userId)
          .eq("grow_id", validGrowId);

        if (cancelled) return;
        if (res.error) {
          setAllowanceUsed(null);
          setIsError(true);
          return;
        }
        const used = (res.data ?? []).reduce((sum, row) => {
          const r = row as { weight: number | null; funded_by: string | null };
          return r.funded_by === "pack" ? sum : sum + (r.weight ?? 0);
        }, 0);
        setAllowanceUsed(used);
        setIsError(false);
      } catch {
        if (!cancelled) {
          setAllowanceUsed(null);
          setIsError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, enabled, userId, validGrowId]);

  return { allowanceUsed, isError };
}
