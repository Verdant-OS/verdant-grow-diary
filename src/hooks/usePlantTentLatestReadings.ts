/**
 * usePlantTentLatestReadings — read-only loader for the Plant Detail
 * "Assigned Tent Environment" panel. Returns the latest sensor_readings
 * rows for a single assigned tent id, scoped by that tent id only.
 *
 * Read-only loader; disabled when no tentId is provided so unassigned
 * plants never trigger a query.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlantTentReadingRow {
  ts: string;
  /** Actual observation time when an imported row preserves it. */
  captured_at?: string | null;
  metric: string;
  value: number | string | null;
  source: string | null;
  device_id?: string | null;
  raw_payload?: unknown;
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
        .select("ts,captured_at,metric,value,source,created_at,device_id,raw_payload")
        // Actual observation time leads: imported CSV rows preserve historical
        // `captured_at` while `ts` can be one shared import time.
        .eq("tent_id", tentId as string)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PlantTentReadingRow[];
    },
  });
}
