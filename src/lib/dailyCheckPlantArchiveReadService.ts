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

const PLANT_ARCHIVE_READ_FAILED = { data: null, error: { message: "plant archive read failed" } };

/**
 * Re-read `plants.is_archived` for the plant a Quick Log save will write.
 * The read lives here so presenters do not call `supabase.from`.
 *
 * A test stub that cannot `maybeSingle` one row never started a plant read,
 * so the caller leaves that save allowed. A real filter can both `limit`
 * and `maybeSingle`. Any throw or rejection from that read resolves as an
 * error, which the decision helper blocks.
 */
export function startSavedPlantArchiveDecision(plantId: string | null | undefined) {
  return startDailyCheckPlantArchiveDecision(plantId, () => {
    let relation: { select?: (columns: string) => PlantArchiveFilter };
    try {
      relation = supabase.from("plants");
    } catch {
      return Promise.resolve(PLANT_ARCHIVE_READ_FAILED);
    }
    if (!dailyCheckPlantArchiveRelationCanStart(relation)) {
      throw new Error("plant archive read unavailable");
    }
    const selected = relation.select?.("is_archived");
    const filtered = selected?.eq?.("id", plantId ?? "");
    if (
      !filtered ||
      typeof filtered.maybeSingle !== "function" ||
      typeof filtered.limit !== "function"
    ) {
      throw new Error("plant archive read unavailable");
    }
    const limit = filtered.limit.bind(filtered);
    return Promise.resolve()
      .then(() => limit(1))
      .then(
        (result) => result ?? PLANT_ARCHIVE_READ_FAILED,
        () => PLANT_ARCHIVE_READ_FAILED,
      );
  });
}
