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

interface SnapshotQueryResult {
  snapshot: SensorSnapshot;
  /**
   * The tent the winning reading actually came from, when known. Readings
   * sharing the snapshot's exact `ts` come from one ingest batch for one
   * tent (same assumption `snapshotFromReadings` already makes for
   * `device_id`), so this is unambiguous whenever a real reading won.
   * Null for the diary fallback when that row predates tent tracking, and
   * for the empty/unavailable cases.
   */
  tentId: string | null;
}

export type SnapshotState =
  | { status: "idle"; snapshot: SensorSnapshot; tentId?: string | null }
  | { status: "loading"; snapshot: SensorSnapshot; tentId?: string | null }
  | { status: "ok"; snapshot: SensorSnapshot; tentId?: string | null }
  | { status: "unavailable"; snapshot: SensorSnapshot; tentId?: string | null };

export function useLatestSensorSnapshot(
  growId: string | null | undefined,
  tentIds: string[],
): SnapshotState {
  const { user } = useAuth();
  const tentKey = tentIds.join("|");

  const query = useQuery<SnapshotQueryResult>({
    queryKey: ["latest-sensor-snapshot", user?.id ?? "anon", growId ?? "none", tentKey],
    enabled: !!user && !!growId,
    queryFn: async () => {
      try {
        // 1) Prefer live sensor_readings if any tents are scoped.
        if (tentIds.length > 0) {
          const { data, error } = await supabase
            .from("sensor_readings")
            .select("ts,metric,value,source,captured_at,tent_id,created_at,raw_payload")
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
                captured_at:
                  (r as { captured_at?: string | null }).captured_at ?? null,
                raw_payload: (r as { raw_payload?: unknown }).raw_payload,
              })),
            );
            if (snap) {
              const winningRow = data.find((r) => r.ts === snap.ts);
              return {
                snapshot: snap,
                tentId: (winningRow?.tent_id as string | null | undefined) ?? null,
              };
            }
          }
        }
        // 2) Fall back to latest diary_entries.details.sensor_snapshot.
        const { data: diaryRows, error: diaryErr } = await supabase
          .from("diary_entries")
          .select("entry_at,details,tent_id")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(20);
        if (diaryErr) throw diaryErr;
        for (const row of diaryRows ?? []) {
          const details = (row.details ?? null) as Record<string, unknown> | null;
          const snap =
            details && typeof details === "object"
              ? snapshotFromDiary(
                  row.entry_at,
                  details.sensor_snapshot as Record<string, unknown> | undefined,
                )
              : null;
          if (snap) {
            return {
              snapshot: snap,
              tentId: (row.tent_id as string | null | undefined) ?? null,
            };
          }
        }
        // 3) Nothing available.
        return { snapshot: EMPTY_SNAPSHOT, tentId: null };
      } catch {
        throw new Error("unavailable");
      }
    },
  });

  if (!user || !growId) {
    return { status: "idle", snapshot: EMPTY_SNAPSHOT, tentId: null };
  }
  if (query.isLoading || query.isFetching && !query.data) {
    return { status: "loading", snapshot: EMPTY_SNAPSHOT, tentId: null };
  }
  if (query.isError) {
    return { status: "unavailable", snapshot: EMPTY_SNAPSHOT, tentId: null };
  }
  return {
    status: "ok",
    snapshot: query.data?.snapshot ?? EMPTY_SNAPSHOT,
    tentId: query.data?.tentId ?? null,
  };
}

export default useLatestSensorSnapshot;
