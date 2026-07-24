/**
 * useRecentFeedingsForDefaults — read-only fetch of the most recent typed
 * feeding events scoped to the Quick Log target, used SOLELY to derive
 * Last-Used feeding defaults for QuickLogV2 Feed.
 *
 * Read-only. Never writes. Never exposes raw rows to UI directly — pass the
 * result to `buildFeedingDefaults` (pure) before rendering.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapGrowEventsToRecentRawEntries,
  type GrowEventRowForRecent,
} from "@/lib/growEventToDiaryRawEntry";
import { ROOT_ZONE_GROW_EVENT_SELECT } from "@/lib/rootZoneObservationRules";
import { buildFeedingDefaults } from "@/lib/feedingDefaultsViewModel";

export const RECENT_FEEDINGS_DEFAULTS_LIMIT = 20;

export interface RecentFeedingsForDefaultsInput {
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export function useRecentFeedingsForDefaults(input: RecentFeedingsForDefaultsInput) {
  const plantId = input.plantId ?? null;
  const tentId = input.tentId ?? null;
  const growId = input.growId ?? null;
  const enabled = Boolean(plantId || tentId || growId);

  return useQuery({
    queryKey: ["quicklog_v2_feed_defaults", plantId, tentId, growId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("event_type", "feeding")
        .eq("is_deleted", false)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_FEEDINGS_DEFAULTS_LIMIT);
      if (plantId) {
        q = q.eq("plant_id", plantId);
      } else if (tentId) {
        q = q.eq("tent_id", tentId);
      } else if (growId) {
        q = q.eq("grow_id", growId);
      }
      const { data, error } = await q;
      if (error) throw error;
      const typedRows = mapGrowEventsToRecentRawEntries(
        (data ?? []) as unknown as GrowEventRowForRecent[],
      );
      const typedDefaults = buildFeedingDefaults({
        rawEntries: typedRows,
        plantId,
        tentId,
        growId,
      });
      if (typedDefaults.defaults) return typedRows;

      // Back-compat: older grows may only have diary_entries. Typed rows are
      // authoritative when present; otherwise retain the established bounded
      // fallback so a migration gap does not erase Last-Used defaults.
      let legacy = supabase
        .from("diary_entries")
        .select("id,grow_id,plant_id,tent_id,entry_type,entry_at,note,details")
        .order("entry_at", { ascending: false })
        .limit(RECENT_FEEDINGS_DEFAULTS_LIMIT);
      if (plantId) {
        legacy = legacy.eq("plant_id", plantId);
      } else if (tentId) {
        legacy = legacy.eq("tent_id", tentId);
      } else if (growId) {
        legacy = legacy.eq("grow_id", growId);
      }
      const { data: legacyData, error: legacyError } = await legacy;
      if (legacyError) throw legacyError;
      return (legacyData ?? []) as unknown[];
    },
  });
}
