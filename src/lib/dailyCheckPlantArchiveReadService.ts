import { supabase } from "@/integrations/supabase/client";
import {
  classifyDailyCheckPlantArchiveRead,
  dailyCheckSubmitBlockForPlantArchive,
  type DailyCheckPlantArchiveDecision,
  type DailyCheckPlantArchiveRead,
} from "@/lib/dailyCheckPlantSelectionRules";

/**
 * Re-read `plants.is_archived` for the plant a Daily Check save will write.
 * Any failure is unreadable: a throw, a rejection, an error, a missing row,
 * or a flag that is not a boolean. Unreadable blocks the save.
 */
// snip:prod — fail closed: a read that did not prove the plant active must block the save.
export async function readDailyCheckPlantArchive(
  plantId: string,
): Promise<DailyCheckPlantArchiveRead> {
  try {
    const { data, error } = await supabase
      .from("plants")
      .select("is_archived")
      .eq("id", plantId)
      .maybeSingle();
    return classifyDailyCheckPlantArchiveRead({
      error: Boolean(error),
      isArchived: (data as { is_archived?: unknown } | null)?.is_archived,
    });
  } catch {
    return { status: "unreadable" };
  }
}

/** The guard Daily Check registers for its Quick Log writers. */
export async function checkDailyCheckPlantArchiveBeforeSave(
  plantId: string,
): Promise<DailyCheckPlantArchiveDecision> {
  return dailyCheckSubmitBlockForPlantArchive(await readDailyCheckPlantArchive(plantId));
}
