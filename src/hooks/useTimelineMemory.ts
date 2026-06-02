/**
 * useTimelineMemory — read-only fetch of diary rows for a plant or tent
 * scope, projected into classified `TimelineMemoryItem`s (diary + manual
 * sensor snapshot cards).
 *
 * Safety contract:
 *  - SELECT only. No insert / update / upsert / delete / rpc.
 *  - No functions.invoke. No service_role.
 *  - No writes to action_queue, alerts, ai_doctor_sessions, sensor_readings.
 *  - Never trusts client-provided user_id; RLS enforces ownership.
 *  - Manual snapshot classification uses the shared pure helpers; no
 *    metric/validation tables are duplicated here.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  diaryRowToManualSnapshotRecord,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";
import type {
  TimelineDiaryItem,
  TimelineManualSnapshotItem,
  TimelineMemoryItem,
} from "@/lib/timelineFilterRules";

export const TIMELINE_MEMORY_DEFAULT_LIMIT = 100;

export type TimelineMemoryScope =
  | { kind: "plant"; plantId: string }
  | { kind: "tent"; tentId: string };

function readEventType(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as { event_type?: unknown }).event_type;
  return typeof v === "string" ? v : null;
}

function diaryRowToDiaryItem(
  row: ManualSnapshotDiaryRow & { photo_url?: string | null },
): TimelineDiaryItem {
  return {
    kind: "diary",
    key: row.id,
    occurredAt: row.entry_at,
    eventType: readEventType(row.details),
    hasPhoto: !!row.photo_url,
    note: row.note,
  };
}

function rowToManualSnapshotItem(
  row: ManualSnapshotDiaryRow,
): TimelineManualSnapshotItem | null {
  const rec = diaryRowToManualSnapshotRecord(row);
  if (!rec) return null;
  const card: ManualSnapshotTimelineCard = buildManualSnapshotTimelineCard(rec);
  return {
    kind: "manual_sensor_snapshot",
    key: card.id,
    occurredAt: card.capturedAt,
    card,
  };
}

interface RawRow extends ManualSnapshotDiaryRow {
  photo_url: string | null;
}

async function fetchRows(
  scope: TimelineMemoryScope,
  limit: number,
): Promise<RawRow[]> {
  let q = supabase
    .from("diary_entries")
    .select("id, plant_id, tent_id, entry_at, note, photo_url, details");
  q = scope.kind === "plant" ? q.eq("plant_id", scope.plantId) : q.eq("tent_id", scope.tentId);
  const { data, error } = await q.order("entry_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as RawRow[];
}

export interface UseTimelineMemoryResult {
  items: TimelineMemoryItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function useTimelineMemory(
  scope: TimelineMemoryScope | null,
  limit: number = TIMELINE_MEMORY_DEFAULT_LIMIT,
): UseTimelineMemoryResult {
  const query = useQuery({
    queryKey: [
      "timeline_memory",
      scope?.kind ?? "none",
      scope?.kind === "plant" ? scope.plantId : null,
      scope?.kind === "tent" ? scope.tentId : null,
      limit,
    ],
    enabled: scope !== null,
    queryFn: async (): Promise<TimelineMemoryItem[]> => {
      if (!scope) return [];
      const rows = await fetchRows(scope, limit);

      const out: TimelineMemoryItem[] = [];
      for (const row of rows) {
        // For tent scope, also include tent-level (plant_id null) rows.
        // Plant scope is already filtered server-side by plant_id.
        const snap = rowToManualSnapshotItem(row);
        if (snap) {
          out.push(snap);
        } else {
          out.push(diaryRowToDiaryItem(row));
        }
      }
      // Deterministic occurredAt desc, then by key for ties.
      out.sort((a, b) => {
        if (a.occurredAt > b.occurredAt) return -1;
        if (a.occurredAt < b.occurredAt) return 1;
        if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      return out;
    },
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
