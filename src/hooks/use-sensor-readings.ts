import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SensorReadingRow } from "@/lib/db";

export function useSensorReadings(
  tentId?: string,
  limit = 200,
): UseQueryResult<SensorReadingRow[]> {
  return useQuery({
    queryKey: ["sensor_readings", tentId ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("sensor_readings")
        .select("*")
        // Deterministic latest-first ordering with `created_at` as a
        // tie-breaker so multi-metric manual entries (which share `ts`)
        // come back in a stable, repeatable order.
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (tentId) q = q.eq("tent_id", tentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SensorReadingRow[];
    },
  });
}
