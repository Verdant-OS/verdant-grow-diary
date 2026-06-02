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
  TimelineAiDoctorEvidenceItem,
  TimelineDiaryItem,
  TimelineManualSnapshotItem,
  TimelineMemoryItem,
} from "@/lib/timelineFilterRules";
import { deriveSensorEvidenceMode } from "@/lib/aiDoctorSessionPersistence";

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

interface AiDoctorAuditRow {
  id: string;
  created_at: string;
  sensor_snapshot_status:
    | "usable" | "stale" | "invalid" | "needs_review" | "no_data"
    | null;
  sensor_snapshot_reason_code: string | null;
  counts_as_healthy_evidence: boolean | null;
  sensor_evidence_mode:
    | "healthy" | "cautionary" | "unsafe" | "missing" | null;
  sensor_evidence_evaluated_at: string | null;
}

async function fetchAiDoctorAuditRows(
  scope: TimelineMemoryScope,
  limit: number,
): Promise<AiDoctorAuditRow[]> {
  try {
    let q = supabase
      .from("ai_doctor_sessions" as never)
      .select(
        "id,created_at,sensor_snapshot_status,sensor_snapshot_reason_code,counts_as_healthy_evidence,sensor_evidence_mode,sensor_evidence_evaluated_at",
      );
    q = scope.kind === "plant"
      ? q.eq("plant_id", scope.plantId)
      : q.eq("tent_id", scope.tentId);
    q = q.not("sensor_snapshot_status", "is", null);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as unknown as AiDoctorAuditRow[];
  } catch {
    return [];
  }
}

function auditRowToTimelineItem(
  row: AiDoctorAuditRow,
): TimelineAiDoctorEvidenceItem | null {
  const status = row.sensor_snapshot_status;
  if (!status) return null;
  const mode = row.sensor_evidence_mode ?? deriveSensorEvidenceMode(status);
  return {
    kind: "ai_doctor_sensor_evidence_audit",
    key: row.id,
    occurredAt: row.sensor_evidence_evaluated_at ?? row.created_at,
    status,
    reasonCode: row.sensor_snapshot_reason_code,
    countsAsHealthyEvidence: row.counts_as_healthy_evidence === true,
    mode,
  };
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
      const [rows, auditRows] = await Promise.all([
        fetchRows(scope, limit),
        fetchAiDoctorAuditRows(scope, limit),
      ]);

      const out: TimelineMemoryItem[] = [];
      for (const row of rows) {
        const snap = rowToManualSnapshotItem(row);
        if (snap) {
          out.push(snap);
        } else {
          out.push(diaryRowToDiaryItem(row));
        }
      }
      for (const row of auditRows) {
        const item = auditRowToTimelineItem(row);
        if (item) out.push(item);
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
