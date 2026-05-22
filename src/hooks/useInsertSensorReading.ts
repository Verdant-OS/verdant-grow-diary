// Mutation hook for inserting a single sensor_readings row.
// Wraps growRepo.insertSensorReading so callers never touch Supabase directly.
// Validates payload shape up-front; errors surface via React Query (no silent
// fallback on writes). Invalidates the ["grow", "sensors"] query family on
// success so live Sensors data refreshes.
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { TablesInsert } from "@/integrations/supabase/types";
import { insertSensorReading } from "@/lib/growRepo";

export type InsertSensorReadingPayload = TablesInsert<"sensor_readings">;

const VALID_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
] as const;

export function validateSensorReadingPayload(p: InsertSensorReadingPayload): void {
  if (!p) throw new Error("sensor reading payload required");
  // user_id is optional in client payloads: the DB default `auth.uid()` and
  // RLS enforce ownership. When explicitly provided (legacy callers/tests),
  // it must be a non-empty string.
  if (p.user_id !== undefined && !p.user_id) throw new Error("user_id required");
  if (!p.tent_id) throw new Error("tent_id required");
  if (!(VALID_METRICS as readonly string[]).includes(p.metric)) {
    throw new Error(`invalid metric: ${p.metric}`);
  }
  const v = Number(p.value);
  if (!Number.isFinite(v)) throw new Error("value must be a finite number");
}

export function useInsertSensorReading(): UseMutationResult<
  void,
  Error,
  InsertSensorReadingPayload
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InsertSensorReadingPayload) => {
      validateSensorReadingPayload(payload);
      await insertSensorReading(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grow", "sensors"] });
    },
  });
}
