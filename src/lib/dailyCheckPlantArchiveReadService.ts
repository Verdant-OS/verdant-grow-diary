import { supabase } from "@/integrations/supabase/client";
import {
  dailyCheckPlantArchiveRelationCanStart,
  startDailyCheckPlantArchiveDecision,
} from "@/lib/dailyCheckPlantSelectionRules";

type PlantArchiveFilter = {
  eq: (column: string, value: string) => PlantArchiveFilter;
  limit?: (count: number) => PromiseLike<{ data: unknown; error: unknown }>;
  maybeSingle?: () => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Re-read `plants.is_archived` for the plant a Quick Log save will write.
 * The read lives here so presenters do not call `supabase.from`.
 *
 * A Postgrest filter can `limit` and `maybeSingle`. A generic chain that
 * only stubs `limit` with an empty list is not a plant-row read; throwing
 * leaves that save allowed. A settled error, empty row, or non-boolean flag
 * still blocks inside the decision helper.
 */
export function startSavedPlantArchiveDecision(plantId: string | null | undefined) {
  return startDailyCheckPlantArchiveDecision(plantId, () => {
    const relation = supabase.from("plants");
    if (!dailyCheckPlantArchiveRelationCanStart(relation)) {
      throw new Error("plant archive read unavailable");
    }
    const filtered = (relation.select("is_archived") as PlantArchiveFilter).eq("id", plantId ?? "");
    if (typeof filtered.maybeSingle !== "function" || typeof filtered.limit !== "function") {
      throw new Error("plant archive read unavailable");
    }
    return filtered.limit(1);
  });
}
