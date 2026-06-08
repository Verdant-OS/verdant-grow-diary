/**
 * Read-only loader for the Quick Log sensor mini-chart.
 *
 * Pulls the most recent ~24h of long-format sensor_readings rows for a
 * single tent. RLS-only (no service role). Never writes. Empty / error /
 * loading never blocks Quick Log save.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MiniChartRawRow } from "@/lib/quickLogSensorMiniChartRules";

const ROW_LIMIT = 200;
const WINDOW_HOURS = 24;

export type RecentTentSensorSeriesStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

export interface RecentTentSensorSeriesState {
  status: RecentTentSensorSeriesStatus;
  rows: MiniChartRawRow[];
}

export function recentTentSensorSeriesQueryKey(
  tentId: string | null | undefined,
): readonly [string, string, string] {
  return ["sensor", "recent-series", tentId ?? "none"] as const;
}

export function useRecentTentSensorSeries(
  tentId: string | null | undefined,
): RecentTentSensorSeriesState {
  const enabled = typeof tentId === "string" && tentId.length > 0;

  const query = useQuery<MiniChartRawRow[]>({
    queryKey: recentTentSensorSeriesQueryKey(tentId),
    enabled,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("metric,value,captured_at,ts")
        .eq("tent_id", tentId as string)
        .gte("captured_at", sinceIso)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .limit(ROW_LIMIT);
      if (error) throw new Error("recent_tent_series_failed");
      return (data ?? []) as MiniChartRawRow[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!enabled) return { status: "idle", rows: [] };
  if (query.isLoading) return { status: "loading", rows: [] };
  if (query.isError) return { status: "error", rows: [] };
  const rows = query.data ?? [];
  if (rows.length === 0) return { status: "empty", rows: [] };
  return { status: "ready", rows };
}
