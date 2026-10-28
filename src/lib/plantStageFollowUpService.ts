/**
 * Applies a grower-confirmed plant stage follow-up (see plantStageFollowUpRules).
 * Writes only the `stage` column of the tent and/or grow the grower accepted,
 * through the same RLS-scoped client updates Edit Tent and Quick Log use.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PlantStageFollowUp, StageHolder } from "@/lib/plantStageFollowUpRules";

export interface PlantStageFollowUpResult {
  tentUpdated: boolean | null;
  growUpdated: boolean | null;
}

async function updateStage(
  table: "tents" | "grows",
  holder: StageHolder,
  stage: string,
): Promise<boolean> {
  try {
    // Write only while the holder still has the stage the prompt saw, so an
    // older prompt accepted later cannot move it backwards. RLS, a deleted row
    // or an intervening stage change matches zero rows without an error, so
    // read back the updated id and count an empty result as a failed write.
    const byId = supabase
      .from(table)
      .update({ stage } as never)
      .eq("id", holder.id);
    const unchanged =
      holder.stage === null ? byId.is("stage", null) : byId.eq("stage", holder.stage);
    const { data, error } = await unchanged.select("id");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function applyPlantStageFollowUp(
  followUp: PlantStageFollowUp,
): Promise<PlantStageFollowUpResult> {
  const tentUpdated = followUp.tent
    ? await updateStage("tents", followUp.tent, followUp.stage)
    : null;
  const growUpdated = followUp.grow
    ? await updateStage("grows", followUp.grow, followUp.stage)
    : null;
  return { tentUpdated, growUpdated };
}
