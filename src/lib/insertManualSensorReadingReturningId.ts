/**
 * insertManualSensorReadingReturningId — thin helper for the manual
 * correction flow. Inserts ONE sensor_readings row via the shared
 * supabase client and returns the new row id so the caller can link it
 * as `replacement_reading_id` on a `manual_sensor_snapshot_edits` row.
 *
 * Hard constraints:
 *  - No service_role. Uses the shared client (RLS enforces ownership).
 *  - Insert only. Never updates, upserts, or deletes.
 *  - Never touches the original sensor_readings row.
 *  - `source` is always "manual".
 */
import { supabase } from "@/integrations/supabase/client";
import { validateSensorReadingPayload, type InsertSensorReadingPayload } from "@/hooks/useInsertSensorReading";

export interface InsertManualReturningIdResult {
  id: string;
  ts: string;
}

export async function insertManualSensorReadingReturningId(
  payload: InsertSensorReadingPayload,
): Promise<InsertManualReturningIdResult> {
  if (payload.source !== "manual") {
    throw new Error("insertManualSensorReadingReturningId: source must be 'manual'");
  }
  validateSensorReadingPayload(payload);
  const { data, error } = await supabase
    .from("sensor_readings")
    .insert(payload)
    .select("id, ts")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("insert returned no id");
  return { id: data.id as string, ts: (data.ts as string) ?? new Date().toISOString() };
}
