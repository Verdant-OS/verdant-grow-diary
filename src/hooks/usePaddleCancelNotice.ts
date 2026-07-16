/**
 * usePaddleCancelNotice — presentation-only.
 *
 * Fetches the caller's newest RECURRING subscription row (skipping the
 * `lifetime_%` pseudo-subscription IDs) and derives the cancel-notice
 * presentation via `derivePaddleCancelNotice`. Never mutates rows, never
 * re-implements access rules, and never gates capabilities — the entitlement
 * hook / access rules remain the source of truth for what a user can do.
 *
 * RLS on public.subscriptions is select-own; passing user_id is redundant
 * but harmless. The hook returns HIDDEN while loading or on error.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { getPaddleEnvironment } from "@/lib/paddle";
import {
  derivePaddleCancelNotice,
  type PaddleCancelNotice,
} from "@/lib/paddleCancelNoticePresenter";

const HIDDEN: PaddleCancelNotice = {
  visible: false,
  accessUntilIso: null,
  accessUntilLabel: "",
  reason: null,
};

export function usePaddleCancelNotice(): PaddleCancelNotice {
  const { user, loading: authLoading } = useAuth();
  const [notice, setNotice] = useState<PaddleCancelNotice>(HIDDEN);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user) {
      setNotice(HIDDEN);
      return;
    }
    const env = getPaddleEnvironment();
    (async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "paddle_subscription_id, status, cancel_at_period_end, scheduled_change_action, scheduled_change_at, current_period_end",
        )
        .eq("user_id", user.id)
        .eq("environment", env)
        .not("paddle_subscription_id", "like", "lifetime_%")
        .order("created_at", { ascending: false })
        .order("paddle_subscription_id", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setNotice(HIDDEN);
        return;
      }
      setNotice(derivePaddleCancelNotice(data[0]));
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  return notice;
}
