/**
 * Read-only hooks for a plant's manually-logged sensor history.
 *
 * - `usePlantManualSensorHistory` returns the latest non-null value per metric
 *   (drives the Manual Sensor Memory freshness card).
 * - `usePlantManualSensorLogs` returns the full chronological list of manual
 *   logs (drives the Quick Log chronology-aware delta helper).
 *
 * Both read from the same `diary_entries` table QuickLog writes to and only
 * consider entries with details.manual_sensor_snapshot.source === "manual".
 * Never blends with live readings, demo data, or other plants.
 *
 * Safety contract:
 *  - No writes. No alerts. No action_queue. No AI.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  LatestManualReading,
  ManualSensorMetric,
} from "@/lib/manualSensorFreshnessRules";
import { MANUAL_SENSOR_METRICS } from "@/lib/manualSensorFreshnessRules";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";
import { MANUAL_SOURCE } from "@/lib/manualSensorChronologyDeltaRules";

export const PLANT_MANUAL_SENSOR_HISTORY_LIMIT = 30;

export type PlantManualSensorHistory = Record<
  ManualSensorMetric,
  LatestManualReading | null
>;

interface DiaryRow {
  id?: string;
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
  if ((snap as ManualSnapshot).source !== MANUAL_SOURCE) return null;
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
  // Walk by captured_at DESC so back-dated rows don't fool "latest" picking.
  const sorted = [...rows]
    .filter((r) => Number.isFinite(Date.parse(r.entry_at)))
    .sort((a, b) => Date.parse(b.entry_at) - Date.parse(a.entry_at));
  for (const row of sorted) {
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

/**
 * Project raw diary rows into chronology-friendly `ManualSensorLog`s.
 * Only includes rows tagged source='manual'. Order is not normalized here —
 * the delta helper re-sorts deterministically by captured_at.
 */
export function deriveManualSensorLogs(
  rows: ReadonlyArray<DiaryRow>,
): ManualSensorLog[] {
  const out: ManualSensorLog[] = [];
  for (const row of rows) {
    const snap = readSnapshot(row.details);
    if (!snap) continue;
    out.push({
      id: row.id,
      capturedAt: row.entry_at,
      source: MANUAL_SOURCE,
      metrics: {
        temp_f: typeof snap.temp_f === "number" ? snap.temp_f : null,
        humidity_percent:
          typeof snap.humidity_percent === "number"
            ? snap.humidity_percent
            : null,
        ph: typeof snap.ph === "number" ? snap.ph : null,
        ec: typeof snap.ec === "number" ? snap.ec : null,
      },
    });
  }
  return out;
}

async function fetchRows(plantId: string): Promise<DiaryRow[]> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, entry_at, details")
    .eq("plant_id", plantId)
    .order("entry_at", { ascending: false })
    .limit(PLANT_MANUAL_SENSOR_HISTORY_LIMIT);
  if (error) throw error;
  return (data ?? []) as DiaryRow[];
}

export function usePlantManualSensorHistory(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_manual_sensor_history", plantId ?? null],
    enabled: !!plantId,
    queryFn: async (): Promise<PlantManualSensorHistory> => {
      const rows = await fetchRows(plantId as string);
      return deriveLatestManualReadings(rows);
    },
  });
}

export function usePlantManualSensorLogs(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_manual_sensor_logs", plantId ?? null],
    enabled: !!plantId,
    queryFn: async (): Promise<ManualSensorLog[]> => {
      const rows = await fetchRows(plantId as string);
      return deriveManualSensorLogs(rows);
    },
  });
}
