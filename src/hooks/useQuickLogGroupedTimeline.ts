/**
 * useQuickLogGroupedTimeline — read-only fetch of QuickLog v2 manual events
 * for a plant or tent scope, grouped via the pure
 * `groupQuickLogTimelineEntries` view-model.
 *
 * Safety contract:
 *  - SELECT only. No insert/update/upsert/delete/rpc.
 *  - No functions.invoke. No service_role. No client-trusted user_id.
 *  - RLS enforces ownership on grow_events / watering_events /
 *    environment_events.
 *  - No alerts / action_queue / ai_doctor_sessions writes.
 *  - No device control. No live/synced/connected/imported labels.
 *  - Grouping/pairing logic stays in the pure view-model.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  groupQuickLogTimelineEntries,
  type QuickLogTimelineEntry,
} from "@/lib/quickLogTimelineGroupingViewModel";
import type { QuickLogV2SnapshotScope } from "@/lib/quickLogV2ManualSnapshotAdapter";
import {
  partitionQuickLogRows,
  type RawGrowEventRow,
} from "@/lib/quickLogGroupedTimelineRowAdapter";
import {
  attachAiDoctorPhase1EvidenceToActionEvents,
  buildAiDoctorPhase1EvidenceIndex,
  type RawDiaryEntryRow,
} from "@/lib/quickLogTimelineDiaryDetailsMerge";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";

export const QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT = 200;

export type QuickLogGroupedTimelineScope =
  | { kind: "plant"; plantId: string; tentId: string | null }
  | { kind: "tent"; tentId: string };

const SELECT =
  "id, plant_id, tent_id, occurred_at, event_type, source, note, is_deleted, watering_events ( volume_ml ), environment_events ( temperature_c, humidity_pct, vpd_kpa )";

const DIARY_SELECT = "id, plant_id, tent_id, grow_id, entry_at, details";

async function fetchRows(
  scope: QuickLogGroupedTimelineScope,
  limit: number,
): Promise<RawGrowEventRow[]> {
  let q = supabase
    .from("grow_events")
    .select(SELECT)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .in("event_type", ["watering", "observation", "environment"]);

  if (scope.kind === "plant") {
    if (scope.tentId && scope.tentId.length > 0) {
      // plant-owned rows OR tent-level environment rows in this plant's tent.
      q = q.or(
        `plant_id.eq.${scope.plantId},and(plant_id.is.null,tent_id.eq.${scope.tentId},event_type.eq.environment)`,
      );
    } else {
      q = q.eq("plant_id", scope.plantId);
    }
  } else {
    q = q.eq("tent_id", scope.tentId);
  }

  const { data, error } = await q
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as RawGrowEventRow[];
}

/**
 * Read-only fetch of saved AI Doctor Phase 1 evidence rows from
 * `diary_entries`. RLS enforces user ownership. Filtered by
 * `details->>kind` so we never widen the query to unrelated note kinds.
 */
async function fetchAiDoctorPhase1DiaryRows(
  scope: QuickLogGroupedTimelineScope,
  limit: number,
): Promise<RawDiaryEntryRow[]> {
  let q = supabase
    .from("diary_entries")
    // PostgREST JSON arrow operator — equivalent to filter("details->>kind", "eq", …)
    // but uses `.eq` so it composes with the existing query-mock surface.
    .select(DIARY_SELECT)
    .eq("details->>kind" as never, AI_DOCTOR_PHASE1_TIMELINE_KIND as never);


  if (scope.kind === "plant") {
    q = q.eq("plant_id", scope.plantId);
  } else {
    q = q.eq("tent_id", scope.tentId);
  }

  const { data, error } = await q
    .order("entry_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Enrichment failure must never break the timeline. Return empty.
    return [];
  }
  return (data ?? []) as unknown as RawDiaryEntryRow[];
}


export interface UseQuickLogGroupedTimelineResult {
  entries: QuickLogTimelineEntry[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

export function useQuickLogGroupedTimeline(
  scope: QuickLogGroupedTimelineScope | null,
  limit: number = QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT,
): UseQuickLogGroupedTimelineResult {
  const query = useQuery({
    queryKey: [
      "quick_log_grouped_timeline",
      scope?.kind ?? "none",
      scope?.kind === "plant" ? scope.plantId : null,
      scope?.kind === "plant" ? scope.tentId : null,
      scope?.kind === "tent" ? scope.tentId : null,
      limit,
    ],
    enabled: scope !== null,
    queryFn: async (): Promise<QuickLogTimelineEntry[]> => {
      if (!scope) return [];
      const rows = await fetchRows(scope, limit);
      const { actions, environmentRows } = partitionQuickLogRows(rows);
      const vmScope =
        scope.kind === "plant"
          ? ({
              kind: "plant",
              plantId: scope.plantId,
              tentId: scope.tentId,
            } as QuickLogV2SnapshotScope)
          : ({ kind: "tent", tentId: scope.tentId } as QuickLogV2SnapshotScope);
      return groupQuickLogTimelineEntries({
        actions,
        environmentRows,
        scope: vmScope,
      });
    },
  });

  // Read-only AI Doctor Phase 1 evidence enrichment runs as a separate
  // query so that:
  //  - the primary timeline still renders if diary enrichment fails;
  //  - existing tests that mock only the `grow_events` fetch path keep
  //    working without modification.
  const diaryQuery = useQuery<RawDiaryEntryRow[]>({
    queryKey: [
      "quick_log_grouped_timeline__ai_doctor_phase1_evidence",
      scope?.kind ?? "none",
      scope?.kind === "plant" ? scope.plantId : null,
      scope?.kind === "tent" ? scope.tentId : null,
      limit,
    ],
    enabled: scope !== null,
    queryFn: async () => (scope ? fetchAiDoctorPhase1DiaryRows(scope, limit) : []),
  });

  const baseEntries = query.data ?? [];
  const diaryRows = diaryQuery.data ?? [];
  const evidenceIndex = buildAiDoctorPhase1EvidenceIndex(diaryRows);
  const entries =
    evidenceIndex.size === 0
      ? baseEntries
      : baseEntries.map((entry) => {
          if (entry.kind === "environment") return entry;
          const enriched = attachAiDoctorPhase1EvidenceToActionEvents(
            [entry.action],
            evidenceIndex,
          )[0];
          if (enriched === entry.action) return entry;
          return { ...entry, action: enriched };
        });

  return {
    entries,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}


