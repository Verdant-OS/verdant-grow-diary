/**
 * usePlantMemoryEpisodes — read-only loader for Plant Memory Episodes.
 *
 * SAFETY:
 *  - Read-only: all DB access lives in plantMemoryEpisodeService (no mock
 *    fallback — honest empty, never demo rows).
 *  - User-scoped via RLS; never mutates action_queue / alerts / diary.
 *  - Single `now` captured per load and injected into the pure rules.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import {
  loadPlantMemoryEpisodes,
  type LoadEpisodesArgs,
} from "@/lib/plantMemoryEpisodeService";
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

export function usePlantMemoryEpisodes(
  args: UsePlantMemoryEpisodesArgs,
): { state: PlantMemoryEpisodesState; reload: () => void } {
  const { user } = useAuth();
  const [state, setState] = useState<PlantMemoryEpisodesState>({ status: "idle" });
  const { growId, plantId, actionQueueId, includeSensorEvidence } = args;

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const loadArgs: LoadEpisodesArgs = {
      growId,
      plantId: plantId ?? null,
      actionQueueId: actionQueueId ?? null,
      includeSensorEvidence: includeSensorEvidence ?? false,
      nowIso: new Date().toISOString(),
    };
    const result = await loadPlantMemoryEpisodes(loadArgs);
    if (result.status === "error") {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "ok", episodes: result.episodes });
  }, [user, growId, plantId, actionQueueId, includeSensorEvidence]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: () => void load() };
}
