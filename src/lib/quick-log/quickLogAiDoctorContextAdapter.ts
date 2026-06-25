/**
 * quickLogAiDoctorContextAdapter — pure compiler that turns recent Quick
 * Log v1 grow_events + their companion diary rows into a deterministic
 * shape the AI Doctor context builder can ingest WITHOUT:
 *   - inventing telemetry values,
 *   - relabeling unknown/manual data as "live",
 *   - treating missing snapshots as healthy.
 *
 * Hard rules:
 *   - Pure helper. No I/O, no Supabase, no React.
 *   - Snapshots and photos carry explicit `sensorSnapshot: null` /
 *     `photoUrl: null` when absent — never defaulted to numbers or
 *     placeholder strings.
 *   - Companions are joined by `linked_grow_event_id` only; rows without
 *     a known parent grow_event are reported in `orphanCompanionIds`.
 *   - Sort is stable: newest `occurredAt` first, then by event id.
 */

import {
  extractQuickLogCompanionView,
  type QuickLogCompanionSnapshot,
  type QuickLogDiaryRowLike,
} from "@/lib/quick-log/quickLogDiaryCompanionRules";

export interface QuickLogGrowEventRowLike {
  id: string;
  occurred_at: string;
  event_type: string;
  source?: string | null;
  note?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  is_deleted?: boolean | null;
}

export interface QuickLogAiContextEntry {
  growEventId: string;
  occurredAt: string;
  eventType: string;
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  note: string | null;
  photoUrl: string | null;
  sensorSnapshot: QuickLogCompanionSnapshot | null;
  /** True when the AI must not assume any telemetry exists for this event. */
  sensorSnapshotAbsent: boolean;
}

export interface QuickLogAiContextResult {
  entries: QuickLogAiContextEntry[];
  /** Companion diary rows whose linked grow_event was not in the input. */
  orphanCompanionIds: string[];
}

export interface BuildQuickLogAiContextInput {
  growEvents: ReadonlyArray<QuickLogGrowEventRowLike>;
  diaryRows: ReadonlyArray<QuickLogDiaryRowLike>;
  /** Optional cap (newest-first) to keep AI prompt small. */
  limit?: number;
}

function nonBlankOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function buildQuickLogAiContext(
  input: BuildQuickLogAiContextInput,
): QuickLogAiContextResult {
  const events = Array.isArray(input?.growEvents) ? input.growEvents : [];
  const diary = Array.isArray(input?.diaryRows) ? input.diaryRows : [];

  // Index companions by linked_grow_event_id. Last-write-wins on dup.
  const companionByEventId = new Map<
    string,
    ReturnType<typeof extractQuickLogCompanionView>
  >();
  const orphanCompanionIds: string[] = [];
  const knownEventIds = new Set(events.map((e) => e.id));
  for (const row of diary) {
    const view = extractQuickLogCompanionView(row);
    if (!view) continue;
    if (!knownEventIds.has(view.linkedGrowEventId)) {
      const id = typeof row?.id === "string" ? row.id : null;
      if (id) orphanCompanionIds.push(id);
      continue;
    }
    companionByEventId.set(view.linkedGrowEventId, view);
  }

  const entries: QuickLogAiContextEntry[] = [];
  for (const ev of events) {
    if (ev?.is_deleted === true) continue;
    if (!ev?.id || !ev?.occurred_at || !ev?.event_type) continue;
    const companion = companionByEventId.get(ev.id) ?? null;
    const snapshot = companion?.sensorSnapshot ?? null;
    entries.push({
      growEventId: ev.id,
      occurredAt: ev.occurred_at,
      eventType: ev.event_type,
      growId: nonBlankOrNull(ev.grow_id),
      tentId: nonBlankOrNull(ev.tent_id),
      plantId: nonBlankOrNull(ev.plant_id),
      note: nonBlankOrNull(ev.note),
      photoUrl: companion?.photoUrl ?? null,
      sensorSnapshot: snapshot,
      sensorSnapshotAbsent: snapshot === null,
    });
  }

  entries.sort((a, b) => {
    if (a.occurredAt > b.occurredAt) return -1;
    if (a.occurredAt < b.occurredAt) return 1;
    return a.growEventId < b.growEventId
      ? -1
      : a.growEventId > b.growEventId
        ? 1
        : 0;
  });

  const limit =
    typeof input?.limit === "number" && Number.isFinite(input.limit) && input.limit >= 0
      ? Math.floor(input.limit)
      : entries.length;

  return {
    entries: entries.slice(0, limit),
    orphanCompanionIds,
  };
}

/**
 * Remove companion diary rows whose `linked_grow_event_id` matches a row
 * already represented in the QuickLog grouped grow_event timeline, so the
 * combined UI never renders the same event twice.
 */
export function dedupeQuickLogCompanionsFromDiary<T extends QuickLogDiaryRowLike>(
  diaryRows: ReadonlyArray<T>,
  groupedGrowEventIds: ReadonlyArray<string>,
): T[] {
  const ids = new Set(groupedGrowEventIds);
  return diaryRows.filter((row) => {
    const view = extractQuickLogCompanionView(row);
    if (!view) return true;
    return !ids.has(view.linkedGrowEventId);
  });
}
