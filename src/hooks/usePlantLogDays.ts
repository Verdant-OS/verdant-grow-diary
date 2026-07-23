/**
 * usePlantLogDays — read-only loader for the Plant Detail "logged today"
 * marker. Fetches only `entry_at` timestamps for the plant's recent diary
 * entries (a bounded window), which is all the streak rules need.
 *
 * The query key is prefixed with "diary_entries" ON PURPOSE: the Quick Log v2
 * post-save refresh invalidates `{ queryKey: ["diary_entries"] }`, and prefix
 * matching means this marker updates immediately after a save with no extra
 * wiring.
 *
 * Read-only. RLS enforces ownership. No writes, no RPC.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PLANT_LOG_DAYS_WINDOW = 60;

export function usePlantLogDays(plantId: string | null | undefined) {
  return useQuery<Array<string | null>>({
    queryKey: ["diary_entries", "plant_log_days", plantId ?? null],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("entry_at")
        .eq("plant_id", plantId as string)
        .order("entry_at", { ascending: false })
        .limit(PLANT_LOG_DAYS_WINDOW);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { entry_at: string | null }).entry_at);
    },
  });
}
