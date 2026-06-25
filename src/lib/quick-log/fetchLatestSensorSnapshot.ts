/**
 * fetchLatestSensorSnapshot — reusable RPC wrapper for
 * public.get_latest_tent_sensor_snapshot.
 *
 * Transforms the flat JSONB returned by Postgres into the canonical
 * { source, captured_at, metrics } shape consumed by Quick Log and
 * AI Doctor context compilers.
 */
import { supabase } from "@/integrations/supabase/client";
import type { QuickLogSensorSnapshot } from "./createQuickLogEvent";

const SNAPSHOT_METRIC_KEYS = [
  "temperature",
  "humidity",
  "vpd",
  "soil_temp",
  "soil_ec",
  "ppfd",
] as const;

export async function fetchLatestSensorSnapshot(
  tentId: string,
): Promise<QuickLogSensorSnapshot | null> {
  const { data, error } = await supabase.rpc("get_latest_tent_sensor_snapshot", {
    _tent_id: tentId,
  });

  if (error || !data) return null;

  const raw = data as Record<string, unknown>;

  const source = typeof raw.source === "string" ? raw.source : null;
  const captured_at =
    typeof raw.captured_at === "string" ? raw.captured_at : null;

  const metrics: Record<string, number> = {};
  for (const key of SNAPSHOT_METRIC_KEYS) {
    const val = raw[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      metrics[key] = val;
    }
  }

  if (Object.keys(metrics).length === 0) return null;

  return { source, captured_at, metrics };
}
