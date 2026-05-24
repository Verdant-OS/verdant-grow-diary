/**
 * useLatestSensorSnapshot — read-only Supabase loader for the scoped Dashboard
 * "Latest Environment" card.
 *
 * Data source priority:
 *  1. latest sensor_readings rows for the scoped grow's tents (if any)
 *  2. latest diary_entries.details.sensor_snapshot for the scoped grow
 *  3. otherwise EMPTY_SNAPSHOT (rendered as "No sensor data yet.")
 *
 * Backed by TanStack Query so manual sensor inserts that invalidate
 * `["latest-sensor-snapshot"]` (or `["sensor_readings"]`) trigger a refetch
 * without a hard refresh. Sort uses `ts desc, created_at desc` as a
 * deterministic tie-breaker for rows sharing a timestamp (multi-metric
 * manual entries always share `ts`).
 *
 * Read-only: no .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No device-control surface. No elevated keys. RLS enforces ownership.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  EMPTY_SNAPSHOT,
  type SensorSnapshot,
  snapshotFromDiary,
  snapshotFromReadings,
} from "@/lib/sensorSnapshot";

export type SnapshotState =
  | { status: "idle"; snapshot: SensorSnapshot }
  | { status: "loading"; snapshot: SensorSnapshot }
  | { status: "ok"; snapshot: SensorSnapshot }
  | { status: "unavailable"; snapshot: SensorSnapshot };

export function useLatestSensorSnapshot(
  growId: string | null | undefined,
  tentIds: string[],
): SnapshotState {
  const { user } = useAuth();
  const tentKey = tentIds.join("|");

  const query = useQuery<SensorSnapshot>({
    queryKey: ["latest-sensor-snapshot", user?.id ?? "anon", growId ?? "none", tentKey],
    enabled: !!user && !!growId,
    queryFn: async () => {
      // 1) Prefer live sensor_readings if any tents are scoped.
      if (tentIds.length > 0) {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select("ts,metric,value,source,tent_id,created_at")
          .in("tent_id", tentIds)
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);
        if (!error && data && data.length > 0) {
          const snap = snapshotFromReadings(
            data.map((r) => ({
              ts: r.ts,
              metric: r.metric,
              value: r.value as number | string | null,
              source: r.source as string | null,
            })),
          );
          if (snap) return snap;
        }
      }
      // 2) Fall back to latest diary_entries.details.sensor_snapshot.
      const { data: diaryRows, error: diaryErr } = await supabase
        .from("diary_entries")
        .select("entry_at,details")
        .eq("grow_id", growId as string)
        .order("entry_at", { ascending: false })
        .limit(20);
      if (diaryErr) return EMPTY_SNAPSHOT;
      for (const row of diaryRows ?? []) {
        const details = (row.details ?? null) as Record<string, unknown> | null;
        const snap =
          details && typeof details === "object"
            ? snapshotFromDiary(
                row.entry_at,
                details.sensor_snapshot as Record<string, unknown> | undefined,
              )
            : null;
        if (snap) return snap;
      }
      // 3) Nothing available.
      return EMPTY_SNAPSHOT;
    },
  });

  if (!user || !growId) {
    return { status: "idle", snapshot: EMPTY_SNAPSHOT };
  }
  if (query.isLoading || query.isFetching && !query.data) {
    return { status: "loading", snapshot: EMPTY_SNAPSHOT };
  }
  if (query.isError) {
    return { status: "unavailable", snapshot: EMPTY_SNAPSHOT };
  }
  return { status: "ok", snapshot: query.data ?? EMPTY_SNAPSHOT };
}

export default useLatestSensorSnapshot;
