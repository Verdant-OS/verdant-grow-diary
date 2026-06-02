/**
 * Read-only hook for the Sensor Bridge Health surface.
 *
 * Queries `sensor_ingest_audit_log` (RLS-scoped to auth.uid()) using a
 * narrow column allowlist of audit counts and timestamps only. Never
 * writes.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSensorBridgeHealthViewModel,
  type SensorBridgeHealthViewModel,
} from "@/lib/sensorBridgeHealthViewModel";

const AUDIT_LIMIT = 20;

export function useSensorBridgeHealth(): UseQueryResult<SensorBridgeHealthViewModel> {
  return useQuery({
    queryKey: ["sensor_bridge_health"],
    queryFn: async (): Promise<SensorBridgeHealthViewModel> => {
      const { data, error } = await supabase
        .from("sensor_ingest_audit_log")
        .select("source, auth_type, rows_received, rows_inserted, captured_at, created_at")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LIMIT);
      if (error) throw error;
      return buildSensorBridgeHealthViewModel({ rows: data ?? [] });
    },
    staleTime: 30_000,
  });
}
