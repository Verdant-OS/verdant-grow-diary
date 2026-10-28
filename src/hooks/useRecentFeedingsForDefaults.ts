/**
 * useRecentFeedingsForDefaults — read-only fetch of the most recent typed
 * feeding events scoped to the Quick Log plant target, used SOLELY to
 * derive a last-feeding recipe prefill for QuickLogV2 Feed.
 *
 * Read-only. Never writes. Never exposes raw rows to UI directly — pass the
 * result to `buildFeedingDefaults` (pure) before rendering.
 *
 * Plant-scoped only. Without a plant id the query stays disabled so tent/grow
 * recipes cannot leak into a plant feeding form.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapGrowEventsToRecentRawEntries,
  type GrowEventRowForRecent,
} from "@/lib/growEventToDiaryRawEntry";
import { ROOT_ZONE_GROW_EVENT_SELECT } from "@/lib/rootZoneObservationRules";
import { buildFeedingDefaults } from "@/lib/feedingDefaultsViewModel";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

export const RECENT_FEEDINGS_DEFAULTS_LIMIT = 20;

export function recentFeedingsDefaultsQueryKey(plantId: string | null) {
  return ["quicklog_v2_feed_defaults", plantId] as const;
}

export interface RecentFeedingsDefaultsQueryClient {
  invalidateQueries: (opts: { queryKey: readonly unknown[] }) => Promise<unknown> | unknown;
}

/**
 * Drop the 30-second feed-defaults cache. `invalidateQueries` already refetches
 * active observers, so this does not issue a second read and does not wait.
 */
export function refetchRecentFeedingsForDefaults(
  client: RecentFeedingsDefaultsQueryClient,
  plantId: string | null | undefined,
): boolean {
  if (!plantId) return false;
  void client.invalidateQueries({ queryKey: recentFeedingsDefaultsQueryKey(plantId) });
  return true;
}

export interface RecentFeedingsForDefaultsInput {
  plantId?: string | null;
}

export function useRecentFeedingsForDefaults(input: RecentFeedingsForDefaultsInput) {
  const plantId = input.plantId ?? null;
  const enabled = Boolean(plantId);

  return useQuery({
    queryKey: recentFeedingsDefaultsQueryKey(plantId),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!plantId) return [];

      const { data, error } = await supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("event_type", "feeding")
        .eq("is_deleted", false)
        .eq("plant_id", plantId)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_FEEDINGS_DEFAULTS_LIMIT);
      if (error) throw error;

      const typedRows = mapGrowEventsToRecentRawEntries(
        (data ?? []) as unknown as GrowEventRowForRecent[],
      );
      const typedDefaults = buildFeedingDefaults({
        rawEntries: typedRows,
        plantId,
      });
      if (typedDefaults.defaults) return typedRows;

      // Back-compat: older grows may only have diary_entries. Typed rows are
      // authoritative when present; otherwise retain a bounded legacy fallback
      // so a migration gap does not erase a real prior recipe.
      const { data: legacyData, error: legacyError } = await selectWithRetractionCompat(
        (withRetractionFilter) => {
          let legacy = supabase
            .from("diary_entries")
            .select("id,grow_id,plant_id,tent_id,entry_at,note,details")
            .eq("plant_id", plantId);
          if (withRetractionFilter) legacy = legacy.is("retracted_at", null);
          return legacy
            .order("entry_at", { ascending: false })
            .limit(RECENT_FEEDINGS_DEFAULTS_LIMIT);
        },
      );
      if (legacyError) throw legacyError;
      return (legacyData ?? []) as unknown[];
    },
  });
}
