/**
 * usePlantMemoryEpisodes — read-only loader for Plant Memory Episodes.
 *
 * SAFETY:
 *  - Read-only: all DB access lives in plantMemoryEpisodeService (no mock
 *    fallback — honest empty, never demo rows).
 *  - User-scoped via RLS; never mutates action_queue / alerts / diary.
 *  - Single `now` captured per load and injected into the pure rules.
 */
import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { EFFECTIVE_SENSOR_QUERY_VERSION } from "@/lib/effectiveSensorReadings";
import { subscribeManualSensorCorrections } from "@/lib/manualSensorCorrectionEvents";
import { useAuth } from "@/store/auth";
import { loadPlantMemoryEpisodes } from "@/lib/plantMemoryEpisodeService";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

export type PlantMemoryEpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; episodes: PlantMemoryEpisode[] }
  | { status: "unavailable" };

export interface UsePlantMemoryEpisodesArgs {
  readonly growId: string | null | undefined;
  readonly plantId?: string | null;
  readonly actionQueueId?: string | null;
  readonly includeSensorEvidence?: boolean;
}

export function usePlantMemoryEpisodes(args: UsePlantMemoryEpisodesArgs): {
  state: PlantMemoryEpisodesState;
  reload: () => void;
} {
  const { user } = useAuth();
  const { growId, plantId, actionQueueId, includeSensorEvidence = false } = args;
  const ownerId = user?.id ?? null;
  const enabled = !!ownerId && !!growId;
  const query = useQuery({
    queryKey: [
      "plant-memory-episodes",
      ownerId,
      growId ?? null,
      plantId ?? null,
      actionQueueId ?? null,
      includeSensorEvidence,
      EFFECTIVE_SENSOR_QUERY_VERSION,
    ],
    enabled,
    retry: false,
    queryFn: async () => {
      const result = await loadPlantMemoryEpisodes({
        growId: growId!,
        plantId: plantId ?? null,
        actionQueueId: actionQueueId ?? null,
        includeSensorEvidence,
        nowIso: new Date().toISOString(),
      });
      if (result.status !== "ok") throw new Error("Learning episodes unavailable.");
      return result.episodes;
    },
  });
  const pending = query.isPending || query.isFetching || query.fetchStatus === "paused";
  const state: PlantMemoryEpisodesState = !enabled
    ? { status: "idle" }
    : pending
      ? { status: "loading" }
      : query.isError
        ? { status: "unavailable" }
        : { status: "ok", episodes: query.data ?? [] };
  const refetch = query.refetch;
  const reload = useCallback(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);
  useEffect(() => {
    if (!includeSensorEvidence) return;
    return subscribeManualSensorCorrections(ownerId, reload);
  }, [includeSensorEvidence, ownerId, reload]);

  return { state, reload };
}
