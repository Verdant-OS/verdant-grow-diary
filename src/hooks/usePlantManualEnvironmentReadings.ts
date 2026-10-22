import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import type { PlantTentReadingRow } from "@/hooks/usePlantTentLatestReadings";
import {
  PLANT_MANUAL_ENV_EVENT_LIMIT,
  PLANT_MANUAL_ENV_EVENT_SELECT,
  PLANT_MANUAL_ENV_EVENT_SOURCE,
  manualEnvironmentEventsToTentReadingRows,
  type PlantManualEnvEventRow,
} from "@/lib/plantManualEnvironmentEventRules";

/**
 * Quick Log manual readings for this plant, or tent-level ones, in this
 * tent. They are stored only in grow_events + environment_events, never in
 * sensor_readings, so the plant page reads them separately and merges them
 * into the sensor rows (mergePlantTentReadingsWithManualEvents). A failed
 * read leaves the sensor rows exactly as before.
 */
export function usePlantManualEnvironmentReadings(
  tentId: string | null | undefined,
  plantId: string | null | undefined,
): UseQueryResult<PlantTentReadingRow[]> {
  const { user } = useAuth();
  return useQuery({
    // Prefixed with "grow_events" so the frozen Quick Log post-save refresh
    // (applyQuickLogV2Refresh) and the correction/retraction invalidation
    // set, which both invalidate ["grow_events"], refetch this read without
    // a second refresh path.
    queryKey: [
      "grow_events",
      "plant-tent-manual-environment",
      tentId ?? "none",
      plantId ?? "none",
      user?.id ?? "anon",
    ],
    enabled: !!tentId && !!plantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grow_events")
        .select(PLANT_MANUAL_ENV_EVENT_SELECT)
        .eq("tent_id", tentId as string)
        .or(`plant_id.eq.${plantId as string},plant_id.is.null`)
        .eq("source", PLANT_MANUAL_ENV_EVENT_SOURCE)
        .eq("is_deleted", false)
        .eq("event_type", "environment")
        .order("occurred_at", { ascending: false })
        .limit(PLANT_MANUAL_ENV_EVENT_LIMIT);
      if (error) throw error;
      return manualEnvironmentEventsToTentReadingRows((data ?? []) as PlantManualEnvEventRow[]);
    },
  });
}
