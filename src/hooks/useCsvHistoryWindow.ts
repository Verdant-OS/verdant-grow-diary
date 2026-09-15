import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { SUBSCRIPTION_ROW_SCAN_LIMIT, type LovableSubscriptionRow } from "@/lib/entitlements";
import { resolveCsvHistoryWindow, type CsvHistoryWindow } from "@/lib/csvHistoryWindowRules";

/** Read-only display context for the live-only sensor history policy. */
export async function fetchCsvHistorySubscriptions(
  userId: string,
): Promise<LovableSubscriptionRow[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "user_id,environment,price_id,status,current_period_end,paddle_subscription_id,created_at",
    )
    .eq("user_id", userId)
    .eq("environment", "live")
    .order("created_at", { ascending: false })
    .order("paddle_subscription_id", { ascending: false })
    .limit(SUBSCRIPTION_ROW_SCAN_LIMIT + 1);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("History access response unavailable");
  return data as LovableSubscriptionRow[];
}

export function useCsvHistoryWindow(enabled = true) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const query = useQuery({
    queryKey: ["csv-history-window", userId ?? "anonymous"],
    enabled: enabled && !!userId && !loading,
    retry: false,
    queryFn: () => fetchCsvHistorySubscriptions(userId!),
  });
  let window: CsvHistoryWindow;
  if (!userId || !enabled) window = { status: "unknown" };
  else if (query.isError) window = { status: "error" };
  else if (query.isPaused) window = { status: "paused" };
  else if (loading || query.isPending || query.isFetching) window = { status: "loading" };
  else window = resolveCsvHistoryWindow(query.data, new Date());
  return { window, refetch: query.refetch };
}
