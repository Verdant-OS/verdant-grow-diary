import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
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

/** Per-tent fetch outcome so consumers can tell "no rows" from "not loaded". */
export type TentSensorReadStatus = "loading" | "error" | "success";

/**
 * Per-tent sensor reading fetch. Each tent gets its own `limit`-bounded
 * window so a busy tent cannot starve another tent's readings out of a
 * shared global cap (which previously made Dashboard stability summaries
 * report "unavailable" even when valid VPD rows existed for the tent).
 *
 * Returns a map keyed by tentId. Tents with no rows map to `[]`.
 * `statusByTent` distinguishes a genuinely empty result ("success" + [])
 * from a pending or failed request — SENSOR TRUTH: absence must be
 * established, never assumed from an unset slot.
 * Read-only: no writes, no automation, no device control.
 */
export function useSensorReadingsByTents(
  tentIds: string[],
  perTentLimit = 200,
): {
  byTent: Record<string, SensorReadingRow[]>;
  statusByTent: Record<string, TentSensorReadStatus>;
  isLoading: boolean;
  isError: boolean;
} {
  // Stable, de-duplicated id list so query order is deterministic and the
  // hook count is stable across renders for a given tent set.
  const ids = Array.from(new Set(tentIds)).sort();
  const results = useQueries({
    queries: ids.map((tentId) => ({
      queryKey: ["sensor_readings", tentId, perTentLimit],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select("*")
          .eq("tent_id", tentId)
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(perTentLimit);
        if (error) throw error;
        return (data ?? []) as SensorReadingRow[];
      },
    })),
  });
  const byTent: Record<string, SensorReadingRow[]> = {};
  const statusByTent: Record<string, TentSensorReadStatus> = {};
  ids.forEach((id, i) => {
    byTent[id] = (results[i]?.data as SensorReadingRow[] | undefined) ?? [];
    statusByTent[id] = results[i]?.isLoading
      ? "loading"
      : results[i]?.isError
        ? "error"
        : "success";
  });
  return {
    byTent,
    statusByTent,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
