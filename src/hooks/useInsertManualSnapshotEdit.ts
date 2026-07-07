/**
 * useInsertManualSnapshotEdit — thin React Query mutation for inserting
 * one row into `manual_sensor_snapshot_edits`.
 *
 * Hard constraints:
 *  - No service_role. Uses the shared client (`supabase`) which carries
 *    the current signed-in user session. RLS enforces ownership.
 *  - No update/upsert/delete. INSERT only.
 *  - Never touches sensor_readings directly.
 *  - Errors surface to the caller — no silent fallback on writes.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildManualSensorSnapshotEditDiff,
  sanitizeChangeReason,
  type ManualEditSnapshotInput,
} from "@/lib/manualSensorSnapshotEditRules";

export interface InsertManualSnapshotEditInput {
  original_reading_id: string;
  replacement_reading_id: string | null;
  tent_id: string;
  plant_id?: string | null;
  original: ManualEditSnapshotInput;
  replacement: ManualEditSnapshotInput;
  change_reason?: string | null;
}

export interface InsertManualSnapshotEditRow {
  id: string;
  changed_at: string;
}

async function insertManualSnapshotEdit(
  input: InsertManualSnapshotEditInput,
): Promise<InsertManualSnapshotEditRow> {
  if (!input?.original_reading_id) throw new Error("original_reading_id required");
  if (!input?.tent_id) throw new Error("tent_id required");

  const diff = buildManualSensorSnapshotEditDiff({
    original: input.original,
    replacement: input.replacement,
  });
  if (!diff.ok) {
    throw new Error(`cannot build manual edit diff: ${diff.reason}`);
  }

  const payload = {
    original_reading_id: input.original_reading_id,
    replacement_reading_id: input.replacement_reading_id ?? null,
    tent_id: input.tent_id,
    plant_id: input.plant_id ?? null,
    change_reason: sanitizeChangeReason(input.change_reason ?? null),
    old_values: diff.old_values as unknown as Record<string, number>,
    new_values: diff.new_values as unknown as Record<string, number>,
    changed_fields: diff.changed_fields as unknown as string[],
    source_before: diff.source_before,
    source_after: diff.source_after,
  };

  const { data, error } = await supabase
    .from("manual_sensor_snapshot_edits")
    .insert(payload)
    .select("id, changed_at")
    .single();

  if (error) throw error;
  if (!data) throw new Error("insert returned no row");
  return data as InsertManualSnapshotEditRow;
}

export function useInsertManualSnapshotEdit(): UseMutationResult<
  InsertManualSnapshotEditRow,
  Error,
  InsertManualSnapshotEditInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: insertManualSnapshotEdit,
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["manual-sensor-snapshot-edits"] });
      qc.invalidateQueries({
        queryKey: ["manual-sensor-snapshot-edits", input.original_reading_id],
      });
    },
  });
}
