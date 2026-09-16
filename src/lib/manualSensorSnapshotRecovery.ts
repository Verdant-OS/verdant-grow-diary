import { supabase } from "@/integrations/supabase/client";
import type { SensorReadingInsert, SensorReadingRow } from "@/lib/db";

type ManualSnapshotStoredRow = Omit<SensorReadingRow, "created_at">;

function sameInstant(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const at = Date.parse(a);
  return Number.isFinite(at) && at === Date.parse(b);
}

/** A count or conflict alone is never a receipt for a manual snapshot. */
export function matchesManualSnapshotReadback(
  submitted: readonly SensorReadingInsert[],
  stored: readonly ManualSnapshotStoredRow[],
): boolean {
  if (!submitted.length || submitted.length !== stored.length) return false;
  if (new Set(submitted.map((row) => row.metric)).size !== submitted.length) return false;
  return submitted.every((expected) => {
    const matches = stored.filter((row) => row.metric === expected.metric);
    if (matches.length !== 1) return false;
    const row = matches[0];
    return (
      expected.source === "manual" &&
      row.source === "manual" &&
      row.tent_id === expected.tent_id &&
      (expected.user_id === undefined || row.user_id === expected.user_id) &&
      (expected.id === undefined || row.id === expected.id) &&
      typeof row.value === "number" &&
      Number.isFinite(row.value) &&
      row.value === expected.value &&
      sameInstant(row.captured_at, expected.captured_at) &&
      sameInstant(row.ts, expected.ts) &&
      row.quality === (expected.quality ?? "ok") &&
      row.device_id === (expected.device_id ?? null) &&
      expected.raw_payload == null &&
      row.raw_payload == null
    );
  });
}

/**
 * Recover only an actual uniqueness conflict for one frozen manual snapshot.
 * The existing database key prevents repeat inserts; authenticated readback
 * must still prove every metric. Hidden, failed or partial reads stay unknown.
 */
export async function confirmManualSnapshotConflict(
  rows: readonly SensorReadingInsert[],
  error: unknown,
): Promise<boolean> {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505") {
    return false;
  }
  const first = rows[0];
  if (
    !first ||
    !sameInstant(first.captured_at, first.ts) ||
    new Set(rows.map((row) => row.metric)).size !== rows.length ||
    !rows.every(
      (row) =>
        row.source === "manual" &&
        row.tent_id === first.tent_id &&
        row.user_id === first.user_id &&
        row.raw_payload == null &&
        sameInstant(row.captured_at, first.captured_at) &&
        sameInstant(row.ts, first.ts),
    )
  ) {
    return false;
  }
  try {
    const { data, error: readError } = await supabase
      .from("sensor_readings")
      .select("id,user_id,tent_id,source,metric,value,ts,captured_at,quality,device_id,raw_payload")
      .eq("tent_id", first.tent_id)
      .eq("source", "manual")
      .eq("captured_at", first.captured_at!)
      .in(
        "metric",
        rows.map((row) => row.metric),
      )
      .limit(rows.length + 1);
    return !readError && Array.isArray(data) && matchesManualSnapshotReadback(rows, data);
  } catch {
    return false;
  }
}
