/**
 * Read-only hook: latest diary entries for a single plant.
 *
 * Uses the same `diary_entries` table that QuickLog already writes to.
 * No writes. No new logging table. No alerts. No action_queue.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

export const PLANT_RECENT_ACTIVITY_LIMIT = 10;

export async function fetchPlantRecentActivityRows(plantId: string) {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select("*").eq("plant_id", plantId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query.order("entry_at", { ascending: false }).limit(PLANT_RECENT_ACTIVITY_LIMIT);
  });

  if (error) throw error;
  return data ?? [];
}

export function usePlantRecentActivity(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_recent_activity", plantId ?? null],
    enabled: !!plantId,
    queryFn: () => fetchPlantRecentActivityRows(plantId as string),
  });
}
