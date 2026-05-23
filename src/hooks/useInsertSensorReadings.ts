// Batch mutation hook for inserting multiple sensor_readings rows.
// Wraps growRepo.insertSensorReadingsBatch. Pre-validates EVERY row before
// touching Supabase. If any row is invalid, the whole batch is rejected and
// no insert happens. On success, invalidates sensor query families.
//
// Safety: writes only to the sensor readings table. No side effects on other
// surfaces.
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { insertSensorReadingsBatch } from "@/lib/growRepo";
import {
  validateSensorReadingPayload,
  type InsertSensorReadingPayload,
} from "@/hooks/useInsertSensorReading";

export const VALID_SENSOR_SOURCES = ["manual", "pi_bridge", "sim"] as const;

export function validateSensorReadingBatch(
  rows: InsertSensorReadingPayload[],
): void {
  if (!Array.isArray(rows)) throw new Error("batch payload must be an array");
  if (rows.length === 0) return;
  rows.forEach((row, idx) => {
    try {
      validateSensorReadingPayload(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`batch row ${idx}: ${msg}`);
    }
    if (
      row.source !== undefined &&
      row.source !== null &&
      !(VALID_SENSOR_SOURCES as readonly string[]).includes(row.source)
    ) {
      throw new Error(`batch row ${idx}: invalid source: ${row.source}`);
    }
  });
}

export function useInsertSensorReadings(): UseMutationResult<
  void,
  Error,
  InsertSensorReadingPayload[]
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: InsertSensorReadingPayload[]) => {
      validateSensorReadingBatch(rows);
      await insertSensorReadingsBatch(rows);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
      qc.invalidateQueries({ queryKey: ["sensor_readings"] });
    },
  });
}
