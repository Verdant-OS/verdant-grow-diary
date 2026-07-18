import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SensorReadingRow } from "@/lib/db";
import { isUuid } from "@/lib/growRepo";

export function useSensorReadings(
  tentId?: string | null,
  limit = 200,
): UseQueryResult<SensorReadingRow[]> {
  // `undefined` intentionally preserves the existing all-tents query used by
  // aggregate dashboards. `null` is an explicit no-scope sentinel, while a
  // non-UUID legacy/mock id must never be sent to a UUID column.
  const enabled = tentId === undefined || isUuid(tentId);
  const scopeKey = tentId === null ? "none" : (tentId ?? "all");
  return useQuery({
    // Keep explicit no-scope separate from the intentional all-tents cache so
    // a disabled query can never surface aggregate readings from cache.
    queryKey: ["sensor_readings", scopeKey, limit],
    enabled,
    queryFn: async () => {
      if (!enabled) return [];
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
 * An optional explicit source filter is applied before the per-tent limit;
 * callers that need historical CSV evidence are therefore not starved by a
 * higher-volume live stream.
 * Read-only: no writes, no automation, no device control.
 */
export function useSensorReadingsByTents(
  tentIds: string[],
  perTentLimit = 200,
  sourceFilter?: readonly string[] | null,
): {
  byTent: Record<string, SensorReadingRow[]>;
  statusByTent: Record<string, TentSensorReadStatus>;
  isLoading: boolean;
  isError: boolean;
} {
  // Stable, de-duplicated id list so query order is deterministic and the
  // hook count is stable across renders for a given tent set.
  const ids = Array.from(new Set(tentIds)).sort();
  const sources = Array.from(
    new Set((sourceFilter ?? []).map((source) => source.trim().toLowerCase()).filter(Boolean)),
  ).sort();
  const results = useQueries({
    queries: ids.map((tentId) => ({
      queryKey: [
        "sensor_readings",
        tentId,
        perTentLimit,
        sources.length > 0 ? sources.join("|") : "all-sources",
      ],
      queryFn: async () => {
        let query = supabase.from("sensor_readings").select("*").eq("tent_id", tentId);
        // Apply source scope before ordering/limiting. This prevents a busy
        // live stream from crowding older imported history out of a bounded
        // CSV-only read window.
        if (sources.length > 0) {
          query = query.in("source", sources);
        }
        const { data, error } = await query
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
