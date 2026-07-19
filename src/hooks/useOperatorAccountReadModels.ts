/**
 * Owner-scoped, read-only Operator Mode data adapter.
 *
 * The browser does not call the MCP transport directly. Instead, this hook
 * reuses the neutral loaders that back `list_recent_diary_entries` and
 * `get_latest_sensor_snapshot`, with the authenticated app Supabase client.
 * RLS and the loaders' explicit grow/tent visibility checks remain the data
 * authority; the operator role gate is presentation-only.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGrowTents } from "@/hooks/useGrowData";
import { useRootZoneObservations } from "@/hooks/useRootZoneObservations";
import { isUuid } from "@/lib/isUuid";
import {
  getLatestSensorSnapshotForOwnedTent,
  listRecentDiaryEntriesForOwnedGrow,
} from "@/lib/operatorAccountReadModels";
import {
  buildOperatorDiaryEntryRows,
  buildOperatorSensorReadingRows,
  type OperatorAccountReadModelsPanelModel,
  type OperatorPanelCollectionState,
  type OperatorPanelSensorState,
} from "@/lib/operatorAccountReadModelsViewModel";
import { buildOperatorWateringContextViewModel } from "@/lib/operatorWateringContextViewModel";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";

const EMPTY_ITEMS: readonly never[] = Object.freeze([] as never[]);

function diaryState(
  enabled: boolean,
  query: ReturnType<typeof useDiaryReadModelQuery>,
): OperatorPanelCollectionState<ReturnType<typeof buildOperatorDiaryEntryRows>[number]> {
  if (!enabled) return { status: "idle", items: EMPTY_ITEMS };
  if (query.isLoading || (query.isFetching && !query.data)) {
    return { status: "loading", items: EMPTY_ITEMS };
  }
  if (query.isError || !query.data?.ok) {
    return { status: "unavailable", items: EMPTY_ITEMS };
  }
  const items = buildOperatorDiaryEntryRows(query.data.data.entries);
  return items.length > 0 ? { status: "ok", items } : { status: "empty", items };
}

function sensorState(
  tentStatus: "loading" | "unavailable" | "empty" | "ready",
  activeGrowId: string,
  query: ReturnType<typeof useSensorReadModelQuery>,
): OperatorPanelSensorState {
  if (tentStatus === "loading") return { status: "loading", items: EMPTY_ITEMS };
  if (tentStatus === "unavailable") return { status: "unavailable", items: EMPTY_ITEMS };
  if (tentStatus === "empty") return { status: "no_tent", items: EMPTY_ITEMS };
  if (query.isLoading || (query.isFetching && !query.data)) {
    return { status: "loading", items: EMPTY_ITEMS };
  }
  if (query.isError || !query.data?.ok) {
    return { status: "unavailable", items: EMPTY_ITEMS };
  }
  // The selected tent came from a grow-scoped RLS read. Re-check the relation
  // returned by the shared loader so a stale/malformed client selection cannot
  // silently cross the active-grow boundary.
  if (query.data.data.tent.grow_id !== activeGrowId) {
    return { status: "unavailable", items: EMPTY_ITEMS };
  }
  const snapshot = query.data.data.snapshot;
  if (!snapshot) return { status: "empty", items: EMPTY_ITEMS };
  const items = buildOperatorSensorReadingRows(snapshot.readings);
  return items.length > 0 ? { status: "ok", items } : { status: "empty", items };
}

function useDiaryReadModelQuery(userId: string | null, growId: string | null) {
  return useQuery({
    queryKey: ["operator-account-read-model", "diary", userId ?? "signed-out", growId ?? "none"],
    enabled: !!userId && !!growId && isUuid(growId),
    retry: false,
    queryFn: () => listRecentDiaryEntriesForOwnedGrow(supabase, growId as string, 10),
  });
}

function useSensorReadModelQuery(userId: string | null, tentId: string | null) {
  return useQuery({
    queryKey: ["operator-account-read-model", "sensor", userId ?? "signed-out", tentId ?? "none"],
    enabled: !!userId && !!tentId && isUuid(tentId),
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: () => getLatestSensorSnapshotForOwnedTent(supabase, tentId as string),
  });
}

export function useOperatorAccountReadModels(): OperatorAccountReadModelsPanelModel {
  const { user } = useAuth();
  const { activeGrow, activeGrowId, loading: growsLoading, error: growsError } = useGrows();
  const validGrowId = activeGrowId && isUuid(activeGrowId) ? activeGrowId : null;
  // `useGrowTents` intentionally treats undefined as all tents. Use an invalid
  // sentinel until a real grow exists; fetchTents then returns [] without a DB
  // request, preventing aggregate cross-grow cache reuse.
  const tentsQuery = useGrowTents(validGrowId ?? "operator-no-grow");
  const selectedTent = validGrowId ? (tentsQuery.data?.[0] ?? null) : null;
  const validTentId = selectedTent?.id && isUuid(selectedTent.id) ? selectedTent.id : null;

  const diaryQuery = useDiaryReadModelQuery(user?.id ?? null, validGrowId);
  const sensorQuery = useSensorReadModelQuery(user?.id ?? null, validTentId);
  const rootZoneQuery = useRootZoneObservations(
    validTentId ? { kind: "tent", tentId: validTentId } : null,
  );

  return useMemo(() => {
    if (!user || growsLoading) return { status: "loading" };
    if (growsError || (activeGrowId !== null && !validGrowId)) {
      return { status: "unavailable" };
    }
    if (!validGrowId || !activeGrow) return { status: "no_grow" };

    const tentStatus = tentsQuery.isLoading
      ? "loading"
      : tentsQuery.isError
        ? "unavailable"
        : !selectedTent
          ? "empty"
          : validTentId
            ? "ready"
            : "unavailable";

    const diaryReadState =
      diaryQuery.isLoading || (diaryQuery.isFetching && !diaryQuery.data)
        ? { status: "loading" as const }
        : diaryQuery.isError || !diaryQuery.data?.ok
          ? { status: "unavailable" as const }
          : {
              status: "ready" as const,
              entries: diaryQuery.data.data.entries,
            };

    const sensorReadState =
      tentStatus === "loading"
        ? { status: "loading" as const }
        : tentStatus === "unavailable"
          ? { status: "unavailable" as const }
          : tentStatus === "empty"
            ? { status: "no_tent" as const }
            : sensorQuery.isLoading || (sensorQuery.isFetching && !sensorQuery.data)
              ? { status: "loading" as const }
              : sensorQuery.isError ||
                  !sensorQuery.data?.ok ||
                  sensorQuery.data.data.tent.grow_id !== validGrowId
                ? { status: "unavailable" as const }
                : {
                    status: "ready" as const,
                    readings: sensorQuery.data.data.snapshot?.readings ?? {},
                  };

    const rootZoneReadState =
      tentStatus === "loading"
        ? { status: "loading" as const }
        : tentStatus === "unavailable"
          ? { status: "unavailable" as const }
          : tentStatus === "empty"
            ? { status: "ready" as const, observations: [] }
            : rootZoneQuery.isLoading || (rootZoneQuery.isFetching && !rootZoneQuery.observations)
              ? { status: "loading" as const }
              : rootZoneQuery.isError
                ? { status: "unavailable" as const }
                : {
                    status: "ready" as const,
                    observations: rootZoneQuery.observations,
                  };

    return {
      status: "ready",
      growName: activeGrow.name?.trim() || "Unnamed grow",
      tentName: tentStatus === "ready" ? selectedTent?.name?.trim() || "Unnamed tent" : null,
      diary: diaryState(true, diaryQuery),
      sensor: sensorState(tentStatus, validGrowId, sensorQuery),
      watering: buildOperatorWateringContextViewModel({
        rootZone: rootZoneReadState,
        diary: diaryReadState,
        sensor: sensorReadState,
      }),
    };
  }, [
    activeGrow,
    activeGrowId,
    diaryQuery,
    growsError,
    growsLoading,
    rootZoneQuery.isError,
    rootZoneQuery.isFetching,
    rootZoneQuery.isLoading,
    rootZoneQuery.observations,
    selectedTent,
    sensorQuery,
    tentsQuery.isError,
    tentsQuery.isLoading,
    user,
    validGrowId,
    validTentId,
  ]);
}

export default useOperatorAccountReadModels;
