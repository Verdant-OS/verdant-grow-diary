/**
 * Read-only hook for the Pi Ingest Status surface.
 *
 * Queries `sensor_readings` filtered by `source = "pi_bridge"` only.
 * Does NOT read bridge secrets or any encrypted columns. Does NOT write.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PI_INGEST_SOURCE,
  PI_INGEST_7D_MS,
  computePiIngestStatus,
  type PiIngestStatusSummary,
} from "@/lib/piIngestStatusRules";

export interface PiIngestStatusQueryResult {
  summary: PiIngestStatusSummary;
  latestTentName: string | null;
}

export function usePiIngestStatus(): UseQueryResult<PiIngestStatusQueryResult> {
  return useQuery({
    queryKey: ["pi_ingest_status"],
    queryFn: async (): Promise<PiIngestStatusQueryResult> => {
      const sinceIso = new Date(Date.now() - PI_INGEST_7D_MS).toISOString();
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("ts, metric, source, tent_id")
        .eq("source", PI_INGEST_SOURCE)
        .gte("ts", sinceIso)
        .order("ts", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = data ?? [];
      const summary = computePiIngestStatus(rows);

      let latestTentName: string | null = null;
      if (summary.latestTentId) {
        const { data: tent } = await supabase
          .from("tents")
          .select("name")
          .eq("id", summary.latestTentId)
          .maybeSingle();
        latestTentName = tent?.name ?? null;
      }
      return { summary, latestTentName };
    },
    staleTime: 30_000,
  });
}
