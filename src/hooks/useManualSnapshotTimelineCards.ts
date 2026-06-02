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
import {
  diaryRowsToManualSnapshotRecords,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";
import {
  selectManualSnapshotsForTimeline,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";

export const MANUAL_SNAPSHOT_TIMELINE_DEFAULT_LIMIT = 50;

export type ManualSnapshotTimelineScope =
  | { kind: "plant"; plantId: string }
  | { kind: "tent"; tentId: string };

async function fetchPlantRows(plantId: string, limit: number): Promise<ManualSnapshotDiaryRow[]> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, plant_id, tent_id, entry_at, note, details")
    .eq("plant_id", plantId)
    .order("entry_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ManualSnapshotDiaryRow[];
}

async function fetchTentRows(tentId: string, limit: number): Promise<ManualSnapshotDiaryRow[]> {
  const { data, error } = await supabase
    .from("diary_entries")
    .select("id, plant_id, tent_id, entry_at, note, details")
    .eq("tent_id", tentId)
    .order("entry_at", { ascending: false })
    .limit(limit);
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
          ? await fetchPlantRows(scope.plantId, limit)
          : await fetchTentRows(scope.tentId, limit);
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
