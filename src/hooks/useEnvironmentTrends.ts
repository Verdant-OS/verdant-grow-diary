/**
 * useEnvironmentTrends — read-only Supabase loader for the scoped Dashboard
 * "Environment Trends" card.
 *
 * Source priority:
 *  1. sensor_readings for the scoped grow's tents (latest 24h, fallback 20 rows)
 *  2. diary_entries.details.sensor_snapshot for the scoped grow
 *
 * Read-only. No .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No external-control surface. No elevated keys. RLS enforces ownership.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  EMPTY_TRENDS,
  type EnvironmentTrends,
  computeEnvironmentTrends,
  samplesFromDiary,
  samplesFromReadings,
  selectWindow,
} from "@/lib/environmentTrends";

export type TrendsState =
  | { status: "idle"; trends: EnvironmentTrends }
  | { status: "loading"; trends: EnvironmentTrends }
  | { status: "ok"; trends: EnvironmentTrends }
  | { status: "unavailable"; trends: EnvironmentTrends };

export function useEnvironmentTrends(
  growId: string | null | undefined,
  tentIds: string[],
): TrendsState {
  const { user } = useAuth();
  const [state, setState] = useState<TrendsState>({
    status: "idle",
    trends: EMPTY_TRENDS,
  });
  const tentKey = tentIds.join("|");

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ status: "idle", trends: EMPTY_TRENDS });
      return;
    }
    setState({ status: "loading", trends: EMPTY_TRENDS });

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      if (tentIds.length > 0) {
        const { data, error } = await supabase
          .from("sensor_readings")
          .select("ts,captured_at,metric,value,source,tent_id,raw_payload")
          .in("tent_id", tentIds)
          .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"])
          // Current-window filtering uses physical observation time. Legacy
          // rows without `captured_at` retain their established `ts` fallback.
          .or(`captured_at.gte.${since},and(captured_at.is.null,ts.gte.${since})`)
          .order("captured_at", { ascending: false, nullsFirst: false })
          .order("ts", { ascending: false })
          .limit(500);
        if (!error && data && data.length > 0) {
          const samples = samplesFromReadings(
            data.map((r) => ({
              ts: r.ts,
              captured_at: (r as { captured_at?: string | null }).captured_at ?? null,
              metric: r.metric,
              value: r.value as number | string | null,
              source: r.source as string | null,
              tent_id: r.tent_id as string | null,
              raw_payload: r.raw_payload,
            })),
          );
          if (samples.length > 0) {
            const windowed = selectWindow(samples);
            setState({
              status: "ok",
              trends: computeEnvironmentTrends(windowed),
            });
            return;
          }
        }
        if (!error && (!data || data.length === 0)) {
          // Try a broader fetch without the time window so we can fall back
          // to "latest 20 readings" if no 24h data exists.
          const { data: any20, error: err20 } = await supabase
            .from("sensor_readings")
            .select("ts,captured_at,metric,value,source,tent_id,raw_payload")
            .in("tent_id", tentIds)
            .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"])
            .order("captured_at", { ascending: false, nullsFirst: false })
            .order("ts", { ascending: false })
            .limit(60);
          if (!err20 && any20 && any20.length > 0) {
            const samples = samplesFromReadings(
              any20.map((r) => ({
                ts: r.ts,
                captured_at: (r as { captured_at?: string | null }).captured_at ?? null,
                metric: r.metric,
                value: r.value as number | string | null,
                source: r.source as string | null,
                tent_id: r.tent_id as string | null,
                raw_payload: r.raw_payload,
              })),
            );
            if (samples.length > 0) {
              const windowed = selectWindow(samples);
              setState({
                status: "ok",
                trends: computeEnvironmentTrends(windowed),
              });
              return;
            }
          }
        }
      }

      const { data: diaryRows, error: diaryErr } = await supabase
        .from("diary_entries")
        .select("entry_at,details")
        .eq("grow_id", growId)
        .order("entry_at", { ascending: false })
        .limit(50);
      if (diaryErr) {
        setState({ status: "unavailable", trends: EMPTY_TRENDS });
        return;
      }
      const diarySamples = samplesFromDiary(
        (diaryRows ?? []).map((r) => ({
          entry_at: r.entry_at,
          details: r.details as Record<string, unknown> | null | undefined,
        })),
      );
      const windowed = selectWindow(diarySamples);
      setState({ status: "ok", trends: computeEnvironmentTrends(windowed) });
    } catch {
      setState({ status: "unavailable", trends: EMPTY_TRENDS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, growId, tentKey]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}

export default useEnvironmentTrends;
