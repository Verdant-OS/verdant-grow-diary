/**
 * diaryEntryRemovalInvalidationRules — pure helpers that compute the
 * React Query keys to invalidate after a single diary/photo log is
 * removed.
 *
 * Pure, deterministic, null-safe. No React, no Supabase.
 *
 * Why centralize:
 *   - Avoids string drift across hooks/components.
 *   - Lets tests assert the exact invalidation surface without mounting
 *     a QueryClientProvider.
 *
 * Scope:
 *   - Read-side cache invalidation only. No writes, no deletes, no
 *     mutations of other tables.
 */

export interface DiaryEntryRemovalMetadata {
  /** diary_entries.id that was removed. */
  entryId: string;
  /** diary_entries.plant_id, if known. */
  plantId?: string | null;
  /** diary_entries.tent_id, if known. */
  tentId?: string | null;
  /** Owning grow id, if known. */
  growId?: string | null;
  /** Whether the removed entry had a photo_url. */
  isPhotoLog?: boolean;
}

export type QueryKey = readonly unknown[];

/**
 * Build the list of React Query keys to invalidate after a successful
 * removal. Keys are emitted as prefix tuples, which React Query treats
 * as partial matches (so e.g. ["plant_recent_activity", plantId] also
 * invalidates fuller keys that share that prefix).
 *
 * Deterministic ordering for test stability.
 */
export function buildDiaryRemovalInvalidationKeys(
  meta: DiaryEntryRemovalMetadata,
): QueryKey[] {
  const keys: QueryKey[] = [];

  // Diary list — Timeline + simple diary-entries hook.
  keys.push(["diary_entries"]);

  // Plant Detail recent activity.
  const plantId = safeId(meta.plantId);
  if (plantId) {
    keys.push(["plant_recent_activity", plantId]);
  } else {
    keys.push(["plant_recent_activity"]);
  }

  // Tent Plant Roster recency + Tent Detail Activity Panels.
  if (plantId) {
    keys.push(["tent_plant_roster_activity", plantId]);
  } else {
    keys.push(["tent_plant_roster_activity"]);
  }

  // Timeline-derived caches (grouped, manual snapshot cards, memory).
  // These are scope-keyed; invalidate by prefix to cover all scopes
  // that could include this entry.
  keys.push(["quick_log_grouped_timeline"]);
  keys.push(["manual_snapshot_timeline_cards"]);
  keys.push(["timeline_memory"]);

  return keys;
}

function safeId(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
