/**
 * Dedicated read path for tent-scoped imported sensor history.
 *
 * CSV imports preserve the grower's historical observation time in
 * `captured_at`; `ts` may instead reflect the database default at import
 * time. This query therefore filters to the bounded, explicit CSV source
 * allowlist before applying its cap and orders by `captured_at` first.
 *
 * Read-only. No writes, alerts, automation, Action Queue, or device control.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SensorReadingRow } from "@/lib/db";
import { AI_DOCTOR_CSV_HISTORY_SOURCES } from "@/lib/aiDoctorCsvHistoryContextRules";

export const IMPORTED_SENSOR_HISTORY_QUERY_LIMIT = 200;

export const IMPORTED_SENSOR_HISTORY_SELECT =
  "id,tent_id,source,metric,value,quality,ts,captured_at,created_at,raw_payload" as const;

export type ImportedSensorHistoryRow = Pick<
  SensorReadingRow,
  | "id"
  | "tent_id"
  | "source"
  | "metric"
  | "value"
  | "quality"
  | "ts"
  | "captured_at"
  | "created_at"
  | "raw_payload"
>;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return IMPORTED_SENSOR_HISTORY_QUERY_LIMIT;
  return Math.min(IMPORTED_SENSOR_HISTORY_QUERY_LIMIT, Math.max(1, Math.floor(limit)));
}

export async function fetchImportedSensorHistory(
  tentId: string,
  limit = IMPORTED_SENSOR_HISTORY_QUERY_LIMIT,
): Promise<ImportedSensorHistoryRow[]> {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select(IMPORTED_SENSOR_HISTORY_SELECT)
    .eq("tent_id", tentId)
    // Source scope MUST precede the bounded window: a high-volume live or
    // manual stream must never crowd imported history out of this result.
    .in("source", [...AI_DOCTOR_CSV_HISTORY_SOURCES])
    // Historical observation time is canonical for imported rows. Keep null
    // values at the end and use stable, schema-backed tie-breakers.
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("metric", { ascending: true })
    .order("id", { ascending: true })
    .limit(normalizeLimit(limit));

  if (error) throw error;
  return (data ?? []) as ImportedSensorHistoryRow[];
}

export function useImportedSensorHistory(
  tentId: string | null | undefined,
  limit = IMPORTED_SENSOR_HISTORY_QUERY_LIMIT,
): UseQueryResult<ImportedSensorHistoryRow[]> {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedTentId = typeof tentId === "string" ? tentId.trim() : "";

  return useQuery({
    queryKey: [
      "sensor_readings",
      "imported_history",
      normalizedTentId || "missing-tent",
      normalizedLimit,
      AI_DOCTOR_CSV_HISTORY_SOURCES.join("|"),
    ],
    enabled: normalizedTentId.length > 0,
    queryFn: () => fetchImportedSensorHistory(normalizedTentId, normalizedLimit),
  });
}
