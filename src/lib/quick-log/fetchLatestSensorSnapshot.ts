/**
 * fetchLatestSensorSnapshot — reusable RPC wrapper for
 * public.get_latest_tent_sensor_snapshot.
 *
 * The RPC remains the read/ownership + four-hour availability gate. Its flat
 * JSONB cannot safely carry per-row provenance, so the corresponding
 * long-format rows are selected with raw_payload and passed through the pure
 * provenance fence before a snapshot is returned.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuickLogSensorSnapshot } from "./createQuickLogEvent";
import {
  acquireQuickLogSensorSnapshot,
  type QuickLogSensorAcquisitionRow,
} from "./quickLogSensorSnapshotAcquisitionRules";

const QUICK_LOG_SENSOR_ROW_COLUMNS =
  "id,metric,value,quality,source,captured_at,ts,created_at,raw_payload";
const QUICK_LOG_SENSOR_LOOKBACK_MS = 4 * 60 * 60 * 1000;
const QUICK_LOG_SENSOR_ROW_LIMIT = 200;

export async function fetchLatestSensorSnapshot(
  tentId: string,
): Promise<QuickLogSensorSnapshot | null> {
  const { data, error } = await supabase.rpc("get_latest_tent_sensor_snapshot", {
    _tent_id: tentId,
  });

  if (error || !data) return null;

  const raw = data as Record<string, unknown>;
  const capturedAt = typeof raw.captured_at === "string" ? raw.captured_at : null;
  const capturedAtMs = capturedAt ? Date.parse(capturedAt) : NaN;
  if (!capturedAt || !Number.isFinite(capturedAtMs)) return null;

  const lowerBound = new Date(capturedAtMs - QUICK_LOG_SENSOR_LOOKBACK_MS).toISOString();
  const { data: rows, error: rowsError } = await supabase
    .from("sensor_readings")
    .select(QUICK_LOG_SENSOR_ROW_COLUMNS)
    .eq("tent_id", tentId)
    .gte("captured_at", lowerBound)
    .lte("captured_at", capturedAt)
    .order("captured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(QUICK_LOG_SENSOR_ROW_LIMIT);

  if (rowsError || !Array.isArray(rows)) return null;
  return acquireQuickLogSensorSnapshot(rows as unknown as QuickLogSensorAcquisitionRow[]).snapshot;
}
