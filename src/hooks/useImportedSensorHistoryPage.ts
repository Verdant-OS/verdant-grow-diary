/** Bounded, read-only CSV history browsing. Existing AI/newest reads stay separate. */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";
import { AI_DOCTOR_CSV_HISTORY_SOURCES, isCsvHistoryRow } from "@/lib/aiDoctorCsvHistoryContextRules";
import type { ImportedSensorHistoryRow } from "@/hooks/useImportedSensorHistory";
import {
  IMPORTED_SENSOR_HISTORY_PAGE_SIZE,
  normalizeImportedSensorHistorySelection,
  type ImportedSensorHistorySelection,
} from "@/lib/importedSensorHistoryPageRules";

export type ImportedSensorHistoryPageRow = Omit<ImportedSensorHistoryRow, "raw_payload">;
export interface ImportedSensorHistoryPage {
  rows: ImportedSensorHistoryPageRow[];
  /** Only rows visible to the authenticated database role in this selection. */
  total: number;
}

export const IMPORTED_SENSOR_HISTORY_PAGE_SELECT =
  "id,tent_id,source,metric,value,quality,ts,captured_at,created_at" as const;

export async function fetchImportedSensorHistoryPage(
  tentId: string,
  input: Partial<ImportedSensorHistorySelection> = {},
): Promise<ImportedSensorHistoryPage> {
  const tent = typeof tentId === "string" ? tentId.trim() : "";
  const window = normalizeImportedSensorHistorySelection(input);
  if (!tent || window.error) throw new Error(window.error ?? "Select a tent to browse CSV history.");

  let query = supabase
    .from("sensor_readings")
    .select(IMPORTED_SENSOR_HISTORY_PAGE_SELECT, { count: "exact" })
    .eq("tent_id", tent)
    .in("source", [...AI_DOCTOR_CSV_HISTORY_SOURCES]);
  if (window.startAt) query = query.gte("captured_at", window.startAt);
  if (window.endBefore) query = query.lt("captured_at", window.endBefore);
  const { data, error, count } = await query
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("metric", { ascending: true })
    .order("id", { ascending: true })
    .range(window.offset, window.offset + IMPORTED_SENSOR_HISTORY_PAGE_SIZE - 1);

  if (error) throw error;
  if (
    !Array.isArray(data) ||
    data.length > IMPORTED_SENSOR_HISTORY_PAGE_SIZE ||
    !Number.isSafeInteger(count) ||
    count === null ||
    count < data.length ||
    data.some((row) => !row || row.tent_id !== tent || !isCsvHistoryRow(row))
  ) {
    throw new Error("Imported history page or count unavailable.");
  }
  return { rows: data as ImportedSensorHistoryPageRow[], total: count };
}

export function useImportedSensorHistoryPage(
  tentId: string,
  input: Partial<ImportedSensorHistorySelection>,
) {
  const { user } = useAuth();
  const window = normalizeImportedSensorHistorySelection(input);
  const tent = typeof tentId === "string" ? tentId.trim() : "";
  return useQuery({
    queryKey: buildPrivateSensorQueryKey(user?.id, [
      "imported_history_page",
      tent || "missing-tent",
      window.selection.fromDate,
      window.selection.throughDate,
      window.selection.page,
      AI_DOCTOR_CSV_HISTORY_SOURCES.join("|"),
    ]),
    enabled: !!user?.id && !!tent && !window.error,
    retry: false,
    // Do not carry rows or totals between accounts, tents or selected windows.
    gcTime: 0,
    queryFn: () => fetchImportedSensorHistoryPage(tent, window.selection),
  });
}
