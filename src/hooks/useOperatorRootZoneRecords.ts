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
  ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP,
  ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT,
  ROOT_ZONE_OBSERVATION_CAP,
  normalizeRootZoneSource,
  type RootZoneGrowEventRowLike,
  type RootZoneManualObservationDiaryRowLike,
} from "@/lib/rootZoneObservationRules";
import { useAuth } from "@/store/auth";

export interface UseOperatorRootZoneRecordsResult {
  records: OperatorRootZoneRecordV1[];
  manualObservationStatus: OperatorManualObservationStatus;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export type OperatorManualObservationStatus = "loading" | "ready" | "unavailable";

interface OperatorRootZoneRecordsQueryData {
  records: OperatorRootZoneRecordV1[];
  manualObservationStatus: Exclude<OperatorManualObservationStatus, "loading">;
}

export interface OperatorRootZoneRecordScope {
  growId: string;
  tentId: string;
}

const NO_OPERATOR_ROOT_ZONE_RECORDS: OperatorRootZoneRecordV1[] = [];

function collectGrowEventIds(rows: readonly RootZoneGrowEventRowLike[]): string[] {
  return [
    ...new Set(
      rows.flatMap((row) =>
        row.event_type === "watering" &&
        normalizeRootZoneSource(row.source) === "manual" &&
        isUuid(row.id)
          ? [row.id.toLowerCase()]
          : [],
      ),
    ),
  ];
}

/**
 * Best-effort companion enrichment for the exact bounded event set. The
 * grow-event query remains authoritative and usable when this SELECT fails,
 * while the explicit status prevents the missing evidence from looking empty.
 */
async function fetchManualObservationCompanions(
  scope: OperatorRootZoneRecordScope,
  rows: readonly RootZoneGrowEventRowLike[],
): Promise<{
  rows: RootZoneManualObservationDiaryRowLike[];
  status: Exclude<OperatorManualObservationStatus, "loading">;
}> {
  const eventIds = collectGrowEventIds(rows);
  if (eventIds.length === 0) return { rows: [], status: "ready" };

  try {
    const { data, error } = await supabase
      .from("diary_entries")
      .select(ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT)
      .not("details->>linked_grow_event_id" as never, "is", null)
      .in("details->>linked_grow_event_id" as never, eventIds as never)
      .eq("grow_id", scope.growId)
      .eq("tent_id", scope.tentId)
      .order("entry_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP);
    if (error || !Array.isArray(data)) {
      return { rows: [], status: "unavailable" };
    }
    const companionRows = data as unknown as RootZoneManualObservationDiaryRowLike[];
    if (companionRows.length >= ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP) {
      return { rows: [], status: "unavailable" };
    }
    return { rows: companionRows, status: "ready" };
  } catch {
    return { rows: [], status: "unavailable" };
  }
}

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
    queryFn: async (): Promise<OperatorRootZoneRecordsQueryData> => {
      if (!ownerId || !isUuid(growId) || !isUuid(tentId) || boundedLimit === 0) {
        return { records: [], manualObservationStatus: "ready" };
      }
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
      const rows = (data ?? []) as unknown as RootZoneGrowEventRowLike[];
      const companions = await fetchManualObservationCompanions({ growId, tentId }, rows);
      return {
        records: buildOperatorRootZoneRecordsFromRows(rows, boundedLimit, companions.rows),
        manualObservationStatus: companions.status,
      };
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
    records: query.data?.records ?? NO_OPERATOR_ROOT_ZONE_RECORDS,
    manualObservationStatus: !enabled
      ? "ready"
      : query.isLoading || (query.isFetching && !query.data)
        ? "loading"
        : query.isError
          ? "unavailable"
          : (query.data?.manualObservationStatus ?? "unavailable"),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useOperatorRootZoneRecords;
