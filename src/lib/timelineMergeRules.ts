/**
 * timelineMergeRules — pure helper that merges `diary_entries` and
 * `grow_events` into a single deterministic timeline source list.
 *
 * Pure, deterministic, no React, no Supabase, no I/O.
 *
 * Used by Timeline-style readers so legacy diary entries and Quick Log
 * v2 manual saves (which land in `grow_events`) render in a single
 * stable, newest-first stream without duplicates.
 *
 * Sort precedence (most important first):
 *   1. occurred timestamp descending (newest first)
 *   2. on exact timestamp ties → `grow_events` before `diary_entries`
 *      (Quick Log v2 is the live entry path)
 *   3. source_id lexical (ascending) fallback so output is stable
 *
 * Dedup rules:
 *   - Exact duplicate by `(source_table, source_id)` collapses to one entry.
 *   - Optional logical dedup: if both tables represent the same logical
 *     event (same `dedupKey`, e.g. a shared `grow_event_id` on a diary
 *     mirror row), only the `grow_events` row is kept.
 *
 * Missing fields:
 *   - Rows without an occurred timestamp are kept and sorted to the end.
 *   - Optional fields (note, photo, plant/tent/grow id, source, stage)
 *     are passed through as `null` when missing.
 */

// ---------------------------------------------------------------------------
// Input row shapes (loose by design — accept upstream variations)
// ---------------------------------------------------------------------------

export interface DiaryEntryRowInput {
  id: string;
  entry_at?: string | null;
  occurred_at?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  stage?: string | null;
  note?: string | null;
  photo_url?: string | null;
  details?: Record<string, unknown> | null;
  /** Optional logical link to a grow_events row (dedup key). */
  grow_event_id?: string | null;
}

export interface GrowEventRowInput {
  id: string;
  occurred_at?: string | null;
  entry_at?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  event_type?: string | null;
  note?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
}

export interface MergeTimelineSourcesInput {
  diaryEntries: ReadonlyArray<DiaryEntryRowInput>;
  growEvents: ReadonlyArray<GrowEventRowInput>;
}

// ---------------------------------------------------------------------------
// Output row shape — one unified entry
// ---------------------------------------------------------------------------

export type TimelineSourceTable = "diary_entries" | "grow_events";

export interface MergedTimelineEntry {
  /** Unique key safe for React lists: `${source_table}:${source_id}`. */
  key: string;
  source_table: TimelineSourceTable;
  source_id: string;
  /** ISO string of the occurred/entry time, or null if missing/invalid. */
  occurred_at: string | null;
  /** Epoch ms sort key, or null when occurred_at is missing/invalid. */
  occurred_epoch_ms: number | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  stage: string | null;
  event_type: string | null;
  note: string | null;
  photo_url: string | null;
  /** "live" | "manual" | "csv" | "demo" | "stale" | "invalid" | null. */
  source: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<TimelineSourceTable, number> = {
  // Higher = sorted earlier on tie.
  grow_events: 1,
  diary_entries: 0,
};

function safeEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function pickOccurredAt(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (typeof primary === "string" && primary.length > 0) return primary;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return null;
}

function normalizeDiaryRow(row: DiaryEntryRowInput): MergedTimelineEntry {
  const occurred_at = pickOccurredAt(row.entry_at, row.occurred_at);
  const details = row.details ?? null;
  const eventTypeFromDetails =
    details && typeof details === "object"
      ? (details["event_type"] as string | undefined) ?? null
      : null;
  const sourceFromDetails =
    details && typeof details === "object"
      ? (details["source"] as string | undefined) ?? null
      : null;
  return {
    key: `diary_entries:${row.id}`,
    source_table: "diary_entries",
    source_id: row.id,
    occurred_at,
    occurred_epoch_ms: safeEpoch(occurred_at),
    grow_id: row.grow_id ?? null,
    tent_id: row.tent_id ?? null,
    plant_id: row.plant_id ?? null,
    stage: row.stage ?? null,
    event_type: eventTypeFromDetails,
    note: row.note ?? null,
    photo_url: row.photo_url ?? null,
    source: sourceFromDetails,
  };
}

function normalizeGrowEventRow(row: GrowEventRowInput): MergedTimelineEntry {
  const occurred_at = pickOccurredAt(row.occurred_at, row.entry_at);
  return {
    key: `grow_events:${row.id}`,
    source_table: "grow_events",
    source_id: row.id,
    occurred_at,
    occurred_epoch_ms: safeEpoch(occurred_at),
    grow_id: row.grow_id ?? null,
    tent_id: row.tent_id ?? null,
    plant_id: row.plant_id ?? null,
    stage: null,
    event_type: row.event_type ?? null,
    note: row.note ?? null,
    photo_url: null,
    source: row.source ?? null,
  };
}

function compareMergedEntries(
  a: MergedTimelineEntry,
  b: MergedTimelineEntry,
): number {
  // 1) occurred timestamp descending; missing timestamps go last
  const aT = a.occurred_epoch_ms;
  const bT = b.occurred_epoch_ms;
  if (aT === null && bT === null) {
    // continue to tie-breakers below
  } else if (aT === null) {
    return 1;
  } else if (bT === null) {
    return -1;
  } else if (aT !== bT) {
    return bT - aT;
  }
  // 2) source priority — grow_events first on ties
  const ap = SOURCE_PRIORITY[a.source_table];
  const bp = SOURCE_PRIORITY[b.source_table];
  if (ap !== bp) return bp - ap;
  // 3) source_id lexical ascending
  if (a.source_id < b.source_id) return -1;
  if (a.source_id > b.source_id) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function mergeTimelineSources(
  input: MergeTimelineSourcesInput,
): MergedTimelineEntry[] {
  const normalized: MergedTimelineEntry[] = [];

  // grow_events first so logical dedup below prefers them
  const seenExact = new Set<string>();
  const claimedGrowEventIds = new Set<string>();

  for (const row of input.growEvents ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (row.is_deleted === true) continue;
    const entry = normalizeGrowEventRow(row);
    if (seenExact.has(entry.key)) continue;
    seenExact.add(entry.key);
    claimedGrowEventIds.add(entry.source_id);
    normalized.push(entry);
  }

  for (const row of input.diaryEntries ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    const entry = normalizeDiaryRow(row);
    if (seenExact.has(entry.key)) continue;
    // Logical dedup: drop the diary mirror row when a matching
    // grow_events row is already present.
    const logicalLink =
      typeof row.grow_event_id === "string" && row.grow_event_id.length > 0
        ? row.grow_event_id
        : null;
    if (logicalLink && claimedGrowEventIds.has(logicalLink)) continue;
    seenExact.add(entry.key);
    normalized.push(entry);
  }

  normalized.sort(compareMergedEntries);
  return normalized;
}
