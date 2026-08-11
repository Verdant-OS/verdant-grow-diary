/**
 * Persist a grower-entered dry/wet soil moisture baseline.
 *
 * Deactivates the prior active row for the same probe scope, then inserts a
 * new active manual row. Never rewrites sensor_readings. No device control.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  validateSoilMoistureCalibrationCapture,
  type SoilMoistureCalibrationCaptureInput,
  type SoilMoistureCalibrationInsertPayload,
} from "@/lib/soilMoistureCalibrationCaptureRules";

/**
 * Table is owner-RLS'd but not yet in generated Supabase types.
 * Keep the cast local to this write path (same pattern as the read hook).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calTable(): any {
  return (supabase as unknown as { from: (t: string) => unknown }).from(
    "soil_moisture_calibrations",
  );
}

export async function saveSoilMoistureCalibration(
  input: SoilMoistureCalibrationCaptureInput,
): Promise<{ id: "saved" }> {
  const validated = validateSoilMoistureCalibrationCapture(input);
  if (!validated.ok || !validated.payload) {
    const first = Object.values(validated.errors)[0] ?? "invalid";
    throw new Error(`Invalid calibration: ${first}`);
  }

  const payload: SoilMoistureCalibrationInsertPayload = validated.payload;

  // Deactivate any active baseline for the same grow/tent/plant/device scope
  // so the unique active-probe index accepts the new row.
  let deactivateQuery = calTable()
    .update({ is_active: false })
    .eq("grow_id", payload.grow_id)
    .eq("tent_id", payload.tent_id)
    .eq("is_active", true);

  deactivateQuery = payload.plant_id
    ? deactivateQuery.eq("plant_id", payload.plant_id)
    : deactivateQuery.is("plant_id", null);
  deactivateQuery = payload.device_id
    ? deactivateQuery.eq("device_id", payload.device_id)
    : deactivateQuery.is("device_id", null);

  const { error: deactivateError } = await deactivateQuery;
  if (deactivateError) {
    throw new Error(deactivateError.message || "Could not deactivate previous calibration.");
  }

  const { error: insertError } = await calTable().insert(payload);
  if (insertError) {
    throw new Error(insertError.message || "Could not save soil moisture calibration.");
  }

  return { id: "saved" };
}

export function useSaveSoilMoistureCalibration(): UseMutationResult<
  { id: "saved" },
  Error,
  SoilMoistureCalibrationCaptureInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSoilMoistureCalibration,
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: [
          "soil_moisture_calibrations",
          vars.growId ?? "none",
          vars.tentId ?? "none",
        ],
      });
    },
  });
}
