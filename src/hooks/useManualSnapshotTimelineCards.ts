/**
 * useManualSnapshotTimelineCards — read-only query that loads manual
 * sensor snapshot diary rows scoped to a plant or tent and projects them
 * into `ManualSnapshotTimelineCard`s via pure helpers.
 *
 * Safety contract:
 *  - SELECT only. No insert / update / upsert / delete / rpc.
 *  - No functions.invoke. No service_role.
 *  - No writes to action_queue, alerts, ai_doctor_sessions, sensor_readings.
 *  - Never trusts client-provided user_id; RLS enforces ownership.
 *  - Errors are surfaced; they do not throw past the consumer.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import { applyPostgrestAbortSignal, rethrowIfAbortError } from "@/lib/supabaseAbort";
import {
  diaryRowsToManualSnapshotRecords,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";
import {
  selectManualSnapshotsForTimeline,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";
import {
  normalizeTentManualSnapshotIds,
  scanLatestTentManualSnapshots,
  type TentManualSnapshotBatchData,
  type TentManualSnapshotBatchPageRequest,
  type TentManualSnapshotUnavailableReason,
} from "@/lib/tentManualSnapshotBatchRules";

export const MANUAL_SNAPSHOT_TIMELINE_DEFAULT_LIMIT = 50;

export type ManualSnapshotTimelineScope =
  { kind: "plant"; plantId: string } | { kind: "tent"; tentId: string };

export async function fetchPlantManualSnapshotRows(
  plantId: string,
  limit: number,
): Promise<ManualSnapshotDiaryRow[]> {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase
      .from("diary_entries")
      .select("id, plant_id, tent_id, entry_at, note, details")
      .eq("plant_id", plantId)
      .not("details->manual_sensor_snapshot" as never, "is", null)
      .eq("details->manual_sensor_snapshot->>source" as never, "manual" as never);
    if (withRetractionFilter) q = q.is("retracted_at", null);
    return q.order("entry_at", { ascending: false }).order("id", { ascending: true }).limit(limit);
  });
  if (error) throw error;
  return (data ?? []) as ManualSnapshotDiaryRow[];
}

export async function fetchTentManualSnapshotRows(
  tentId: string,
  limit: number,
): Promise<ManualSnapshotDiaryRow[]> {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase
      .from("diary_entries")
      .select("id, plant_id, tent_id, entry_at, note, details")
      .eq("tent_id", tentId)
      .not("details->manual_sensor_snapshot" as never, "is", null)
      .eq("details->manual_sensor_snapshot->>source" as never, "manual" as never);
    if (withRetractionFilter) q = q.is("retracted_at", null);
    return q.order("entry_at", { ascending: false }).order("id", { ascending: true }).limit(limit);
  });
  if (error) throw error;
  return (data ?? []) as ManualSnapshotDiaryRow[];
}

export interface UseManualSnapshotTimelineCardsResult {
  cards: ManualSnapshotTimelineCard[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function useManualSnapshotTimelineCards(
  scope: ManualSnapshotTimelineScope | null,
  limit: number = MANUAL_SNAPSHOT_TIMELINE_DEFAULT_LIMIT,
): UseManualSnapshotTimelineCardsResult {
  const enabled = scope !== null;
  const query = useQuery({
    queryKey: [
      "manual_snapshot_timeline_cards",
      scope?.kind ?? "none",
      scope?.kind === "plant" ? scope.plantId : null,
      scope?.kind === "tent" ? scope.tentId : null,
      limit,
    ],
    enabled,
    queryFn: async (): Promise<ManualSnapshotTimelineCard[]> => {
      if (!scope) return [];
      const rows =
        scope.kind === "plant"
          ? await fetchPlantManualSnapshotRows(scope.plantId, limit)
          : await fetchTentManualSnapshotRows(scope.tentId, limit);
      const records = diaryRowsToManualSnapshotRecords(rows);
      if (scope.kind === "plant") {
        return selectManualSnapshotsForTimeline({ records, plantId: scope.plantId });
      }
      return selectManualSnapshotsForTimeline({ records, tentId: scope.tentId });
    },
  });
  return {
    cards: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export async function fetchTentManualSnapshotBatchPage(
  request: TentManualSnapshotBatchPageRequest,
  signal?: AbortSignal,
): Promise<ManualSnapshotDiaryRow[]> {
  const { data, error } = await selectWithRetractionCompat((withRetractionFilter) => {
    let q = supabase
      .from("diary_entries")
      .select("id, plant_id, tent_id, entry_at, note, details")
      .in("tent_id", [...request.tentIds])
      .not("details->manual_sensor_snapshot" as never, "is", null)
      .eq("details->manual_sensor_snapshot->>source" as never, "manual" as never);
    if (request.upperBoundEntryAt) q = q.lte("entry_at", request.upperBoundEntryAt);
    if (withRetractionFilter) q = q.is("retracted_at", null);
    const pageQuery = q
      .order("entry_at", { ascending: false })
      .order("id", { ascending: true })
      .range(request.from, request.to);
    return applyPostgrestAbortSignal(pageQuery, signal);
  });
  rethrowIfAbortError(error);
  if (error) throw error;
  return (data ?? []) as ManualSnapshotDiaryRow[];
}

export function tentManualSnapshotBatchQueryKey(
  ownerId: string | null | undefined,
  tentIds: readonly string[],
) {
  return [
    "manual_snapshot_timeline_cards",
    "tents-batch",
    ownerId ?? "anon",
    normalizeTentManualSnapshotIds(tentIds),
  ] as const;
}

export type TentManualSnapshotBatchReadStatus =
  "loading" | "refreshing" | "error" | "refresh_error" | "success";

export interface TentManualSnapshotBatchDisplay {
  cards: ManualSnapshotTimelineCard[];
  status: TentManualSnapshotBatchReadStatus;
  unavailableReason?: TentManualSnapshotUnavailableReason | null;
}

export interface UseTentManualSnapshotBatchResult {
  byTent: Record<string, TentManualSnapshotBatchDisplay>;
  error: unknown;
}

function buildTentManualSnapshotBatchDisplay(
  ownerId: string | null | undefined,
  tentIds: readonly string[],
  data: TentManualSnapshotBatchData | undefined,
  isLoading: boolean,
  isFetching: boolean,
  isError: boolean,
): Record<string, TentManualSnapshotBatchDisplay> {
  const byTent: Record<string, TentManualSnapshotBatchDisplay> = {};
  for (const tentId of tentIds) {
    const resolution = data?.byTent[tentId];
    if (isLoading) {
      byTent[tentId] = { cards: [], status: "loading", unavailableReason: null };
    } else if (isError) {
      byTent[tentId] =
        resolution?.kind === "found"
          ? { cards: [resolution.card], status: "refresh_error", unavailableReason: null }
          : {
              cards: [],
              status: "error",
              unavailableReason: resolution?.kind === "unavailable" ? resolution.reason : null,
            };
    } else if (!ownerId) {
      byTent[tentId] = { cards: [], status: "error", unavailableReason: null };
    } else if (resolution?.kind === "found") {
      byTent[tentId] = {
        cards: [resolution.card],
        status: isFetching ? "refreshing" : "success",
        unavailableReason: null,
      };
    } else if (isFetching) {
      byTent[tentId] = { cards: [], status: "loading", unavailableReason: null };
    } else if (resolution?.kind === "empty") {
      byTent[tentId] = { cards: [], status: "success", unavailableReason: null };
    } else {
      byTent[tentId] = {
        cards: [],
        status: "error",
        unavailableReason: resolution?.kind === "unavailable" ? resolution.reason : null,
      };
    }
  }
  return byTent;
}

/** One owner-keyed React Query result for every eligible tent on the Tents page. */
export function useTentManualSnapshotBatch(
  ownerId: string | null | undefined,
  tentIds: readonly string[],
): UseTentManualSnapshotBatchResult {
  const normalizedTentIds = normalizeTentManualSnapshotIds(tentIds);
  const enabled = !!ownerId && normalizedTentIds.length > 0;
  const query = useQuery({
    queryKey: tentManualSnapshotBatchQueryKey(ownerId, normalizedTentIds),
    enabled,
    retry: false,
    queryFn: ({ signal }): Promise<TentManualSnapshotBatchData> =>
      scanLatestTentManualSnapshots(normalizedTentIds, fetchTentManualSnapshotBatchPage, {
        signal,
      }),
  });

  return {
    byTent: buildTentManualSnapshotBatchDisplay(
      ownerId,
      normalizedTentIds,
      query.data,
      query.isLoading,
      query.isFetching,
      query.isError,
    ),
    error: query.error,
  };
}
