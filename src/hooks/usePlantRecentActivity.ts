/**
 * Read-only hook: latest diary entries for a single plant.
 *
 * Uses the same `diary_entries` table that QuickLog already writes to.
 * No writes. No new logging table. No alerts. No action_queue.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PLANT_RECENT_ACTIVITY_LIMIT = 10;

export function usePlantRecentActivity(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_recent_activity", plantId ?? null],
    enabled: !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("*")
        .eq("plant_id", plantId as string)
        // Order by the same "Captured" moment the panel displays and sorts
        // by (plantRecentActivityRules' occurredAt / occurredAtLabel), not
        // entry_at (save time) — otherwise a backdated-but-recently-Captured
        // entry beyond this Top-N cutoff would be silently excluded even
        // though it belongs in the visible window (Codex finding #6, PR #442).
        .order("logged_at", { ascending: false })
        .limit(PLANT_RECENT_ACTIVITY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}
