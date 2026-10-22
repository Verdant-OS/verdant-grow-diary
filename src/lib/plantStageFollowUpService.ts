/**
 * Applies a grower-confirmed plant stage follow-up (see plantStageFollowUpRules).
 * Writes only the `stage` column of the tent and/or grow the grower accepted,
 * through the same RLS-scoped client updates Edit Tent and Quick Log use.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PlantStageFollowUp } from "@/lib/plantStageFollowUpRules";

export interface PlantStageFollowUpResult {
  tentUpdated: boolean | null;
  growUpdated: boolean | null;
}

async function updateStage(table: "tents" | "grows", id: string, stage: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(table)
      .update({ stage } as never)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function applyPlantStageFollowUp(
  followUp: PlantStageFollowUp,
): Promise<PlantStageFollowUpResult> {
  const tentUpdated = followUp.tent
    ? await updateStage("tents", followUp.tent.id, followUp.stage)
    : null;
  const growUpdated = followUp.grow
    ? await updateStage("grows", followUp.grow.id, followUp.stage)
    : null;
  return { tentUpdated, growUpdated };
}
