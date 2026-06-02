/**
 * manualSnapshotTimelineMerge — pure helper that interleaves diary entries
 * and manual sensor snapshot cards into one deterministic, descending
 * timeline list.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React.
 *  - Preserves diary entries (never invented, never re-labeled).
 *  - Sort: `occurredAt` desc, then stable fallback by `kind` then `key`.
 *  - Never labels manual snapshot output as live / synced / connected /
 *    imported (those labels live in `manualSensorSnapshotViewModel`).
 */

import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

export interface MergeDiaryInput {
  /** Stable key, e.g. diary entry id. */
  key: string;
  /** ISO-8601 occurrence timestamp (e.g. entry_at). */
  occurredAt: string;
}

export type MergedTimelineItem<TDiary extends MergeDiaryInput> =
  | { kind: "diary"; occurredAt: string; key: string; entry: TDiary }
  | { kind: "manual-snapshot"; occurredAt: string; key: string; card: ManualSnapshotTimelineCard };

export interface MergeArgs<TDiary extends MergeDiaryInput> {
  diaryEntries: ReadonlyArray<TDiary>;
  manualSnapshots: ReadonlyArray<ManualSnapshotTimelineCard>;
}

function tsValue(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Merge diary entries and manual snapshot cards into a single descending
 * timeline. Ties break by `kind` (diary before manual-snapshot) and then
 * by `key` for full determinism.
 */
export function mergeTimelineItems<TDiary extends MergeDiaryInput>(
  args: MergeArgs<TDiary>,
): MergedTimelineItem<TDiary>[] {
  const items: MergedTimelineItem<TDiary>[] = [];
  for (const e of args.diaryEntries) {
    items.push({ kind: "diary", occurredAt: e.occurredAt, key: e.key, entry: e });
  }
  for (const c of args.manualSnapshots) {
    items.push({
      kind: "manual-snapshot",
      occurredAt: c.capturedAt,
      key: c.id,
      card: c,
    });
  }
  items.sort((a, b) => {
    const at = tsValue(a.occurredAt);
    const bt = tsValue(b.occurredAt);
    if (at !== bt) return bt - at;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  return items;
}
