/**
 * usePaddleCancelNotice — presentation-only.
 *
 * Fetches bounded newest-first RECURRING subscription windows for live and
 * sandbox (skipping `lifetime_%` pseudo-subscription IDs), selects an entitling
 * live row before a sandbox fallback, and derives the cancel-notice presentation
 * via `derivePaddleCancelNotice`. Never mutates rows, never re-implements access
 * rules, and never gates capabilities — the entitlement hook / access rules
 * remain the source of truth for what a user can do.
 *
 * RLS on public.subscriptions is select-own; passing user_id is redundant
 * but harmless. The hook returns HIDDEN while loading or on error.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { getPaddleEnvironment } from "@/lib/paddle";
import {
  lovableRowEntitles,
  pickEntitlingLovableRow,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
  type LovableBillingEnvironment,
  type LovableSubscriptionRow,
} from "@/lib/entitlements";
import {
  derivePaddleCancelNotice,
  type PaddleCancelNotice,
  type PaddleCancelNoticeInput,
} from "@/lib/paddleCancelNoticePresenter";

const HIDDEN: PaddleCancelNotice = {
  visible: false,
  accessUntilIso: null,
  accessUntilLabel: "",
  reason: null,
};

type PaddleCancelSubscriptionRow = LovableSubscriptionRow & PaddleCancelNoticeInput;

export function usePaddleCancelNotice(): PaddleCancelNotice {
  const { user, loading: authLoading } = useAuth();
  const [notice, setNotice] = useState<PaddleCancelNotice>(HIDDEN);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user) {
      setNotice(HIDDEN);
      return;
    }
    const expectedEnvironment: LovableBillingEnvironment = getPaddleEnvironment();
    (async () => {
      const recurringRows = (environment: LovableBillingEnvironment) =>
        supabase
          .from("subscriptions")
          .select(
            "user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, current_period_start, current_period_end, cancel_at_period_end, scheduled_change_action, scheduled_change_at, environment, created_at, updated_at",
          )
          .eq("user_id", user.id)
          .eq("environment", environment)
          .not("paddle_subscription_id", "like", "lifetime_%")
          .order("created_at", { ascending: false })
          .order("paddle_subscription_id", { ascending: false })
          .limit(SUBSCRIPTION_ROW_SCAN_LIMIT);

      // Live subscription rows remain canonical production evidence even
      // while new checkout is intentionally sandbox-only. Read the same
      // bounded environment windows as the entitlement hook, then apply its
      // live-first, any-entitling-row precedence before deriving copy.
      const [liveResult, sandboxResult] = await Promise.all([
        recurringRows("live"),
        recurringRows("sandbox"),
      ]);
      if (cancelled) return;
      if (liveResult.error || sandboxResult.error) {
        setNotice(HIDDEN);
        return;
      }

      const now = new Date();
      const liveRows = (liveResult.data ?? []) as PaddleCancelSubscriptionRow[];
      const sandboxRows = (sandboxResult.data ?? []) as PaddleCancelSubscriptionRow[];
      const liveRow = pickEntitlingLovableRow(
        liveRows,
        "live",
        now,
      ) as PaddleCancelSubscriptionRow | null;
      const sandboxRow = pickEntitlingLovableRow(
        sandboxRows,
        "sandbox",
        now,
      ) as PaddleCancelSubscriptionRow | null;
      const liveRowEntitles = liveRow != null && lovableRowEntitles(liveRow, "live", now);
      const sandboxRowEntitles =
        sandboxRow != null && lovableRowEntitles(sandboxRow, "sandbox", now);
      const selectedRow = liveRowEntitles
        ? liveRow
        : sandboxRowEntitles || expectedEnvironment === "sandbox"
          ? sandboxRow
          : liveRow;

      setNotice(derivePaddleCancelNotice(selectedRow));
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return notice;
}
