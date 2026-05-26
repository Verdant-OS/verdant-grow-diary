/**
 * Read-only hook: latest manually-logged sensor value per metric for one plant.
 *
 * Reads from the same `diary_entries` table QuickLog writes to. Walks recent
 * entries newest-first and picks the first non-null value per metric inside
 * `details.manual_sensor_snapshot` (source = "manual"). Never blends with
 * live readings, demo data, or other plants.
 *
 * Safety contract:
 *  - No writes. No alerts. No action_queue. No AI.
 *  - Only considers entries with details.manual_sensor_snapshot.source === "manual".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  LatestManualReading,
  ManualSensorMetric,
} from "@/lib/manualSensorFreshnessRules";
import { MANUAL_SENSOR_METRICS } from "@/lib/manualSensorFreshnessRules";

export const PLANT_MANUAL_SENSOR_HISTORY_LIMIT = 30;

export type PlantManualSensorHistory = Record<
  ManualSensorMetric,
  LatestManualReading | null
>;

interface DiaryRow {
  entry_at: string;
  details: unknown;
}

interface ManualSnapshot {
  temp_f?: number | null;
  humidity_percent?: number | null;
  ph?: number | null;
  ec?: number | null;
  source?: string;
}

function readSnapshot(details: unknown): ManualSnapshot | null {
  if (!details || typeof details !== "object") return null;
  const snap = (details as { manual_sensor_snapshot?: unknown })
    .manual_sensor_snapshot;
  if (!snap || typeof snap !== "object") return null;
  if ((snap as ManualSnapshot).source !== "manual") return null;
  return snap as ManualSnapshot;
}

export function deriveLatestManualReadings(
  rows: ReadonlyArray<DiaryRow>,
): PlantManualSensorHistory {
  const out: PlantManualSensorHistory = {
    temp_f: null,
    humidity_percent: null,
    ph: null,
    ec: null,
  };
  // Rows arrive newest-first; keep the first finite value seen per metric.
  for (const row of rows) {
    const snap = readSnapshot(row.details);
    if (!snap) continue;
    for (const m of MANUAL_SENSOR_METRICS) {
      if (out[m] !== null) continue;
      const raw = snap[m];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        out[m] = { value: raw, loggedAt: row.entry_at };
      }
    }
    if (MANUAL_SENSOR_METRICS.every((m) => out[m] !== null)) break;
  }
  return out;
}

export function usePlantManualSensorHistory(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_manual_sensor_history", plantId ?? null],
    enabled: !!plantId,
    queryFn: async (): Promise<PlantManualSensorHistory> => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("entry_at, details")
        .eq("plant_id", plantId as string)
        .order("entry_at", { ascending: false })
        .limit(PLANT_MANUAL_SENSOR_HISTORY_LIMIT);
      if (error) throw error;
      return deriveLatestManualReadings((data ?? []) as DiaryRow[]);
    },
  });
}
