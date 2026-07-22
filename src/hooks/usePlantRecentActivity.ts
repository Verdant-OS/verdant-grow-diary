/**
 * Read-only hook: latest diary entries for a single plant.
 *
 * Uses the same `diary_entries` table that QuickLog already writes to.
 * No writes. No new logging table. No alerts. No action_queue.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the plant's recent activity from `diary_entries`. The Quick Log v2
 * RPC (`quicklog_save_manual`) mirrors EVERY save into diary_entries — see
 * migration 20260721000000_quicklog_manual_always_mirror_diary.sql — so plain
 * notes/waterings surface here, not just detailed entries. diary_entries is
 * the canonical plant-activity log (tent moves, photos, action follow-ups, and
 * the legacy PlantQuickLog surface also write here); grow_events is not a
 * superset, so this read intentionally stays on diary_entries.
 */
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
        .order("entry_at", { ascending: false })
        .limit(PLANT_RECENT_ACTIVITY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}
