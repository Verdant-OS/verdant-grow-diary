/**
 * useAiDoctorGrowCreditUsage — presentation-only read of per-grow and monthly
 * AI credit allowance usage plus environment-scoped credit-pack balance for AI
 * Doctor surfaces (#2161).
 *
 * Works with or without a QueryClientProvider so standalone route tests (such
 * as AiDoctorStart) and QueryClient-backed views share the same calculation.
 * Read-only; RLS enforces ownership (`ai_credit_spends_select_own`,
 * `ai_credit_grants_select_own`).
 *
 * Each ledger read mirrors one `ai_credit_spend` aggregate and is paged to
 * completion (exact count + stable `id` order), so a PostgREST response cap can
 * never silently truncate a balance:
 *  - per-grow allowance: spends on this grow;
 *  - monthly allowance: spends in the current UTC `period_key`;
 *  - pack pool: every pack-funded spend across ALL of the user's grows, plus
 *    every grant row. Loaded only when the billing environment is resolved.
 * A ledger that is incomplete or larger than the page budget hides the badge.
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

/** Rows requested per page; PostgREST may return fewer under its max-rows cap. */
export const AI_CREDIT_LEDGER_PAGE_SIZE = 1000;
/** Upper bound on pages per ledger read; beyond it the read fails closed. */
export const AI_CREDIT_LEDGER_MAX_PAGES = 50;

interface LedgerPageResult<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

/**
 * Reads every row of a ledger by paging `[from, to]` ranges until the exact
 * row count is reached. Returns `null` (fail closed) on any error, a missing
 * count, a short page before the count is reached, or the page budget running
 * out — a partial ledger is never treated as complete.
 */
export async function readCompleteAiCreditLedger<T>(
  fetchPage: (from: number, to: number) => PromiseLike<LedgerPageResult<T>>,
  pageSize: number = AI_CREDIT_LEDGER_PAGE_SIZE,
  maxPages: number = AI_CREDIT_LEDGER_MAX_PAGES,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = rows.length;
    const res = await fetchPage(from, from + pageSize - 1);
    if (res.error) return null;
    const total = res.count;
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return null;
    const data = res.data ?? [];
    rows.push(...data);
    if (rows.length >= total) return rows.length === total ? rows : null;
    if (data.length === 0) return null;
  }
  return null;
}

const SPEND_COLUMNS =
  "id, grow_id, period_key, refund_of, weight, funded_by:meta->>funded_by, billing_environment:meta->>server_billing_environment";

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
        const now = new Date();
        const periodKey = formatAiCreditUtcPeriodKey(now);
        const spendPage =
          (scope: { column: string; value: string }) => (from: number, to: number) =>
            supabase
              .from("ai_credit_spends")
              .select(SPEND_COLUMNS, { count: "exact" })
              .eq("user_id", userId)
              .eq(scope.column, scope.value)
              .order("id", { ascending: true })
              .range(from, to) as unknown as PromiseLike<LedgerPageResult<AiDoctorSpendRowLike>>;
        const [perGrowRows, monthlyRows, packSpendRows, grantRows] = await Promise.all([
          canLoadPerGrow && validGrowId
            ? readCompleteAiCreditLedger(spendPage({ column: "grow_id", value: validGrowId }))
            : Promise.resolve([] as AiDoctorSpendRowLike[]),
          canLoadMonthly
            ? readCompleteAiCreditLedger(spendPage({ column: "period_key", value: periodKey }))
            : Promise.resolve([] as AiDoctorSpendRowLike[]),
          billingEnvironment
            ? readCompleteAiCreditLedger(spendPage({ column: "meta->>funded_by", value: "pack" }))
            : Promise.resolve([] as AiDoctorSpendRowLike[]),
          billingEnvironment
            ? readCompleteAiCreditLedger(
                (from: number, to: number) =>
                  supabase
                    .from("ai_credit_grants")
                    .select("id, credits, environment, expires_at", { count: "exact" })
                    .eq("user_id", userId)
                    .order("id", { ascending: true })
                    .range(from, to) as unknown as PromiseLike<
                    LedgerPageResult<AiDoctorGrantRowLike>
                  >,
              )
            : Promise.resolve([] as AiDoctorGrantRowLike[]),
        ]);

        if (cancelled) return;
        if (!perGrowRows || !monthlyRows || !packSpendRows || !grantRows) {
          setState({
            scopeKey: activeScopeKey,
            allowanceUsed: null,
            monthlyUsed: null,
            packBalance: null,
            isError: true,
          });
          return;
        }
        const usedPerGrow = canLoadPerGrow
          ? sumAiDoctorAllowanceSpends(perGrowRows, validGrowId)
          : null;
        const usedMonthly = canLoadMonthly
          ? sumAiDoctorMonthlyAllowanceSpends(monthlyRows, periodKey)
          : null;
        const packBalance = billingEnvironment
          ? computeAiCreditPackBalance({
              grantRows,
              spendRows: packSpendRows,
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
