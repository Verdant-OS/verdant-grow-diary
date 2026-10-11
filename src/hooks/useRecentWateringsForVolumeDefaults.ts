/**
 * useRecentWateringsForVolumeDefaults — read-only fetch of the most recent
 * typed watering events scoped to the Quick Log plant target, used SOLELY to
 * derive a last-watering volume prefill for QuickLogV2 Water.
 *
 * Read-only. Never writes. Never exposes raw rows to UI directly — pass the
 * result to `buildWateringVolumeDefaults` (pure) before rendering.
 *
 * Plant-scoped only. Without a plant id the query stays disabled so tent/grow
 * volumes cannot leak into a plant watering form.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapGrowEventsToRecentRawEntries,
  type GrowEventRowForRecent,
} from "@/lib/growEventToDiaryRawEntry";
import { ROOT_ZONE_GROW_EVENT_SELECT } from "@/lib/rootZoneObservationRules";
import { buildWateringVolumeDefaults } from "@/lib/wateringVolumeDefaultsViewModel";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";

export const RECENT_WATERINGS_VOLUME_DEFAULTS_LIMIT = 20;

export interface RecentWateringsForVolumeDefaultsInput {
  plantId?: string | null;
}

export function useRecentWateringsForVolumeDefaults(
  input: RecentWateringsForVolumeDefaultsInput,
) {
  const plantId = input.plantId ?? null;
  const enabled = Boolean(plantId);

  return useQuery({
    queryKey: ["quicklog_v2_water_volume_defaults", plantId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!plantId) return [];

      const { data, error } = await supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("event_type", "watering")
        .eq("is_deleted", false)
        .eq("plant_id", plantId)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_WATERINGS_VOLUME_DEFAULTS_LIMIT);
      if (error) throw error;

      const typedRows = mapGrowEventsToRecentRawEntries(
        (data ?? []) as unknown as GrowEventRowForRecent[],
      );
      const typedDefaults = buildWateringVolumeDefaults({
        rawEntries: typedRows,
        plantId,
      });
      if (typedDefaults.defaults) return typedRows;

      // Back-compat: older grows may only have diary_entries. Typed rows are
      // authoritative when present; otherwise retain a bounded legacy fallback
      // so a migration gap does not erase a real prior volume.
      const { data: legacyData, error: legacyError } = await selectWithRetractionCompat(
        (withRetractionFilter) => {
          let legacy = supabase
            .from("diary_entries")
            .select("id,grow_id,plant_id,tent_id,entry_at,note,details")
            .eq("plant_id", plantId);
          if (withRetractionFilter) legacy = legacy.is("retracted_at", null);
          return legacy
            .order("entry_at", { ascending: false })
            .limit(RECENT_WATERINGS_VOLUME_DEFAULTS_LIMIT);
        },
      );
      if (legacyError) throw legacyError;
      return (legacyData ?? []) as unknown[];
    },
  });
}
