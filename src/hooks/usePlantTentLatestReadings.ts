/**
 * usePlantTentLatestReadings — read-only loader for the Plant Detail
 * "Assigned Tent Environment" panel. Returns the latest sensor_readings
 * rows for a single assigned tent id, scoped by that tent id only.
 *
 * Read-only loader; disabled when no tentId is provided so unassigned
 * plants never trigger a query.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import {
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
  EFFECTIVE_SENSOR_QUERY_VERSION,
} from "@/lib/effectiveSensorReadings";

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
  const { user } = useAuth();
  return useQuery({
    queryKey: [
      "plant-tent-environment",
      tentId ?? "none",
      EFFECTIVE_SENSOR_QUERY_VERSION,
      user?.id ?? "anon",
    ],
    enabled: !!tentId,
    queryFn: async () => {
      const { data, error } = await effectiveSensorReadingsQuery()
        .select("*")
        // Actual observation time takes precedence: imported CSV rows preserve historical
        // `captured_at` while `ts` can be one shared import time.
        .eq("tent_id", tentId as string)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return requireEffectiveSensorReadings(data);
    },
  });
}
