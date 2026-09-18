import type { SensorReadingRow } from "@/lib/db";
import { isUuid } from "@/lib/isUuid";
import { isObservationTimestamp } from "@/lib/manualSensorCorrectionOperationRules";

/** Missing/invalid correction evidence must never become empty, zero, or raw fallback. */
export function requireEffectiveSensorReadings(data: unknown): SensorReadingRow[] {
  if (!Array.isArray(data)) throw new Error("Sensor readings are unavailable.");
  const seen = new Set<string>();
  for (const value of data) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Sensor readings are unavailable.");
    const row = value as Record<string, unknown>;
    if (
      row.correction_valid !== true ||
      !isUuid(row.id) ||
      seen.has(row.id) ||
      !isUuid(row.user_id) ||
      !isUuid(row.tent_id) ||
      typeof row.value !== "number" ||
      !Number.isFinite(row.value) ||
      typeof row.metric !== "string" ||
      !row.metric ||
      typeof row.source !== "string" ||
      !row.source ||
      typeof row.quality !== "string" ||
      !isObservationTimestamp(row.ts) ||
      !isObservationTimestamp(row.created_at) ||
      (row.captured_at !== null && !isObservationTimestamp(row.captured_at)) ||
      (row.device_id !== null && typeof row.device_id !== "string") ||
      !Object.hasOwn(row, "raw_payload")
    )
      throw new Error("Sensor readings are unavailable.");
    seen.add(row.id);
  }
  return data as SensorReadingRow[];
}
