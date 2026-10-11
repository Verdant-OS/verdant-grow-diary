/**
 * useEnvironmentTrends — read-only Supabase loader for the scoped Dashboard
 * "Environment Trends" card.
 *
 * Source priority:
 *  1. sensor_readings for the scoped grow's tents (latest 24h, fallback 20 rows)
 *  2. diary_entries.details.sensor_snapshot for the scoped grow, tent-scoped
 *     when tentIds is non-empty (#602 — same fail-closed attribution as
 *     useLatestSensorSnapshot)
 *
 * Read-only. No .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No external-control surface. No elevated keys. RLS enforces ownership.
 */
import { useQuery } from "@tanstack/react-query";
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
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

import {
  EFFECTIVE_SENSOR_QUERY_VERSION,
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
} from "@/lib/effectiveSensorReadings";

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

  const tentKey = tentIds.join("|");
  const query = useQuery<EnvironmentTrends>({
    queryKey: [
      "environment-trends",
      user?.id ?? "anon",
      growId ?? "none",
      tentKey,
      EFFECTIVE_SENSOR_QUERY_VERSION,
    ],
    enabled: !!user && !!growId,
    retry: false,
    queryFn: async () => {
      if (!user || !growId) return EMPTY_TRENDS;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let sensorReadFailed = false;
      if (tentIds.length > 0) {
        try {
          // Keep the current window first, then the established historical
          // fallback only after a successfully completed empty window read.
          for (const limit of [500, 60]) {
            let readingsQuery = effectiveSensorReadingsQuery()
              .select("*")
              .in("tent_id", tentIds)
              .in("metric", ["temperature_c", "humidity_pct", "vpd_kpa"]);
            if (limit === 500) {
              readingsQuery = readingsQuery.or(
                `captured_at.gte.${since},and(captured_at.is.null,ts.gte.${since})`,
              );
            }
            const { data, error } = await readingsQuery
              .order("captured_at", { ascending: false, nullsFirst: false })
              .order("ts", { ascending: false })
              .limit(limit);
            if (error) throw error;
            const readings = requireEffectiveSensorReadings(data);
            const samples = samplesFromReadings(
              readings.map((r) => ({
                ts: r.ts,
                captured_at: r.captured_at,
                metric: r.metric,
                value: r.value,
                source: r.source,
                tent_id: r.tent_id,
                raw_payload: r.raw_payload,
              })),
            );
            if (samples.length > 0) return computeEnvironmentTrends(selectWindow(samples));
            if (readings.length > 0) break;
          }
        } catch {
          sensorReadFailed = true;
        }
      }
      const { data: diaryRows, error: diaryErr } = await selectWithRetractionCompat(
        (withRetractionFilter) => {
          let query = supabase.from("diary_entries").select("entry_at,details,tent_id");
          if (withRetractionFilter) query = query.is("retracted_at", null);
          return query.eq("grow_id", growId).order("entry_at", { ascending: false }).limit(50);
        },
      );
      if (diaryErr || !Array.isArray(diaryRows)) throw new Error("unavailable");
      const scopedDiaryRows = diaryRows.filter((r) => isDiaryRowInTentScope(r.tent_id, tentIds));
      const diarySamples = samplesFromDiary(
        scopedDiaryRows.map((r) => ({
          entry_at: r.entry_at,
          details: r.details as Record<string, unknown> | null | undefined,
        })),
      );
      const trends = computeEnvironmentTrends(selectWindow(diarySamples));
      if (sensorReadFailed && trends.count === 0) throw new Error("unavailable");
      return trends;
    },
  });
  if (!user || !growId) return { status: "idle", trends: EMPTY_TRENDS };
  // Withhold a cached trend while its correction refresh is pending or paused.
  // Query ownership also keeps late results isolated from the selected scope.
  if (query.isPending || query.isFetching || query.isPaused) {
    return { status: "loading", trends: EMPTY_TRENDS };
  }
  if (query.isError) return { status: "unavailable", trends: EMPTY_TRENDS };
  return { status: "ok", trends: query.data };
}

export default useEnvironmentTrends;
