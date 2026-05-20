/**
 * useLatestSensorSnapshot — read-only Supabase loader for the scoped Dashboard
 * "Latest Environment" card.
 *
 * Data source priority:
 *  1. latest sensor_readings rows for the scoped grow's tents (if any)
 *  2. latest diary_entries.details.sensor_snapshot for the scoped grow
 *  3. otherwise EMPTY_SNAPSHOT (rendered as "No sensor data yet.")
 *
 * Read-only: no .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No device-control surface. No elevated keys. RLS enforces ownership.
 */
import { useCallback, useEffect, useState } from "react";
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
  const [state, setState] = useState<SnapshotState>({
    status: "idle",
    snapshot: EMPTY_SNAPSHOT,
  });
  // Stable dependency: tent ids are short uuid strings, joining is fine.
  const tentKey = tentIds.join("|");

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ status: "idle", snapshot: EMPTY_SNAPSHOT });
      return;
    }
    setState({ status: "loading", snapshot: EMPTY_SNAPSHOT });

    try {
      // 1) Prefer live sensor_readings if any tents are scoped.
      if (tentIds.length > 0) {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select("ts,metric,value,source,tent_id")
          .in("tent_id", tentIds)
          .order("ts", { ascending: false })
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
          if (snap) {
            setState({ status: "ok", snapshot: snap });
            return;
          }
        }
        if (error) {
          // Fall through to diary fallback; don't crash.
        }
      }

      // 2) Fall back to latest diary_entries.details.sensor_snapshot.
      const { data: diaryRows, error: diaryErr } = await supabase
        .from("diary_entries")
        .select("entry_at,details")
        .eq("grow_id", growId)
        .order("entry_at", { ascending: false })
        .limit(20);
      if (diaryErr) {
        setState({ status: "unavailable", snapshot: EMPTY_SNAPSHOT });
        return;
      }
      for (const row of diaryRows ?? []) {
        const details = (row.details ?? null) as Record<string, unknown> | null;
        const snap = details && typeof details === "object"
          ? snapshotFromDiary(
              row.entry_at,
              details.sensor_snapshot as Record<string, unknown> | undefined,
            )
          : null;
        if (snap) {
          setState({ status: "ok", snapshot: snap });
          return;
        }
      }

      // 3) Nothing available.
      setState({ status: "ok", snapshot: EMPTY_SNAPSHOT });
    } catch {
      setState({ status: "unavailable", snapshot: EMPTY_SNAPSHOT });
    }
    // tentKey ensures we re-fetch when the underlying tent ids change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, growId, tentKey]);


  useEffect(() => {
    load();
  }, [load]);

  return state;
}

export default useLatestSensorSnapshot;
