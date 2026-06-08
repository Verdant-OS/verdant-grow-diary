/**
 * sensor — narrowly scoped, read-only Supabase loaders for Quick Log /
 * Diary surfaces. Keeps the existing `src/hooks/useLatestSensorSnapshot`
 * (which is grow + tents[] scoped for the dashboard card) untouched, and
 * adds a single-tent loader purpose-built for Quick Log auto-attach.
 *
 * Boundaries:
 *  - Read-only: no `.insert/.update/.delete/.upsert/.rpc`, no edge invokes.
 *  - Respects RLS via the normal authenticated client.
 *  - No service role, no privileged query.
 *  - No fake live / demo fallback. Empty / loading / error never block save.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSensorSnapshot,
  EMPTY_SENSOR_SNAPSHOT,
  type RawSensorRow,
  type SensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

export type LatestTentSensorSnapshotStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export interface LatestTentSensorSnapshotState {
  status: LatestTentSensorSnapshotStatus;
  snapshot: SensorSnapshot;
}

/** Pull recent long-format rows so we can pivot to a single snapshot. */
const ROW_FETCH_LIMIT = 50;

/** Stable React Query key for the latest single-tent sensor snapshot. */
export function latestTentSensorSnapshotQueryKey(
  tentId: string | null | undefined,
): readonly [string, string, string] {
  return ["sensor", "latest", tentId ?? "none"] as const;
}

/**
 * Read-only loader that returns the freshest sensor snapshot for a single
 * tent, pivoted from the long-format `sensor_readings` table. Quick Log
 * uses this to auto-attach the latest conditions when plant/tent context
 * exists. Idle when there is no tentId.
 *
 * Subscribes to Supabase Realtime INSERTs on `sensor_readings` filtered by
 * the active `tent_id`. A matching insert only invalidates the React Query
 * cache; freshness/source/status resolution stays in
 * `latestSensorSnapshotRules.ts`. Realtime errors never break the query.
 */
export function useLatestTentSensorSnapshot(
  tentId: string | null | undefined,
): LatestTentSensorSnapshotState {
  const enabled =
    typeof tentId === "string" && tentId.length > 0;

  const queryClient = useQueryClient();

  const query = useQuery<RawSensorRow[]>({
    queryKey: latestTentSensorSnapshotQueryKey(tentId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select(
          "id,tent_id,metric,value,source,quality,captured_at,ts,created_at,raw_payload",
        )
        .eq("tent_id", tentId as string)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(ROW_FETCH_LIMIT);
      if (error) throw new Error("latest_tent_snapshot_failed");
      return (data ?? []) as RawSensorRow[];
    },
    staleTime: 1000 * 25,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });

  useEffect(() => {
    if (!enabled) return;
    const activeTentId = tentId as string;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`sensor-readings-latest:${activeTentId}`)
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "sensor_readings",
            filter: `tent_id=eq.${activeTentId}`,
          },
          () => {
            queryClient.invalidateQueries({
              queryKey: latestTentSensorSnapshotQueryKey(activeTentId),
            });
          },
        )
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* no-op: realtime failure must never break query */
        }
      }
    };
  }, [enabled, tentId, queryClient]);

  if (!enabled) return { status: "idle", snapshot: EMPTY_SENSOR_SNAPSHOT };
  if (query.isLoading) return { status: "loading", snapshot: EMPTY_SENSOR_SNAPSHOT };
  if (query.isError) return { status: "error", snapshot: EMPTY_SENSOR_SNAPSHOT };
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return { status: "empty", snapshot: { ...EMPTY_SENSOR_SNAPSHOT, tent_id: tentId ?? null } };
  }
  return {
    status: "ready",
    snapshot: buildSensorSnapshot(rows, { tentId: tentId ?? null }),
  };
}

export default useLatestTentSensorSnapshot;
