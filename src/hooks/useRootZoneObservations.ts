/**
 * Read-only typed root-zone history for AI Doctor context.
 *
 * RLS owns authorization. This hook performs one bounded SELECT over the
 * existing grow-event spine and its watering/feeding child rows. It never
 * writes, invokes an Edge function, or accepts a client user_id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";
import {
  buildRootZoneObservationsFromRows,
  ROOT_ZONE_GROW_EVENT_SELECT,
  ROOT_ZONE_OBSERVATION_CAP,
  type RootZoneGrowEventRowLike,
  type RootZoneObservationV1,
} from "@/lib/rootZoneObservationRules";

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

export function useRootZoneObservations(
  scope: RootZoneObservationScope | null,
  limit: number = ROOT_ZONE_OBSERVATION_CAP,
): UseRootZoneObservationsResult {
  const query = useQuery({
    queryKey: [
      "root_zone_observations",
      scope?.kind ?? "none",
      scope?.kind === "plant" ? scope.plantId : null,
      scope?.kind === "plant_context" ? scope.plantId : null,
      scope?.kind === "plant_context" ? scope.tentId : null,
      scope?.kind === "plant_context" ? scope.growId : null,
      scope?.kind === "tent" ? scope.tentId : null,
      scope?.kind === "grow" ? scope.growId : null,
      limit,
    ],
    enabled: scope !== null,
    queryFn: async (): Promise<RootZoneObservationV1[]> => {
      if (!scope) return [];
      let q = supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("is_deleted", false)
        .in("event_type", ["watering", "feeding"]);
      if (scope.kind === "plant") q = q.eq("plant_id", scope.plantId);
      if (scope.kind === "plant_context") {
        if (!isUuid(scope.plantId) || !isUuid(scope.tentId) || !isUuid(scope.growId)) return [];
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

  return {
    observations: query.data ?? NO_ROOT_ZONE_OBSERVATIONS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
