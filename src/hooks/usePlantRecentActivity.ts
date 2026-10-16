/**
 * Read-only hook: latest diary entries for a single plant.
 *
 * Uses the same `diary_entries` table that QuickLog already writes to.
 * No writes. No new logging table. No alerts. No action_queue.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import {
  applyLinkedEventTypes,
  collectLinkedEventIdsNeedingType,
} from "@/lib/diaryLinkedEventTypeRules";

export const PLANT_RECENT_ACTIVITY_LIMIT = 10;

export async function fetchPlantRecentActivityRows(plantId: string) {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase.from("diary_entries").select("*").eq("plant_id", plantId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    // created_at, then id, break entry_at ties before the limit: companion
    // rows can share entry_at, and the limit must keep the true newest ones.
    return query
      .order("entry_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PLANT_RECENT_ACTIVITY_LIMIT);
  });

  if (error) throw error;
  if (!Array.isArray(data)) {
    throw new Error("Plant recent activity is unavailable.");
  }
  return withLinkedEventTypes(data);
}

/**
 * Quick Log manual-save mirrors carry no type, only `linked_grow_event_id`
 * (a Quick Log watering read as "NOTE"). Recover the type from the linked
 * grow_events rows. A failed lookup keeps the rows exactly as read.
 */
async function withLinkedEventTypes<T>(rows: T[]): Promise<T[]> {
  const ids = collectLinkedEventIdsNeedingType(rows);
  if (ids.length === 0) return rows;
  try {
    const { data, error } = await supabase
      .from("grow_events")
      .select("id,event_type,feeding_events(line_id,nutrient_brand)")
      .in("id", ids);
    if (error || !Array.isArray(data)) return rows;
    const types = new Map<string, unknown>();
    for (const e of data as Array<{
      id?: unknown;
      event_type?: unknown;
      feeding_events?: unknown;
    }>) {
      if (typeof e?.id !== "string") continue;
      const feedRel = Array.isArray(e.feeding_events) ? e.feeding_events[0] : e.feeding_events;
      const feedObj =
        feedRel && typeof feedRel === "object" && !Array.isArray(feedRel)
          ? (feedRel as Record<string, unknown>)
          : null;
      const lineId =
        typeof feedObj?.line_id === "string" && feedObj.line_id.trim() !== ""
          ? feedObj.line_id.trim()
          : typeof feedObj?.nutrient_brand === "string" && feedObj.nutrient_brand.trim() !== ""
            ? feedObj.nutrient_brand.trim()
            : null;
      types.set(
        e.id.toLowerCase(),
        lineId ? { event_type: e.event_type, line_id: lineId } : e.event_type,
      );
    }
    return applyLinkedEventTypes(rows, types);
  } catch {
    return rows;
  }
}

export function usePlantRecentActivity(plantId: string | null | undefined) {
  return useQuery({
    queryKey: ["plant_recent_activity", plantId ?? null],
    enabled: !!plantId,
    queryFn: () => fetchPlantRecentActivityRows(plantId as string),
  });
}
