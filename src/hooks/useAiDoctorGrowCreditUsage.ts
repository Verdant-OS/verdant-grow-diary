/**
 * useAiDoctorGrowCreditUsage — presentation-only read of per-grow and monthly
 * AI credit allowance usage plus environment-scoped credit-pack balance for AI
 * Doctor surfaces (#2161).
 *
 * Works with or without a QueryClientProvider so standalone route tests (such
 * as AiDoctorStart) and QueryClient-backed views share the same calculation.
 * Read-only; RLS enforces ownership (`ai_credit_spends_select_own`,
 * `ai_credit_grants_select_own`).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAiCreditPackBalance,
  formatAiCreditUtcPeriodKey,
  resolveAuthoritativeBillingEnvironment,
  sumAiDoctorAllowanceSpends,
  sumAiDoctorMonthlyAllowanceSpends,
  type AiDoctorGrantRowLike,
  type AiDoctorSpendRowLike,
} from "@/lib/aiDoctorSurfaceCreditViewModel";
import { isUuid } from "@/lib/isUuid";
import { useAuth } from "@/store/auth";

export interface AiDoctorGrowCreditUsageOptions {
  growId?: string | null;
  perGrowEnabled?: boolean;
  monthlyEnabled?: boolean;
  billingEnvironment?: "live" | "sandbox";
}

export interface AiDoctorGrowCreditUsageResult {
  allowanceUsed: number | null;
  monthlyUsed: number | null;
  packBalance: number | null;
  isError: boolean;
  refresh: () => void;
}

interface ScopedCreditUsageState {
  scopeKey: string | null;
  allowanceUsed: number | null;
  monthlyUsed: number | null;
  packBalance: number | null;
  isError: boolean;
}

/**
 * Loads per-grow and monthly AI Doctor allowance usage and environment-scoped
 * pack balance for the authenticated user.
 */
export function useAiDoctorGrowCreditUsage(
  options: AiDoctorGrowCreditUsageOptions,
): AiDoctorGrowCreditUsageResult {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const validGrowId = isUuid(options.growId) ? options.growId : null;
  const canLoadPerGrow = options.perGrowEnabled === true && validGrowId !== null;
  const canLoadMonthly = options.monthlyEnabled === true;
  const enabled = !authLoading && Boolean(userId) && (canLoadPerGrow || canLoadMonthly);
  const billingEnvironment = resolveAuthoritativeBillingEnvironment(options.billingEnvironment);
  const [refreshTick, setRefreshTick] = useState(0);

  const activeScopeKey = enabled
    ? `${userId}:${canLoadPerGrow ? validGrowId : "monthly"}:${billingEnvironment ?? "unresolved"}`
    : null;

  const [state, setState] = useState<ScopedCreditUsageState>({
    scopeKey: null,
    allowanceUsed: null,
    monthlyUsed: null,
    packBalance: null,
    isError: false,
  });

  useEffect(() => {
    if (!activeScopeKey || !userId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const spendsQuery = supabase
          .from("ai_credit_spends")
          .select(
            "id, grow_id, period_key, refund_of, weight, funded_by:meta->>funded_by, billing_environment:meta->>server_billing_environment",
          )
          .eq("user_id", userId);
        const [spendsRes, grantsRes] = await Promise.all([
          canLoadPerGrow && validGrowId && !canLoadMonthly
            ? spendsQuery.eq("grow_id", validGrowId)
            : spendsQuery,
          billingEnvironment
            ? supabase
                .from("ai_credit_grants")
                .select("credits, environment, expires_at")
                .eq("user_id", userId)
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (cancelled) return;
        if (spendsRes.error || grantsRes.error) {
          setState({
            scopeKey: activeScopeKey,
            allowanceUsed: null,
            monthlyUsed: null,
            packBalance: null,
            isError: true,
          });
          return;
        }
        const now = new Date();
        const spendRows = (spendsRes.data ?? []) as ReadonlyArray<AiDoctorSpendRowLike>;
        const grantRows = (grantsRes.data ?? []) as ReadonlyArray<AiDoctorGrantRowLike>;
        const usedPerGrow = canLoadPerGrow
          ? sumAiDoctorAllowanceSpends(spendRows, validGrowId)
          : null;
        const usedMonthly = canLoadMonthly
          ? sumAiDoctorMonthlyAllowanceSpends(spendRows, formatAiCreditUtcPeriodKey(now))
          : null;
        const packBalance = billingEnvironment
          ? computeAiCreditPackBalance({
              grantRows,
              spendRows,
              billingEnvironment,
              nowMs: now.getTime(),
            })
          : null;
        setState({
          scopeKey: activeScopeKey,
          allowanceUsed: usedPerGrow,
          monthlyUsed: usedMonthly,
          packBalance,
          isError: false,
        });
      } catch {
        if (!cancelled) {
          setState({
            scopeKey: activeScopeKey,
            allowanceUsed: null,
            monthlyUsed: null,
            packBalance: null,
            isError: true,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeScopeKey,
    billingEnvironment,
    canLoadMonthly,
    canLoadPerGrow,
    refreshTick,
    userId,
    validGrowId,
  ]);

  const refresh = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  if (!activeScopeKey || state.scopeKey !== activeScopeKey) {
    return {
      allowanceUsed: null,
      monthlyUsed: null,
      packBalance: null,
      isError: false,
      refresh,
    };
  }

  return {
    allowanceUsed: state.allowanceUsed,
    monthlyUsed: state.monthlyUsed,
    packBalance: state.packBalance,
    isError: state.isError,
    refresh,
  };
}
