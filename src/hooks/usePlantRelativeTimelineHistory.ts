/** Full, read-only plant history. The recent-activity preview keeps its own 10-row contract. */
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import { applyPostgrestAbortSignal, rethrowIfAbortError } from "@/lib/supabaseAbort";
import {
  PLANT_RELATIVE_HISTORY_PAGE_SIZE,
  buildPlantHistoryPage,
  collectPlantHistoryRows,
  plantHistoryCursorFilter,
  type PlantHistoryCursor,
} from "@/lib/plantRelativeTimelineHistoryRules";

export function plantRelativeHistoryQueryKey(
  plantId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  return ["plant_recent_activity", plantId ?? null, "relative_timeline", ownerId ?? null] as const;
}

export async function fetchPlantRelativeHistoryPage(
  plantId: string,
  cursor: PlantHistoryCursor | null,
  signal?: AbortSignal,
  ownerId?: string | null,
) {
  const cursorFilter = cursor ? plantHistoryCursorFilter(cursor) : null;
  const result = await selectWithRetractionCompat((withRetractionFilter) => {
    let query = supabase
      .from("diary_entries")
      .select("*", cursor ? undefined : { count: "exact" })
      .eq("plant_id", plantId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    if (cursorFilter) query = query.or(cursorFilter);
    return applyPostgrestAbortSignal(
      query
        .order("entry_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(PLANT_RELATIVE_HISTORY_PAGE_SIZE + 1),
      signal,
    );
  });
  rethrowIfAbortError(result.error);
  if (result.error) throw result.error;
  return buildPlantHistoryPage(
    result.data,
    cursor ? null : result.count,
    plantId,
    PLANT_RELATIVE_HISTORY_PAGE_SIZE,
    ownerId,
  );
}

export function usePlantRelativeTimelineHistory(plantId: string | null | undefined) {
  const ownerId = useAuth().user?.id ?? null;
  const query = useInfiniteQuery({
    queryKey: plantRelativeHistoryQueryKey(plantId, ownerId),
    enabled: !!ownerId && !!plantId,
    retry: false,
    initialPageParam: null as PlantHistoryCursor | null,
    queryFn: ({ pageParam, signal }) =>
      fetchPlantRelativeHistoryPage(plantId as string, pageParam, signal, ownerId),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return {
    ...query,
    data: ownerId && plantId && query.data ? collectPlantHistoryRows(query.data.pages) : undefined,
    totalCount: ownerId && plantId ? (query.data?.pages[0]?.totalCount ?? null) : null,
    boundaryUnavailable: query.data?.pages.at(-1)?.boundaryUnavailable ?? false,
  };
}
