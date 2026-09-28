/**
 * useActionResponseMemory — read-only hook for canonical Action Response
 * Memories (Milestone 5). Auth-gated, owner-scoped via the authenticated
 * client's RLS. Explicit loading / ready / empty / unavailable states; a
 * query failure resolves to "unavailable" without erasing any other surface
 * content. No writes, no mock fallback — honest empty, never demo rows.
 */

import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { EFFECTIVE_SENSOR_QUERY_VERSION } from "@/lib/effectiveSensorReadings";
import { subscribeManualSensorCorrections } from "@/lib/manualSensorCorrectionEvents";
import { useAuth } from "@/store/auth";
import { loadActionResponseMemories } from "@/lib/actionResponseMemoryService";
import type { ActionResponseMemory } from "@/lib/actionResponseMemoryRules";

export type ActionResponseMemoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; memories: ActionResponseMemory[] }
  | { status: "unavailable" };

export interface UseActionResponseMemoryArgs {
  readonly growId: string | null | undefined;
  readonly plantId?: string | null;
}

export function useActionResponseMemory(args: UseActionResponseMemoryArgs): {
  state: ActionResponseMemoryState;
  reload: () => void;
} {
  const { user } = useAuth();
  const growId = args.growId ?? null;
  const plantId = args.plantId ?? null;
  const ownerId = user?.id ?? null;
  const enabled = !!ownerId && !!growId;
  const query = useQuery({
    queryKey: ["action-response-memory", ownerId, growId, plantId, EFFECTIVE_SENSOR_QUERY_VERSION],
    enabled,
    retry: false,
    queryFn: async () => {
      const result = await loadActionResponseMemories({ growId: growId!, plantId });
      if (result.status !== "ok") throw new Error("Action response history unavailable.");
      return result.memories;
    },
  });
  const pending = query.isPending || query.isFetching || query.fetchStatus === "paused";
  const state: ActionResponseMemoryState = !enabled
    ? { status: "idle" }
    : pending
      ? { status: "loading" }
      : query.isError
        ? { status: "unavailable" }
        : { status: "ok", memories: query.data ?? [] };
  const refetch = query.refetch;
  const reload = useCallback(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);
  useEffect(() => subscribeManualSensorCorrections(ownerId, reload), [ownerId, reload]);

  return { state, reload };
}
