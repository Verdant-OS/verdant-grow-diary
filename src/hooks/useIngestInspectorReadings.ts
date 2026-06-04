/**
 * Read-only hook for the Ingest Inspector surface.
 *
 * Queries `sensor_readings` only. Never reads bridge credentials,
 * encrypted columns, or any auth state. Never writes.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  INGEST_INSPECTOR_DEFAULT_WINDOW_MS,
  INGEST_INSPECTOR_MAX_ROWS,
  type InspectorReadingLike,
} from "@/lib/ingestInspectorRules";

export interface InspectorQueryResult {
  rows: InspectorReadingLike[];
  tentNames: Record<string, string>;
}

export function useIngestInspectorReadings(): UseQueryResult<InspectorQueryResult> {
  return useQuery({
    queryKey: ["ingest_inspector_readings"],
    queryFn: async (): Promise<InspectorQueryResult> => {
      const sinceIso = new Date(
        Date.now() - INGEST_INSPECTOR_DEFAULT_WINDOW_MS,
      ).toISOString();
      const { data, error } = await supabase
        .from("sensor_readings")
        .select(
          "id, ts, captured_at, source, metric, value, quality, tent_id, device_id, raw_payload",
        )
        .gte("ts", sinceIso)
        .order("ts", { ascending: false })
        .limit(INGEST_INSPECTOR_MAX_ROWS);
      if (error) throw error;
      const rows = (data ?? []) as unknown as InspectorReadingLike[];

      const tentIds = Array.from(
        new Set(rows.map((r) => r.tent_id).filter((v): v is string => !!v)),
      );
      const tentNames: Record<string, string> = {};
      if (tentIds.length > 0) {
        const { data: tents } = await supabase
          .from("tents")
          .select("id, name")
          .in("id", tentIds);
        for (const t of tents ?? []) {
          if (t && typeof t.id === "string" && typeof t.name === "string") {
            tentNames[t.id] = t.name;
          }
        }
      }
      return { rows, tentNames };
    },
    staleTime: 30_000,
  });
}
