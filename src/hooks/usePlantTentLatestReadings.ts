/**
 * usePlantTentLatestReadings — read-only loader for the Plant Detail
 * "Assigned Tent Environment" panel. Returns the latest sensor_readings
 * rows for a single assigned tent id, scoped by that tent id only.
 *
 * No writes. No alerts. No action_queue. No device control. No automation.
 * Disabled when no tentId is provided so unassigned plants never query.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlantTentReadingRow {
  ts: string;
  metric: string;
  value: number | string | null;
  source: string | null;
}

export function usePlantTentLatestReadings(
  tentId: string | null | undefined,
): UseQueryResult<PlantTentReadingRow[]> {
  return useQuery({
    queryKey: ["plant-tent-environment", tentId ?? "none"],
    enabled: !!tentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("ts,metric,value,source")
        .eq("tent_id", tentId as string)
        .order("ts", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PlantTentReadingRow[];
    },
  });
}
