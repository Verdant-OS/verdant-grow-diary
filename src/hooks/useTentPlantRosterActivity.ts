/**
 * useTentPlantRosterActivity — read-only per-plant recency + Harvest Watch
 * public state enrichment for the Tent Plant Roster.
 *
 * Reuses the same diary read-path as `usePlantRecentActivity` (one query per
 * plant via `useQueries`). Normalizes rows with the existing
 * `buildPlantRecentActivity` helper, then derives the v0 Harvest Watch public
 * readiness state from the existing
 * `buildPlantDetailHarvestWatchCardViewModel` adapter.
 *
 * Strictly read-only:
 *   - Only reads `diary_entries`. Never reads sensor telemetry tables.
 *   - No writes, alerting, queued-action writes, AI/model calls, or device
 *     control.
 *   - Plant-scoped: results never aggregate across plants in the same tent.
 *   - Missing data → null/false (never invented).
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantDetailHarvestWatchCardViewModel } from "@/lib/plantDetailHarvestWatchCardViewModel";

export const TENT_PLANT_ROSTER_ACTIVITY_LIMIT = 10;

export interface TentPlantRosterActivityPlant {
  id: string;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  startedAt?: string | null;
  photo?: string | null;
}

export interface TentPlantRosterActivityEntry {
  latestLogAt: string | null;
  /** diary_entries.id of the most recent log, for entry-specific actions. */
  latestLogEntryId: string | null;
  hasRecentPhoto: boolean;
  /** diary_entries.id of the most recent log that has a photo_url. */
  latestPhotoEntryId: string | null;
  /** occurredAt for the most recent photo log, if available. */
  latestPhotoAt: string | null;
  harvestWatchPublicState: string | null;
}

export interface UseTentPlantRosterActivityResult {
  byPlantId: Record<string, TentPlantRosterActivityEntry>;
  isLoading: boolean;
  isError: boolean;
}

const EMPTY_ENTRY: TentPlantRosterActivityEntry = {
  latestLogAt: null,
  latestLogEntryId: null,
  hasRecentPhoto: false,
  latestPhotoEntryId: null,
  latestPhotoAt: null,
  harvestWatchPublicState: null,
};

export function useTentPlantRosterActivity(
  plants: ReadonlyArray<TentPlantRosterActivityPlant> | null | undefined,
): UseTentPlantRosterActivityResult {
  // Stable, de-duplicated id list so the hook count stays stable per render.
  const safePlants = Array.isArray(plants) ? plants : [];
  const ids = Array.from(
    new Set(
      safePlants
        .map((p) => (typeof p?.id === "string" ? p.id : null))
        .filter((v): v is string => !!v),
    ),
  ).sort();

  const results = useQueries({
    queries: ids.map((plantId) => ({
      queryKey: [
        "tent_plant_roster_activity",
        plantId,
        TENT_PLANT_ROSTER_ACTIVITY_LIMIT,
      ],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("diary_entries")
          .select("*")
          .eq("plant_id", plantId)
          .order("entry_at", { ascending: false })
          .limit(TENT_PLANT_ROSTER_ACTIVITY_LIMIT);
        if (error) throw error;
        return data ?? [];
      },
    })),
  });

  const byPlantId = useMemo<Record<string, TentPlantRosterActivityEntry>>(() => {
    const out: Record<string, TentPlantRosterActivityEntry> = {};
    for (const plant of safePlants) {
      const id = typeof plant?.id === "string" ? plant.id : null;
      if (!id) continue;
      const queryIndex = ids.indexOf(id);
      const raw = (results[queryIndex]?.data as unknown[] | undefined) ?? null;
      if (!raw) {
        out[id] = EMPTY_ENTRY;
        continue;
      }

      const rows = buildPlantRecentActivity(raw, {
        plantId: id,
        limit: TENT_PLANT_ROSTER_ACTIVITY_LIMIT,
      });

      // Per-plant only. Generic tent-level activity is never mixed in.
      const latestLogAt =
        rows.find((r) => typeof r.occurredAt === "string")?.occurredAt ?? null;
      const hasRecentPhoto = rows.some((r) => r.hasPhoto === true);

      let harvestWatchPublicState: string | null = null;
      try {
        const card = buildPlantDetailHarvestWatchCardViewModel({
          plant: {
            id,
            name: plant.name ?? "Unnamed plant",
            strain: plant.strain ?? null,
            stage: plant.stage ?? null,
            startedAt: plant.startedAt ?? null,
            photo: plant.photo ?? null,
          },
          recentActivityRows: rows,
          hasPlantPhoto: !!plant.photo,
        });
        harvestWatchPublicState = card.v0ReadinessState ?? null;
      } catch {
        harvestWatchPublicState = null;
      }

      out[id] = {
        latestLogAt,
        hasRecentPhoto,
        harvestWatchPublicState,
      };
    }
    return out;
    // results identity changes on every render; depend on a stable signature
    // of statuses + data references via JSON length so consumers re-render
    // only when something actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ids.join("|"),
    results.map((r) => r.dataUpdatedAt ?? 0).join("|"),
    safePlants,
  ]);

  return {
    byPlantId,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
