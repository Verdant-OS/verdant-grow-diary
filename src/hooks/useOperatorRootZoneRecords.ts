/**
 * Owner-scoped, read-only typed root-zone records for Operator Mode.
 *
 * RLS remains authoritative. The hook selects a bounded history for one
 * canonical tent UUID, performs no writes, and never accepts a client user_id.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { isUuid } from "@/lib/isUuid";
import {
  buildOperatorRootZoneRecordsFromRows,
  type OperatorRootZoneRecordV1,
} from "@/lib/operatorRootZoneRecordRules";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import {
  ROOT_ZONE_GROW_EVENT_SELECT,
  ROOT_ZONE_OBSERVATION_CAP,
  type RootZoneGrowEventRowLike,
} from "@/lib/rootZoneObservationRules";
import { useAuth } from "@/store/auth";

export interface UseOperatorRootZoneRecordsResult {
  records: OperatorRootZoneRecordV1[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export interface OperatorRootZoneRecordScope {
  growId: string;
  tentId: string;
}

const NO_OPERATOR_ROOT_ZONE_RECORDS: OperatorRootZoneRecordV1[] = [];

export function useOperatorRootZoneRecords(
  scope: OperatorRootZoneRecordScope | null,
  limit: number = ROOT_ZONE_OBSERVATION_CAP,
): UseOperatorRootZoneRecordsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = user?.id ?? null;
  const growId = scope?.growId ?? null;
  const tentId = scope?.tentId ?? null;
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(ROOT_ZONE_OBSERVATION_CAP, Math.floor(limit)))
    : ROOT_ZONE_OBSERVATION_CAP;
  const enabled = !!ownerId && isUuid(growId) && isUuid(tentId) && boundedLimit > 0;
  const queryKey = useMemo(
    () =>
      buildPrivateGrowQueryKey(ownerId, [
        "operator_root_zone_records",
        growId,
        tentId,
        boundedLimit,
      ]),
    [boundedLimit, growId, ownerId, tentId],
  );
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async (): Promise<OperatorRootZoneRecordV1[]> => {
      if (!ownerId || !isUuid(growId) || !isUuid(tentId) || boundedLimit === 0) return [];
      const { data, error } = await supabase
        .from("grow_events")
        .select(ROOT_ZONE_GROW_EVENT_SELECT)
        .eq("is_deleted", false)
        .in("event_type", ["watering", "feeding"])
        .eq("grow_id", growId)
        .eq("tent_id", tentId)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(boundedLimit);
      if (error) throw error;
      return buildOperatorRootZoneRecordsFromRows(
        (data ?? []) as unknown as RootZoneGrowEventRowLike[],
        boundedLimit,
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
    records: query.data ?? NO_OPERATOR_ROOT_ZONE_RECORDS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useOperatorRootZoneRecords;
