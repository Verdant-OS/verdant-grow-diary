/**
 * Read-only typed root-zone history for AI Doctor context.
 *
 * RLS owns authorization. This hook performs one bounded SELECT over the
 * existing grow-event spine and its watering/feeding child rows. It never
 * writes, invokes an Edge function, or accepts a client user_id.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import {
  buildRootZoneObservationsFromRows,
  ROOT_ZONE_GROW_EVENT_SELECT,
  ROOT_ZONE_OBSERVATION_CAP,
  type RootZoneGrowEventRowLike,
  type RootZoneObservationV1,
} from "@/lib/rootZoneObservationRules";
import { useAuth } from "@/store/auth";

export type RootZoneObservationScope =
  | { kind: "plant"; plantId: string }
  | { kind: "plant_context"; plantId: string; tentId: string; growId: string }
  | { kind: "tent"; tentId: string }
  | { kind: "grow"; growId: string };

export interface UseRootZoneObservationsResult {
  observations: RootZoneObservationV1[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

const NO_ROOT_ZONE_OBSERVATIONS: RootZoneObservationV1[] = [];

function isQueryableScope(
  scope: RootZoneObservationScope | null,
): scope is RootZoneObservationScope {
  if (!scope) return false;
  if (scope.kind === "plant") return isUuid(scope.plantId);
  if (scope.kind === "plant_context") {
    return isUuid(scope.plantId) && isUuid(scope.tentId) && isUuid(scope.growId);
  }
  if (scope.kind === "tent") return isUuid(scope.tentId);
  return isUuid(scope.growId);
}

export function useRootZoneObservations(
  scope: RootZoneObservationScope | null,
  limit: number = ROOT_ZONE_OBSERVATION_CAP,
): UseRootZoneObservationsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = user?.id ?? null;
  const enabled = !!ownerId && isQueryableScope(scope);
  const scopeKind = scope?.kind ?? "none";
  const plantId = scope?.kind === "plant" ? scope.plantId : null;
  const contextPlantId = scope?.kind === "plant_context" ? scope.plantId : null;
  const contextTentId = scope?.kind === "plant_context" ? scope.tentId : null;
  const contextGrowId = scope?.kind === "plant_context" ? scope.growId : null;
  const tentId = scope?.kind === "tent" ? scope.tentId : null;
  const growId = scope?.kind === "grow" ? scope.growId : null;
  const queryKey = useMemo(
    () =>
      buildPrivateGrowQueryKey(ownerId, [
        "root_zone_observations",
        scopeKind,
        plantId,
        contextPlantId,
        contextTentId,
        contextGrowId,
        tentId,
        growId,
        limit,
      ]),
    [
      contextGrowId,
      contextPlantId,
      contextTentId,
      growId,
      limit,
      ownerId,
      plantId,
      scopeKind,
      tentId,
    ],
  );
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async (): Promise<RootZoneObservationV1[]> => {
      if (!ownerId || !isQueryableScope(scope)) return [];
      let q = supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("is_deleted", false)
        .in("event_type", ["watering", "feeding"]);
      if (scope.kind === "plant") q = q.eq("plant_id", scope.plantId);
      if (scope.kind === "plant_context") {
        q = q
          .eq("grow_id", scope.growId)
          .eq("tent_id", scope.tentId)
          .or(`plant_id.eq.${scope.plantId},plant_id.is.null`);
      }
      if (scope.kind === "tent") q = q.eq("tent_id", scope.tentId);
      if (scope.kind === "grow") q = q.eq("grow_id", scope.growId);
      const { data, error } = await q
        .order("occurred_at", { ascending: false })
        .limit(Math.max(1, Math.min(ROOT_ZONE_OBSERVATION_CAP, Math.floor(limit))));
      if (error) throw error;
      return buildRootZoneObservationsFromRows(
        (data ?? []) as unknown as RootZoneGrowEventRowLike[],
        limit,
      );
    },
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey, exact: true });
    };
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, refresh);
    return () => {
      window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, refresh);
    };
  }, [enabled, queryClient, queryKey]);

  return {
    observations: query.data ?? NO_ROOT_ZONE_OBSERVATIONS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
